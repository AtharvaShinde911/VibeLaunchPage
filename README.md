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

## Service email notifications

After a request is saved, the server emails `SERVICE_EMAIL` (default: `support@spartacantech.com`) with the phone number, reason, and request ID.

Add SMTP settings to `.env`:

```bash
SERVICE_EMAIL=support@spartacantech.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=support@spartacantech.com
SMTP_PASS=your-app-password
SMTP_FROM="Vibzee Website <support@spartacantech.com>"
```

For Gmail or Google Workspace:

1. Turn on 2-Step Verification for the sending account.
2. Create an [App Password](https://myaccount.google.com/apppasswords).
3. Use that 16-character password as `SMTP_PASS` (not the normal mailbox password).

The form still succeeds if email sending fails — MongoDB remains the source of truth. Check the server logs if a notification does not arrive.

## API

- `POST /api/delete-account-request` — save a deletion request (no account deletion is performed)
- `GET /api/health` — check MongoDB connection

## Deploy

Deploy this project as a Node.js app (Railway, Render, Fly.io, etc.) so both the static site and API run together. Set `MONGODB_URI` and the SMTP variables in your host's environment variables.

Static-only hosts (e.g. GitHub Pages) cannot run the form API without a separate backend.
