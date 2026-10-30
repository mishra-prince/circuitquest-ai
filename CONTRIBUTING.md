# Contributing

Use Node.js 22.12 or newer. Install with `npm ci` and start with `npm run dev`.

Keep PRs focused and include a description of the behavior changed. Run `npm test`, `npm run typecheck`, `npm run build`, and the browser suite (`npx playwright install chromium`, then `npm run test:e2e`). Browser fallback tests require no API key.

For model changes, include non-private example inputs and document whether inference was tested live. Add exhaustive Boolean tests for new operations. Preserve server-side secrets, strict circuit validation, fixed input limits, and clear demo/inference labels.

Do not commit `.env.local`, API keys, uploaded student documents, generated build folders, or dependencies. Report leaked credentials privately to the repository owner and revoke them immediately.
