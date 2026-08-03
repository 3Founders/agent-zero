import OpenAI from "openai";

// Prefer Replit's auto-injected AI Integration vars (free, no key needed on
// Replit). Off-platform (Vercel, etc.), fall back to a standard OPENAI_API_KEY
// pointed at any OpenAI-compatible endpoint — OpenAI itself, Sarvam
// (https://api.sarvam.ai/v1), etc.
const baseURL =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??
  process.env.OPENAI_BASE_URL ??
  "https://api.openai.com/v1";

const apiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error(
    "No OpenAI-compatible API key found. Set AI_INTEGRATIONS_OPENAI_API_KEY (on Replit, auto-provisioned) or OPENAI_API_KEY (everywhere else, e.g. Vercel).",
  );
}

export const openai = new OpenAI({ apiKey, baseURL });
