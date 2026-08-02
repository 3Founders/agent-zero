/**
 * WhatsApp Cloud API helpers.
 *
 * Covers:
 *  - Downloading media (PDF) by media_id
 *  - Sending text replies
 *
 * All calls use the WHATSAPP_ACCESS_TOKEN bearer token.
 */

import { logger } from "./logger.js";

const GRAPH_BASE = "https://graph.facebook.com/v19.0";

function accessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN is not set");
  return token;
}

function phoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");
  return id;
}

/**
 * Download a WhatsApp media file by its media_id.
 * Step 1: resolve the download URL from the media metadata endpoint.
 * Step 2: download the binary.
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<Buffer> {
  const token = accessToken();

  // Step 1: get the download URL
  const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    const text = await metaRes.text();
    throw new Error(
      `WhatsApp media metadata failed (${metaRes.status}): ${text}`,
    );
  }

  const meta = (await metaRes.json()) as { url: string };
  if (!meta.url) throw new Error("WhatsApp media metadata missing url field");

  // Step 2: download the binary
  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!fileRes.ok) {
    throw new Error(
      `WhatsApp media download failed (${fileRes.status})`,
    );
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Send a plain-text WhatsApp message to a recipient.
 * Retries once on 429 (rate limit) after a 2-second pause.
 */
export async function sendWhatsAppMessage(
  to: string,
  text: string,
  attempt = 1,
): Promise<void> {
  const token = accessToken();
  const pid = phoneNumberId();

  const res = await fetch(`${GRAPH_BASE}/${pid}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (res.status === 429 && attempt === 1) {
    logger.warn({ to }, "WhatsApp rate-limited, retrying in 2s");
    await new Promise((r) => setTimeout(r, 2000));
    return sendWhatsAppMessage(to, text, 2);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${body}`);
  }
}

/**
 * Normalise a phone number to E.164 format.
 * WhatsApp sends numbers without the leading '+' (e.g. "919876543210"),
 * so we prepend it if missing.
 */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}
