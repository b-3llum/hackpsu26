// One time Stripe setup (test mode): product, $3/month price, webhook, billing portal.
// Usage: STRIPE_SECRET_KEY=sk_test_... node deploy/stripe-setup.mjs https://whatyousignupfor.us
// Prints env lines for /etc/consent/env (STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET) on stdout; status goes to stderr.
// Safe to run again: it reuses the product, price, and webhook it created before.
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY || "";
const site = (process.argv[2] || "").replace(/\/$/, "");
if (!/^(sk|rk)_test_/.test(key)) { console.error("Use a Stripe TEST key (sk_test_ or rk_test_)."); process.exit(1); }
if (!/^https:\/\//.test(site)) { console.error("Pass the public https URL of the site."); process.exit(1); }

const stripe = new Stripe(key);
const log = (...a) => console.error(...a);
const LOOKUP = "consent_receipts_pro_monthly";
const TAX_CODE = "txcd_10103000"; // Software as a Service, personal use
const EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];

let price = (await stripe.prices.list({ lookup_keys: [LOOKUP], active: true, limit: 1 })).data[0];
if (!price) {
  const product = await stripe.products.create({ name: "Consent Receipts Pro", description: "AI summaries with citations and trust scores.", tax_code: TAX_CODE });
  price = await stripe.prices.create({ product: product.id, currency: "usd", unit_amount: 300, recurring: { interval: "month" }, lookup_key: LOOKUP });
  log(`created price ${price.id}`);
} else log(`reusing price ${price.id}`);
// Accounts with Managed Payments (the default) need a tax code on the product.
const product = await stripe.products.retrieve(String(price.product));
if (product.tax_code !== TAX_CODE) { await stripe.products.update(product.id, { tax_code: TAX_CODE }); log(`set tax code on ${product.id}`); }

const url = `${site}/api/stripe/webhook`;
const existing = (await stripe.webhookEndpoints.list({ limit: 100 })).data.filter((w) => w.url === url);
// The signing secret is only returned at creation, so replace any earlier endpoint for this URL.
for (const w of existing) { await stripe.webhookEndpoints.del(w.id); log(`removed old webhook ${w.id}`); }
const hook = await stripe.webhookEndpoints.create({ url, enabled_events: EVENTS, description: "Consent Receipts" });
log(`created webhook ${hook.id} -> ${url}`);

const configs = (await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 })).data;
if (!configs.length) {
  await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Consent Receipts billing" },
    default_return_url: `${site}/account`,
    features: {
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "name"] },
    },
  });
  log("created billing portal configuration");
} else log("billing portal already configured");

console.log(`STRIPE_PRICE_ID=${price.id}`);
console.log(`STRIPE_WEBHOOK_SECRET=${hook.secret}`);
