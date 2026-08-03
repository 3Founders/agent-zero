// Vercel requires serverless functions to live under a top-level /api
// directory. The actual bundled app lives in artifacts/api-server/dist
// (built by esbuild — see artifacts/api-server/build.mjs, "vercelHandler"
// entry point) — plain JS, no TypeScript, so Vercel's function builder
// doesn't try to type-check a monorepo-spanning import graph.
export { default } from "../artifacts/api-server/dist/vercelHandler.mjs";
