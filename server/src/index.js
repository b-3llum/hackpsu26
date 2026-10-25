import Stripe from "stripe";
import { mkdirSync } from "node:fs";
import { openDb } from "./db.js";
import { createApp } from "./app.js";
import { geminiLlm } from "./gemini.js";
import { elevenSpeech } from "./speech.js";
import { openChangeStore } from "./changes.js";
import { auth0Client } from "./auth0.js";

const env = process.env;
const required = ["PUBLIC_URL", "EXTENSION_ID", "GEMINI_API_KEY"];
for (const k of required) if (!env[k]) throw new Error(`Missing ${k}`);

const dataDir = env.DATA_DIR || new URL("../data", import.meta.url).pathname;
mkdirSync(dataDir, { recursive: true });

const billing = env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID && env.STRIPE_WEBHOOK_SECRET;
if (env.STRIPE_SECRET_KEY && /_live_/.test(env.STRIPE_SECRET_KEY) && env.ALLOW_LIVE_STRIPE !== "1") {
  throw new Error("Refusing to start with a live Stripe key. Use a test key, or set ALLOW_LIVE_STRIPE=1 on purpose.");
}

const app = createApp({
  db: openDb(`${dataDir}/consent.db`),
  config: {
    publicUrl: env.PUBLIC_URL,
    extensionId: env.EXTENSION_ID,
    stripePriceId: env.STRIPE_PRICE_ID,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    secureCookies: env.INSECURE_COOKIES !== "1",
    freePro: env.FREE_PRO === "1",
  },
  stripe: billing ? new Stripe(env.STRIPE_SECRET_KEY) : null,
  llm: () => geminiLlm({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined }),
  speech: elevenSpeech({ apiKey: env.ELEVENLABS_API_KEY, voiceId: env.ELEVENLABS_VOICE_ID || undefined, model: env.ELEVENLABS_MODEL || undefined }),
  changes: await openChangeStore(env.TIGER_DATABASE_URL).catch((e) => { console.error("Tiger Data unavailable:", e.message); return null; }),
  auth0: auth0Client({ domain: env.AUTH0_DOMAIN, clientId: env.AUTH0_CLIENT_ID, clientSecret: env.AUTH0_CLIENT_SECRET, redirectUri: `${env.PUBLIC_URL}/auth/callback` }),
});
const on = (k) => (env[k] ? "on" : "off");

const port = Number(env.PORT || 3000);
app.listen(port, "127.0.0.1", () => console.log(`consent-receipts server on 127.0.0.1:${port} (billing ${billing ? "on" : "off"}${env.FREE_PRO === "1" ? ", pro free for everyone" : ""}, listen ${on("ELEVENLABS_API_KEY")}, tracker ${on("TIGER_DATABASE_URL")}, google ${on("AUTH0_CLIENT_SECRET")})`));
