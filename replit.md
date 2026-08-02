# Agent 0 — WhatsApp Blood-Report Extraction Bot

Receives Thyrocare blood-test PDFs over WhatsApp (or from a Google Drive folder), extracts structured lab-result rows with an LLM, upserts them into a shared Google Sheet, and replies to the participant with a summary. Built for a gut-health clinical trial (probiotic/microbiome, ~30–100 participants tracking HbA1C, lipid panels, CBC, etc.).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- LLM: OpenAI via Replit AI Integrations (no API key required)
- PDF extraction: pdf-parse + tesseract.js OCR fallback
- WhatsApp: Meta WhatsApp Cloud API (v19.0)

## Where things live

- `artifacts/api-server/src/routes/whatsapp.ts` — webhook GET (challenge) + POST (message handler)
- `artifacts/api-server/src/lib/whatsappClient.ts` — download media, send messages, normalise phone
- `artifacts/api-server/src/lib/extractPdf.ts` — pdf-parse + tesseract.js OCR fallback
- `artifacts/api-server/src/lib/extractLabResults.ts` — OpenAI LLM extraction → `[{ field, value, unit, referenceRange }]`
- `artifacts/api-server/src/lib/extractionStore.ts` — in-memory result store (Task 2 drains this into Google Sheets)
- `lib/integrations-openai-ai-server/` — pre-configured OpenAI SDK client

## Required Secrets / Env Vars

| Key | Purpose |
|-----|---------|
| `WHATSAPP_VERIFY_TOKEN` | Meta webhook hub-challenge token (you choose this value) |
| `WHATSAPP_APP_SECRET` | Meta App Secret (for X-Hub-Signature-256 verification) |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API bearer token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number ID |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Auto-set by Replit AI integration |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Auto-set by Replit AI integration |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Base64-encoded service account JSON (Task 2) |
| `GOOGLE_SHEET_ID` | Target Google Spreadsheet ID (Task 2) |
| `GOOGLE_DRIVE_FOLDER_ID` | Shared Drive folder to watch for PDFs (Task 3) |

## Architecture decisions

- **Async PDF pipeline**: webhook POST returns 200 immediately to Meta, then processes the PDF asynchronously — prevents Meta retries on slow OCR/LLM calls.
- **X-Hub-Signature-256**: raw body captured via `express.json()` `verify` callback before JSON parsing; signature check skipped gracefully in dev if `WHATSAPP_APP_SECRET` is unset.
- **OCR fallback threshold**: pages with < 50 extracted characters trigger Tesseract; Thyrocare PDFs are digital so OCR rarely fires in practice.
- **LLM model**: `gpt-5.6-luna` (cost-effective for high-volume extraction); system prompt explicitly forbids hallucination and requires null for missing values.
- **Extraction store**: in-memory Map keyed by `messageId`; Task 2 drains it into Google Sheets via `getPendingResults()`.

## Product

- Participants send blood-test PDFs via WhatsApp → bot extracts markers → writes to master Google Sheet → replies with summary + link.
- Google Drive folder also watched for new PDFs (Task 3).
- No signup, app, or web login required.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- pnpm workspace: server deps go in `dependencies`, build tools in `devDependencies`; never use `console.log` — use `req.log` in route handlers or `logger` singleton.
- `pdf-parse` is CJS; imported via `createRequire` inside the ESM api-server.
- `tesseract.js` OCR downloads language data on first use (needs internet).
- Always run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` — lib declarations must be built first.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
