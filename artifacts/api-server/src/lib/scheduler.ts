/**
 * Dose-reminder scheduler.
 *
 * Sends a morning and evening WhatsApp message to all active participants
 * at the configured times (default 08:00 and 20:00 IST).
 *
 * Environment variables:
 *   REMINDER_MORNING_TIME  — "HH:MM" in TRIAL_TIMEZONE (default "08:00")
 *   REMINDER_EVENING_TIME  — "HH:MM" in TRIAL_TIMEZONE (default "20:00")
 *   TRIAL_TIMEZONE         — IANA timezone name (default "Asia/Kolkata")
 *
 * Fires via setInterval every 60 seconds.  A Set tracks which (date, slot)
 * pairs have already been dispatched so each reminder fires at most once per day.
 */

import { logger } from "./logger.js";
import { sendWhatsAppMessage } from "./whatsappClient.js";
import { getActiveParticipants } from "./demographicsSheet.js";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReminderSlot = "morning" | "evening";

const MORNING_MESSAGE =
  "Good morning! Did you take your *morning probiotic dose* today?\n\nReply *yes*, *no*, or *skip*.";
const EVENING_MESSAGE =
  "Good evening! Did you take your *evening probiotic dose* today?\n\nReply *yes*, *no*, or *skip*.";

// ─── Config helpers ───────────────────────────────────────────────────────────

function getTimezone(): string {
  return process.env.TRIAL_TIMEZONE ?? "Asia/Kolkata";
}

function parseTime(envVar: string, defaultValue: string): { h: number; m: number } {
  const raw = process.env[envVar] ?? defaultValue;
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    logger.warn(
      { envVar, value: raw },
      `Invalid time format for ${envVar} — expected HH:MM. Using default ${defaultValue}.`,
    );
    const [dh, dm] = defaultValue.split(":").map(Number);
    return { h: dh, m: dm };
  }
  return { h: Number(m[1]), m: Number(m[2]) };
}

/** Return the current hour and minute in the trial timezone. */
function nowInTimezone(tz: string): { h: number; m: number; dateStr: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );

  return {
    h: Number(parts.hour),
    m: Number(parts.minute),
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

// ─── Dispatch tracker ─────────────────────────────────────────────────────────

/** Prevent double-sending within the same day. Key: "YYYY-MM-DD:slot" */
const dispatched = new Set<string>();

function markDispatched(dateStr: string, slot: ReminderSlot): void {
  dispatched.add(`${dateStr}:${slot}`);
}

function isDispatched(dateStr: string, slot: ReminderSlot): boolean {
  return dispatched.has(`${dateStr}:${slot}`);
}

// Prune old entries once a day to avoid unbounded growth (keep last 2 days)
function pruneDispatched(todayStr: string): void {
  for (const key of dispatched) {
    const keyDate = key.slice(0, 10);
    if (keyDate < todayStr) dispatched.delete(key);
  }
}

// ─── Reminder dispatch ────────────────────────────────────────────────────────

async function sendReminders(slot: ReminderSlot): Promise<void> {
  const participants = getActiveParticipants();
  const message = slot === "morning" ? MORNING_MESSAGE : EVENING_MESSAGE;

  if (participants.length === 0) {
    logger.info({ slot }, "No active participants — skipping reminder dispatch");
    return;
  }

  logger.info({ slot, count: participants.length }, "Sending dose reminders");

  const results = await Promise.allSettled(
    participants.map((id) => sendWhatsAppMessage(id, message)),
  );

  let sent = 0;
  let failed = 0;
  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled") {
      sent++;
    } else {
      failed++;
      logger.warn(
        { participantId: participants[i], err: result.reason, slot },
        "Failed to send dose reminder",
      );
    }
  }

  logger.info({ slot, sent, failed }, "Dose reminder dispatch complete");
}

// ─── Scheduler tick ───────────────────────────────────────────────────────────

function tick(): void {
  const tz = getTimezone();
  const morning = parseTime("REMINDER_MORNING_TIME", "08:00");
  const evening = parseTime("REMINDER_EVENING_TIME", "20:00");
  const now = nowInTimezone(tz);

  pruneDispatched(now.dateStr);

  const slots: Array<{ slot: ReminderSlot; target: { h: number; m: number } }> =
    [
      { slot: "morning", target: morning },
      { slot: "evening", target: evening },
    ];

  for (const { slot, target } of slots) {
    if (
      now.h === target.h &&
      now.m === target.m &&
      !isDispatched(now.dateStr, slot)
    ) {
      markDispatched(now.dateStr, slot);
      sendReminders(slot).catch((err: unknown) => {
        logger.error({ err, slot }, "Unhandled error in reminder dispatch");
      });
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

let _intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Start the reminder scheduler.
 * Ticks every 60 seconds and fires reminders at the configured times.
 * Safe to call multiple times — only one interval is created.
 */
export function startReminderScheduler(): void {
  if (_intervalId !== null) return;

  const tz = getTimezone();
  const morning = parseTime("REMINDER_MORNING_TIME", "08:00");
  const evening = parseTime("REMINDER_EVENING_TIME", "20:00");

  logger.info(
    {
      timezone: tz,
      morning: `${String(morning.h).padStart(2, "0")}:${String(morning.m).padStart(2, "0")}`,
      evening: `${String(evening.h).padStart(2, "0")}:${String(evening.m).padStart(2, "0")}`,
    },
    "Dose reminder scheduler started",
  );

  _intervalId = setInterval(tick, 60_000);

  // Run once immediately so a restart right at reminder time doesn't miss it
  tick();
}

/**
 * Stop the scheduler (useful for tests or graceful shutdown).
 */
export function stopReminderScheduler(): void {
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
    logger.info("Dose reminder scheduler stopped");
  }
}

/**
 * Stop and restart the scheduler. Called by the setup wizard after
 * WhatsApp credentials are saved via the config store.
 */
export function restartReminderScheduler(): void {
  stopReminderScheduler();
  startReminderScheduler();
}

export interface SchedulerStatus {
  running: boolean;
  timezone: string;
  morningTime: string;
  eveningTime: string;
  activeParticipantCount: number;
}

export function getSchedulerStatus(): SchedulerStatus {
  const tz = getTimezone();
  const morning = parseTime("REMINDER_MORNING_TIME", "08:00");
  const evening = parseTime("REMINDER_EVENING_TIME", "20:00");
  const fmt = (t: { h: number; m: number }) =>
    `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}`;
  return {
    running: _intervalId !== null,
    timezone: tz,
    morningTime: fmt(morning),
    eveningTime: fmt(evening),
    activeParticipantCount: getActiveParticipants().length,
  };
}
