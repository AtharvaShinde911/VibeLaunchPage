# Vibzee Website

Marketing site for Vibzee with a delete-account request form backed by MongoDB. The form **only stores requests** for manual review — it does not delete accounts or user data.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and add your MongoDB credentials:

```bash
cp .env.example .env
```

3. Start the **Node server** (required for the delete-account form — do not use `python3 -m http.server`):

```bash
npm start
```

Open `http://localhost:8080` (or the port set in `.env`) and visit **Delete Account** to test the form.

## MongoDB setup

Submissions are saved to:

- **Database:** `proddb` (or value of `MONGODB_DB_BACKEND` / `MONGODB_DB_NAME`)
- **Collection:** `account_deletion_requests`

Each document contains:

```json
{
  "phone": "9876543210",
  "reason": "...",
  "requestType": "account_deletion",
  "actionTaken": false,
  "source": "website",
  "createdAt": "2026-09-01T14:30:00.000Z"
}
```

In MongoDB Atlas:

1. Create a database user with read/write access.
2. Allow your server IP in **Network Access** (or `0.0.0.0/0` for testing).
3. Copy the connection string into `MONGODB_URI` in `.env`.

The collection is created automatically on the first form submission.

## API

- `POST /api/delete-account-request` — save a deletion request (no account deletion is performed)
- `GET /api/health` — check MongoDB connection

## Deploy

Deploy this project as a Node.js app (Railway, Render, Fly.io, etc.) so both the static site and API run together. Set `MONGODB_URI` in your host's environment variables.

Static-only hosts (e.g. GitHub Pages) cannot run the form API without a separate backend.
