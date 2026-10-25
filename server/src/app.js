import express from "express";
import { fileURLToPath } from "node:url";
import { summarize } from "../../extension/lib/summary/summarize.js";
import { hashPassword, verifyPassword, DUMMY_HASH, createSession, userForToken, deleteSession, parseCookies, sha256, SESSION_TTL } from "./auth.js";
import { rateLimiter } from "./ratelimit.js";
import { receiptScript } from "./speech.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_POLICY_CHARS = 60000;
const PRO_STATUSES = new Set(["active", "trialing"]);

/**
 * @param {object} o
 * @param {import("node:sqlite").DatabaseSync} o.db
 * @param {{ publicUrl: string, extensionId: string, stripePriceId: string, stripeWebhookSecret: string, secureCookies?: boolean }} o.config
 * @param {object|null} o.stripe Stripe client, or null when billing is not configured
 * @param {(() => ((prompt: string) => Promise<string>) | null)} o.llm returns the Gemini function for summaries
 * @param {((text: string) => Promise<Buffer>) | null} [o.speech] ElevenLabs text to speech, or null
 * @param {object|null} [o.changes] Tiger Data change store (see changes.js), or null
 * @param {object|null} [o.auth0] Auth0 client (see auth0.js), or null
 */
export function createApp({ db, config, stripe, llm, speech = null, changes = null, auth0 = null }) {
  const app = express();
  const origin = new URL(config.publicUrl).origin;
  const extensionOrigin = `chrome-extension://${config.extensionId}`;
  const cookieFlags = `Path=/; HttpOnly; SameSite=Lax${config.secureCookies === false ? "" : "; Secure"}`;

  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  const clientIp = (req) => req.get("cf-connecting-ip") || req.ip;

  app.use((req, res, next) => {
    res.set({
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security": "max-age=31536000",
    });
    next();
  });

  // Stripe needs the raw body to check the signature, so this route comes before the JSON parser.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Billing is not configured." });
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.get("stripe-signature"), config.stripeWebhookSecret);
    } catch {
      return res.status(400).json({ error: "Bad signature." });
    }
    if (db.prepare("SELECT 1 FROM stripe_events WHERE id = ?").get(event.id)) return res.json({ received: true });
    try {
      await handleStripeEvent(event);
      db.prepare("INSERT INTO stripe_events (id, created_at) VALUES (?, ?)").run(event.id, Date.now());
      res.json({ received: true });
    } catch (e) {
      console.error("stripe webhook", event.type, e);
      res.status(500).json({ error: "Webhook handler failed." });
    }
  });

  app.use(express.json({ limit: "512kb" }));

  // CSRF: state changing API calls must be JSON (a cross site form cannot send that without a CORS preflight,
  // which we never allow) and, when the browser sends an Origin, it must be ours or the extension's.
  app.use("/api", (req, res, next) => {
    if (req.method === "GET") return next();
    if (!req.is("application/json")) return res.status(415).json({ error: "Send JSON." });
    const o = req.get("origin");
    if (o && o !== origin && o !== extensionOrigin) return res.status(403).json({ error: "Bad origin." });
    next();
  });

  const loginLimit = rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });
  const signupLimit = rateLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
  const summaryLimit = rateLimiter({ windowMs: 60 * 60 * 1000, max: 120 });
  const listenLimit = rateLimiter({ windowMs: 60 * 60 * 1000, max: 60 });
  const changeLimit = rateLimiter({ windowMs: 60 * 60 * 1000, max: 200 });
  const FREE_LISTENS_PER_DAY = 3;

  const webUser = (req) => userForToken(db, parseCookies(req.get("cookie")).sid, "web");
  const bearer = (req) => (req.get("authorization") || "").replace(/^Bearer\s+/i, "") || null;
  const extUser = (req) => userForToken(db, bearer(req), "extension");
  const requireWeb = (req, res, next) => {
    req.user = webUser(req);
    return req.user ? next() : res.status(401).json({ error: "Please log in." });
  };
  const requireExt = (req, res, next) => {
    req.user = extUser(req);
    return req.user ? next() : res.status(401).json({ error: "Please sign in from the extension." });
  };
  const publicUser = (u) => ({
    name: u.name,
    email: u.email,
    plan: u.plan,
    status: u.subscription_status,
    currentPeriodEnd: u.current_period_end,
    cancelAtPeriodEnd: Boolean(u.cancel_at_period_end),
  });
  const setSessionCookie = (res, token) =>
    res.append("Set-Cookie", `sid=${token}; ${cookieFlags}; Max-Age=${SESSION_TTL.web / 1000}`);

  app.get("/api/config", (req, res) => res.json({
    extensionId: config.extensionId,
    billing: Boolean(stripe),
    google: Boolean(auth0),
    listen: Boolean(speech),
    tracker: Boolean(changes),
  }));

  app.post("/api/signup", async (req, res) => {
    if (!signupLimit.hit(clientIp(req))) return res.status(429).json({ error: "Too many sign ups from this network. Try again later." });
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const errors = {};
    if (!name || name.length > 100) errors.name = "Enter your name.";
    if (!EMAIL.test(email) || email.length > 254) errors.email = "Enter a valid email address.";
    if (password.length < 12 || password.length > 128) errors.password = "Use 12 to 128 characters.";
    if (req.body?.acceptTerms !== true) errors.acceptTerms = "Accept the Terms of Service and Privacy Policy to continue.";
    if (Object.keys(errors).length) return res.status(400).json({ error: "Check the highlighted fields.", fields: errors });
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      return res.status(409).json({ error: "An account with this email already exists. Log in instead.", fields: { email: "Already registered." } });
    }
    const hash = await hashPassword(password);
    const { lastInsertRowid } = db.prepare("INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(email, name, hash, Date.now());
    setSessionCookie(res, createSession(db, Number(lastInsertRowid), "web"));
    res.status(201).json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(lastInsertRowid)) });
  });

  app.post("/api/login", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!loginLimit.hit(`${clientIp(req)}|${email}`)) return res.status(429).json({ error: "Too many attempts. Wait a few minutes and try again." });
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    const ok = await verifyPassword(String(req.body?.password || ""), user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ error: "Email or password is incorrect." });
    setSessionCookie(res, createSession(db, user.id, "web"));
    res.json({ user: publicUser(user) });
  });

  app.post("/api/logout", (req, res) => {
    deleteSession(db, parseCookies(req.get("cookie")).sid);
    res.append("Set-Cookie", `sid=; ${cookieFlags}; Max-Age=0`);
    res.json({ ok: true });
  });

  app.get("/api/me", requireWeb, (req, res) => res.json({ user: publicUser(req.user) }));

  app.post("/api/billing/checkout", requireWeb, async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Billing is not configured yet." });
    if (req.user.plan === "pro") return res.status(409).json({ error: "You already have Pro." });
    const customer = await ensureCustomer(req.user);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: String(req.user.id),
      line_items: [{ price: config.stripePriceId, quantity: 1 }],
      success_url: `${origin}/account?checkout=success`,
      cancel_url: `${origin}/account?checkout=cancel`,
    });
    res.json({ url: session.url });
  });

  app.post("/api/billing/portal", requireWeb, async (req, res) => {
    if (!stripe) return res.status(503).json({ error: "Billing is not configured yet." });
    if (!req.user.stripe_customer_id) return res.status(400).json({ error: "No billing account yet." });
    const session = await stripe.billingPortal.sessions.create({ customer: req.user.stripe_customer_id, return_url: `${origin}/account` });
    res.json({ url: session.url });
  });

  // The account page asks for an extension token and hands it to the extension with chrome.runtime.sendMessage.
  app.post("/api/extension/token", requireWeb, (req, res) => {
    res.json({ token: createSession(db, req.user.id, "extension"), user: publicUser(req.user) });
  });

  app.get("/api/extension/me", requireExt, (req, res) => res.json({ user: publicUser(req.user) }));

  app.post("/api/extension/logout", (req, res) => {
    deleteSession(db, bearer(req));
    res.json({ ok: true });
  });

  // Pro summaries. Summaries are cached per policy text, so we never store who read which policy.
  app.post("/api/summarize", requireExt, async (req, res) => {
    if (req.user.plan !== "pro") return res.status(402).json({ error: "AI summaries are part of Pro.", plan: req.user.plan });
    const text = String(req.body?.text || "");
    const mode = req.body?.mode === "finance" ? "finance" : "general";
    if (!text.trim()) return res.status(400).json({ error: "No policy text." });
    if (text.length > MAX_POLICY_CHARS) return res.status(413).json({ error: "Policy text is too long." });
    const key = sha256(`${mode}\n${text}`);
    const cached = db.prepare("SELECT summary FROM summary_cache WHERE key = ?").get(key);
    if (cached) return res.json({ summary: JSON.parse(cached.summary), cached: true });
    if (!summaryLimit.hit(String(req.user.id))) return res.status(429).json({ error: "Hourly summary limit reached." });
    const summary = await summarize(text, { mode, llm: llm() });
    if (summary.engine === "ai") {
      db.prepare("INSERT OR REPLACE INTO summary_cache (key, summary, created_at) VALUES (?, ?, ?)").run(key, JSON.stringify(summary), Date.now());
    }
    res.json({ summary, cached: false });
  });

  // ElevenLabs: read a receipt aloud. 3 listens a day on Free, unlimited (rate limited) on Pro. Audio is cached per script.
  app.post("/api/speak", requireExt, async (req, res) => {
    if (!speech) return res.status(503).json({ error: "Listening is not available right now." });
    const script = receiptScript(req.body?.summary);
    const key = sha256(script);
    const pro = req.user.plan === "pro";
    if (!listenLimit.hit(String(req.user.id))) return res.status(429).json({ error: "Too many listens this hour." });
    const day = new Date().toISOString().slice(0, 10);
    if (!pro) {
      const used = db.prepare("SELECT count FROM listen_usage WHERE user_id = ? AND day = ?").get(req.user.id, day)?.count || 0;
      if (used >= FREE_LISTENS_PER_DAY) return res.status(402).json({ error: `Free accounts get ${FREE_LISTENS_PER_DAY} listens a day. Upgrade to Pro for unlimited.`, plan: "free" });
    }
    let mp3 = db.prepare("SELECT mp3 FROM audio_cache WHERE key = ?").get(key)?.mp3;
    if (!mp3) {
      try {
        mp3 = await speech(script);
      } catch (e) {
        console.error("speech", e.message);
        return res.status(502).json({ error: "Listening is not available right now. Try again in a minute." });
      }
      db.prepare("INSERT OR REPLACE INTO audio_cache (key, mp3, created_at) VALUES (?, ?, ?)").run(key, mp3, Date.now());
    }
    // Only listens that play count toward the free limit.
    if (!pro) db.prepare("INSERT INTO listen_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1").run(req.user.id, day);
    res.set({ "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" }).send(Buffer.from(mp3));
  });

  // Tiger Data: anonymous terms change events. Signed in extensions report; anyone can read the tracker.
  app.post("/api/changes", requireExt, async (req, res) => {
    if (!changes) return res.status(503).json({ error: "The change tracker is not available right now." });
    if (!changeLimit.hit(String(req.user.id))) return res.status(429).json({ error: "Too many reports." });
    const { url, hashAfter, riskBefore, riskAfter, added, removed } = req.body || {};
    let u;
    try { u = new URL(String(url)); } catch { return res.status(400).json({ error: "Bad URL." }); }
    if (!/^https?:$/.test(u.protocol) || !hashAfter) return res.status(400).json({ error: "Bad change report." });
    // Only public sites go on the public tracker: no localhost, IP addresses, or single label hosts (demo pages, intranets).
    if (!u.hostname.includes(".") || /^[\d.]+$|^\[|:/.test(u.hostname) || /(^|\.)(localhost|local|internal|lan)$/.test(u.hostname)) {
      return res.json({ changes90d: null, skipped: "not a public site" });
    }
    const changes90d = await changes.record({ url: u.toString(), hashAfter, riskBefore, riskAfter, added: Number(added), removed: Number(removed) });
    res.json({ changes90d });
  });

  app.get("/api/changes", async (req, res) => {
    if (!changes) return res.status(503).json({ error: "The change tracker is not available right now." });
    res.set("Cache-Control", "public, max-age=60").json(await changes.recent());
  });

  app.get("/api/changes/count", async (req, res) => {
    if (!changes) return res.status(503).json({ error: "The change tracker is not available right now." });
    let u;
    try { u = new URL(String(req.query.url)); } catch { return res.status(400).json({ error: "Bad URL." }); }
    res.json({ changes90d: await changes.countForUrl(u.toString()) });
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

  // Auth0: "Continue with Google". Same account as email sign up when the email is verified and matches.
  const nextPath = (n) => (/^\/(?!\/)[\w\-/?=&.]*$/.test(String(n || "")) ? String(n) : "/account");
  app.get("/auth/google", (req, res) => {
    if (!auth0) return res.redirect("/login?error=google");
    const { url, state, verifier } = auth0.start();
    const next = req.query.ext === "1" ? "/account?connect=1" : nextPath(req.query.next);
    db.prepare("DELETE FROM oauth_states WHERE created_at < ?").run(Date.now() - 10 * 60 * 1000);
    db.prepare("INSERT INTO oauth_states (state, verifier, next, created_at) VALUES (?, ?, ?, ?)").run(state, verifier, next, Date.now());
    res.redirect(url);
  });

  app.get("/auth/callback", async (req, res) => {
    const fail = () => res.redirect("/login?error=google");
    if (!auth0 || req.query.error || !req.query.code || !req.query.state) return fail();
    const row = db.prepare("SELECT * FROM oauth_states WHERE state = ?").get(String(req.query.state));
    db.prepare("DELETE FROM oauth_states WHERE state = ?").run(String(req.query.state));
    if (!row || row.created_at < Date.now() - 10 * 60 * 1000) return fail();
    let profile;
    try { profile = await auth0.finish(String(req.query.code), row.verifier); } catch (e) { console.error("auth0", e.message); return fail(); }
    if (!profile.emailVerified || !EMAIL.test(profile.email)) return res.redirect("/login?error=unverified");
    let user = db.prepare("SELECT * FROM users WHERE auth0_sub = ?").get(profile.sub)
      || db.prepare("SELECT * FROM users WHERE email = ?").get(profile.email);
    if (user && !user.auth0_sub) {
      // We never verified the email on password sign up, so whoever set that password may not own the address.
      // Google just proved who does: retire the old password and sign out its sessions before linking.
      db.prepare("UPDATE users SET auth0_sub = ?, password_hash = '!oauth' WHERE id = ?").run(profile.sub, user.id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    }
    if (!user) {
      // No password: these accounts sign in through Google only ("!" never verifies as a scrypt hash).
      const { lastInsertRowid } = db.prepare("INSERT INTO users (email, name, password_hash, created_at, auth0_sub) VALUES (?, ?, '!oauth', ?, ?)")
        .run(profile.email, (profile.name || profile.email.split("@")[0]).slice(0, 100), Date.now(), profile.sub);
      user = { id: Number(lastInsertRowid) };
    }
    setSessionCookie(res, createSession(db, user.id, "web"));
    res.redirect(row.next);
  });

  // Pages: /login serves login.html, and so on.
  app.use(express.static(PUBLIC_DIR, { extensions: ["html"], index: "index.html" }));
  app.use((req, res) => res.status(404).sendFile("404.html", { root: PUBLIC_DIR }, () => res.end()));

  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    const billing = req.path.startsWith("/api/billing");
    res.status(billing ? 502 : 500).json({ error: billing ? "Billing is unavailable right now. Try again in a minute." : "Something went wrong." });
  });

  async function ensureCustomer(user) {
    if (user.stripe_customer_id) return user.stripe_customer_id;
    const customer = await stripe.customers.create({ email: user.email, name: user.name, metadata: { userId: String(user.id) } });
    db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customer.id, user.id);
    return customer.id;
  }

  function applySubscription(sub) {
    const plan = PRO_STATUSES.has(sub.status) ? "pro" : "free";
    const periodEnd = sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end ?? null;
    db.prepare("UPDATE users SET plan = ?, subscription_status = ?, current_period_end = ?, cancel_at_period_end = ? WHERE stripe_customer_id = ?")
      .run(plan, sub.status, periodEnd ? periodEnd * 1000 : null, sub.cancel_at_period_end ? 1 : 0, String(sub.customer));
  }

  async function handleStripeEvent(event) {
    const obj = event.data.object;
    switch (event.type) {
      case "checkout.session.completed": {
        if (obj.client_reference_id && obj.customer) {
          db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL")
            .run(String(obj.customer), Number(obj.client_reference_id));
        }
        if (obj.subscription) applySubscription(await stripe.subscriptions.retrieve(String(obj.subscription)));
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        applySubscription(obj);
        break;
      default:
        break;
    }
  }

  return app;
}
