/**
 * In-memory conversation state machine for the participant demographics questionnaire.
 *
 * Each participant progresses through a fixed sequence of steps.
 * State lives only in process memory — if the server restarts, participants
 * will need to start over (acceptable for a low-volume clinical trial).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuestionnaireStep =
  | "dob"
  | "height"
  | "weight"
  | "waist"
  | "bp"
  | "medications"
  | "surgical_history";

export const QUESTIONNAIRE_STEPS: QuestionnaireStep[] = [
  "dob",
  "height",
  "weight",
  "waist",
  "bp",
  "medications",
  "surgical_history",
];

export interface DemographicsAnswers {
  dob: string;
  height: string;
  weight: string;
  waist: string;
  bp: string;
  medications: string;
  surgical_history: string;
}

export interface QuestionnaireState {
  step: QuestionnaireStep;
  answers: Partial<DemographicsAnswers>;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

export const STEP_PROMPTS: Record<QuestionnaireStep, string> = {
  dob: "1️⃣ What is your *date of birth*? (e.g. 15 Jan 1980)",
  height: "2️⃣ What is your *height* in cm? (e.g. 165)",
  weight: "3️⃣ What is your *weight* in kg? (e.g. 72)",
  waist: "4️⃣ What is your *waist circumference* in cm? (e.g. 88)",
  bp: '5️⃣ What is your *blood pressure*? (e.g. 120/80)\nIf unknown, reply "unknown".',
  medications:
    '6️⃣ Are you currently taking any *medications*? List them separated by commas, or reply "none".',
  surgical_history:
    '7️⃣ Do you have any *surgical history*? Briefly describe, or reply "none".',
};

export const INTRO_MESSAGE =
  "👋 Welcome to the probiotic trial!\n\n" +
  "I'll guide you through a short health questionnaire — 7 questions. " +
  "Your answers will be stored securely for the study team.\n\n" +
  "Reply *CANCEL* at any time to stop.\n\n" +
  STEP_PROMPTS["dob"];

export const COMPLETION_MESSAGE =
  "✅ Thank you! Your health information has been recorded.\n\n" +
  "You'll receive a dose reminder each morning and evening. " +
  'Reply *yes*, *no*, or *skip* to log each dose.';

// ─── State store ──────────────────────────────────────────────────────────────

/** participantId → current questionnaire state */
const states = new Map<string, QuestionnaireState>();

// ─── API ──────────────────────────────────────────────────────────────────────

export function isInQuestionnaire(participantId: string): boolean {
  return states.has(participantId);
}

export function startQuestionnaire(participantId: string): void {
  states.set(participantId, { step: "dob", answers: {} });
}

export function cancelQuestionnaire(participantId: string): void {
  states.delete(participantId);
}

/**
 * Record the answer for the current step and advance to the next one.
 *
 * Returns:
 *   - `{ done: false; nextStep: QuestionnaireStep }` — questionnaire continues
 *   - `{ done: true; answers: DemographicsAnswers }` — questionnaire complete
 */
export function advanceQuestionnaire(
  participantId: string,
  answer: string,
):
  | { done: false; nextStep: QuestionnaireStep }
  | { done: true; answers: DemographicsAnswers } {
  const state = states.get(participantId);
  if (!state) throw new Error(`No active questionnaire for ${participantId}`);

  // Store the answer for the current step
  state.answers[state.step] = answer.trim();

  const currentIndex = QUESTIONNAIRE_STEPS.indexOf(state.step);
  const nextStep = QUESTIONNAIRE_STEPS[currentIndex + 1];

  if (nextStep === undefined) {
    // All steps complete — return collected answers
    const answers = state.answers as DemographicsAnswers;
    states.delete(participantId);
    return { done: true, answers };
  }

  state.step = nextStep;
  return { done: false, nextStep };
}
