const path = require("path");
const express = require("express");
const { MongoClient } = require("mongodb");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const PORT = process.env.PORT || 3000;
const DB_NAME = process.env.MONGODB_DB_NAME || process.env.MONGODB_DB_BACKEND || "vibzee";
const COLLECTION_NAME = "account_deletion_requests";

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

    return res.status(201).json({
      ok: true,
      message: "Your deletion request has been received and saved. Our team will review it and process account deletion manually. Your account is not deleted automatically.",
      requestId: result.insertedId,
    });
  } catch (error) {
    console.error("Delete account request failed:", error.message);
    return res.status(500).json({
      ok: false,
      error: "Unable to submit your request right now. Please try again or email support@spartacantech.com.",
    });
  }
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

app.listen(PORT, () => {
  console.log(`Vibzee site running at http://localhost:${PORT}`);
  if (!MONGODB_URI) {
    console.warn("Warning: MONGODB_URI is not set. Form submissions will fail until configured.");
  }
});
