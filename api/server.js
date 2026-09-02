const path = require("path");
const express = require("express");
const nodemailer = require("nodemailer");
const { MongoClient } = require("mongodb");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// SITE_PORT wins so a shell PORT=8081 from Metro does not bind this site.
const PORT = Number(process.env.SITE_PORT || process.env.PORT || 3000);
const DB_NAME = process.env.MONGODB_DB_NAME || process.env.MONGODB_DB_BACKEND || "vibzee";
const COLLECTION_NAME = "account_deletion_requests";
const SERVICE_EMAIL = process.env.SERVICE_EMAIL || "support@spartacantech.com";

function getMongoUri() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI;
  }

  const host = process.env.MONGODB_HOST;
  const user = process.env.MONGODB_USER;
  const password = process.env.MONGODB_PASSWORD;

  if (host && user && password) {
    return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}`;
  }

  return null;
}

const MONGODB_URI = getMongoUri();

// This API only stores deletion requests for manual review.
// It does not delete user accounts or data from the app/backend.

const app = express();
const rootDir = path.join(__dirname, "..");

app.use(express.json({ limit: "16kb" }));
app.use(express.static(rootDir));

let mongoClient;

async function getCollection() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
  }

  return mongoClient.db(DB_NAME).collection(COLLECTION_NAME);
}

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getMailer() {
  if (!isSmtpConfigured()) {
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function notifyServiceEmail({ phone, reason, requestId, createdAt }) {
  const transporter = getMailer();
  if (!transporter) {
    console.warn("SMTP is not configured. Skipping service notification email.");
    return false;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const submittedAt = new Date(createdAt).toUTCString();

  await transporter.sendMail({
    from,
    to: SERVICE_EMAIL,
    subject: `Account deletion request — ${phone}`,
    text: [
      "A new account deletion request was submitted on the Vibzee website.",
      "",
      `Phone: ${phone}`,
      `Reason: ${reason}`,
      `Request ID: ${requestId}`,
      `Submitted at: ${submittedAt}`,
      "",
      "This is a notification only. The request has been saved for manual review. No account has been deleted.",
    ].join("\n"),
    html: `
      <p>A new account deletion request was submitted on the Vibzee website.</p>
      <ul>
        <li><strong>Phone:</strong> ${escapeHtml(phone)}</li>
        <li><strong>Reason:</strong> ${escapeHtml(reason)}</li>
        <li><strong>Request ID:</strong> ${escapeHtml(String(requestId))}</li>
        <li><strong>Submitted at:</strong> ${escapeHtml(submittedAt)}</li>
      </ul>
      <p>This is a notification only. The request has been saved for manual review. No account has been deleted.</p>
    `,
  });

  return true;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function validatePayload(body) {
  const phone = normalizePhone(body.phone);
  const reason = String(body.reason || "").trim();

  if (!phone || phone.length < 10 || phone.length > 15) {
    return { error: "Please enter a valid phone number (10–15 digits)." };
  }

  if (!reason || reason.length < 10 || reason.length > 1000) {
    return { error: "Please provide a reason for deletion (10–1000 characters)." };
  }

  return { phone, reason };
}

app.post("/api/delete-account-request", async (req, res) => {
  if (req.body.website) {
    return res.status(400).json({ ok: false, error: "Unable to submit request." });
  }

  const validated = validatePayload(req.body);
  if (validated.error) {
    return res.status(400).json({ ok: false, error: validated.error });
  }

  try {
    const collection = await getCollection();
    const document = {
      phone: validated.phone,
      reason: validated.reason,
      requestType: "account_deletion",
      actionTaken: false,
      source: "website",
      createdAt: new Date().toISOString(),
    };

    const result = await collection.insertOne(document);

    try {
      await notifyServiceEmail({
        phone: validated.phone,
        reason: validated.reason,
        requestId: result.insertedId,
        createdAt: document.createdAt,
      });
    } catch (emailError) {
      console.error("Service notification email failed:", emailError.message);
    }

    return res.status(201).json({
      ok: true,
      message: "Your deletion request has been received and saved. Our team will review it and process account deletion manually. Your account is not deleted automatically.",
      requestId: result.insertedId,
      phone: document.phone,
      reason: document.reason,
    });
  } catch (error) {
    console.error("Delete account request failed:", error.message);
    return res.status(500).json({
      ok: false,
      error: "Unable to submit your request right now. Please try again or email support@spartacantech.com.",
    });
  }
});

app.get("/api/emailjs-config", (_req, res) => {
  const publicKey = process.env.YOUR_PUBLIC_KEY;
  const serviceId = process.env.YOUR_SERVICE_ID;
  const templateId = process.env.YOUR_TEMPLATE_ID;

  if (!publicKey || !serviceId || !templateId) {
    return res.status(503).json({
      ok: false,
      error: "EmailJS is not configured.",
    });
  }

  return res.json({
    ok: true,
    publicKey,
    serviceId,
    templateId,
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    if (!MONGODB_URI) {
      return res.status(503).json({ ok: false, mongo: "not_configured" });
    }

    const collection = await getCollection();
    await collection.estimatedDocumentCount();
    return res.json({ ok: true, mongo: "connected", collection: COLLECTION_NAME });
  } catch (error) {
    console.error("Health check failed:", error.message);
    return res.status(503).json({ ok: false, mongo: "error" });
  }
});

process.on("SIGINT", async () => {
  if (mongoClient) {
    await mongoClient.close();
  }
  process.exit(0);
});

const server = app.listen(PORT, () => {
  console.log(`Vibzee site running at http://localhost:${PORT}`);
  if (!MONGODB_URI) {
    console.warn("Warning: MONGODB_URI is not set. Form submissions will fail until configured.");
  }
  if (!isSmtpConfigured()) {
    console.warn("Warning: SMTP is not set. Deletion requests will be saved, but no service email will be sent.");
  } else {
    console.log(`Service notification email: ${SERVICE_EMAIL}`);
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Set SITE_PORT in .env to a free port, then restart.`);
    process.exit(1);
  }
  throw error;
});
