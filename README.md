# CollabDesk

CollabDesk helps Aanya review creator-brand emails, price collaborations from her media kit, draft replies, and track deals. The backend is a local Node + Hono API backed by `server/data/db.json`; it does not require a database server or account integrations.

## Run locally

1. Install dependencies with `npm install`.
2. To enable live parsing and reply drafting, export `OPENAI_API_KEY` in your shell. The app uses `gpt-4o-mini`; the demo still works without a key through deterministic offline fallbacks.
3. Start the API and frontend with `npm run dev`. The API listens on port 3001 and Vite on port 5173.

Demo path: **Inbox → Café Ramwadi → Parse → Counter → move to Negotiating**.

Rates and lowball decisions are computed in code. The model only extracts email details and writes reply text; it cannot change the suggested fee.
