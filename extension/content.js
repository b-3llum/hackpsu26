(() => {
  // Words that mean consent on their own, anywhere on the page.
  const STRONG = /\b(i\s*agree|agree( and continue)?|accept( all( cookies)?)?|allow( all)?|i consent|consent)\b/i;
  // Words that only mean consent inside a consent banner or sign up form.
  const WEAK = /\b(got it|ok(ay)?,?( i understand)?|continue|sign ?up|create( my)? account|register|join now)\b/i;
  const NEG = /\b(reject|decline|deny|disagree|manage|settings|preferences|customi[sz]e|necessary only|essential only|learn more)\b/i;
  const CMP = '#onetrust-banner-sdk,#onetrust-consent-sdk,#CybotCookiebotDialog,#truste-consent-track,.truste_box_overlay,#qc-cmp2-container,.cc-window,.cookie-banner,[id*="cookie" i],[class*="cookie" i],[class*="consent" i],[id*="consent" i],[aria-label*="cookie" i],[aria-label*="consent" i],[role="dialog"],[role="alertdialog"]';
  const CONSENT_FORM_HINT = /\b(terms|privacy|policy|agree|consent)\b/i;
  let last = 0;

  // In a CMP iframe, credit the receipt to the site the user is on.
  function topDomain() {
    if (window.top === window) return location.hostname;
    const origins = location.ancestorOrigins;
    try { return origins && origins.length ? new URL(origins[origins.length - 1]).hostname : location.hostname; } catch { return location.hostname; }
  }

  function txt(el) {
    return (el.innerText || el.value || el.getAttribute("aria-label") || el.title || "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function labelFor(input) {
    const byFor = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
    return (input.closest("label")?.innerText || byFor?.innerText || input.getAttribute("aria-label") || input.name || "").trim();
  }

  function policyLinks() {
    const out = {};
    const seen = new Set();
    for (const a of document.querySelectorAll("a[href]")) {
      if (!/^https?:/.test(a.href) || seen.has(a.href)) continue;
      const t = `${a.innerText} ${a.href}`.toLowerCase();
      const type = /privacy/.test(t) ? "privacy" : /cookie/.test(t) ? "cookie" : /(terms|tos\b|conditions|user agreement|eula)/.test(t) ? "terms" : null;
      if (!type) continue;
      seen.add(a.href);
      (out[type] = out[type] || []).push(a.href);
    }
    for (const k in out) out[k] = out[k].slice(0, 2);
    return out;
  }

  function categories(container) {
    const cats = [];
    (container || document).querySelectorAll('input[type="checkbox"],[role="switch"]').forEach((i) => {
      const name = labelFor(i);
      const on = i.type === "checkbox" ? i.checked : i.getAttribute("aria-checked") === "true";
      if (name && name.length < 60) cats.push({ name, on });
    });
    return cats.slice(0, 12);
  }

  function cmpName() {
    if (document.querySelector("#onetrust-banner-sdk,#onetrust-consent-sdk")) return "OneTrust";
    if (document.querySelector("#CybotCookiebotDialog")) return "Cookiebot";
    if (document.querySelector("#truste-consent-track,.truste_box_overlay")) return "TrustArc";
    if (document.querySelector("#qc-cmp2-container")) return "Quantcast";
    return null;
  }

  // Where the click happened: a consent banner, a form that mentions terms, or neither.
  function context(el) {
    const banner = el.closest(CMP);
    if (banner) return { box: banner, consent: true };
    const form = el.closest("form");
    if (form && CONSENT_FORM_HINT.test(form.innerText || "")) return { box: form, consent: true };
    return { box: el.parentElement, consent: false };
  }

  function capture(el, kind, box) {
    if (Date.now() - last < 1500) return;
    last = Date.now();
    const payload = {
      domain: topDomain(),
      url: location.href,
      ts: Date.now(),
      kind,
      buttonText: txt(el),
      bannerText: (box?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 600),
      links: policyLinks(),
      categories: categories(box),
      cmp: cmpName(),
    };
    try { chrome.runtime.sendMessage({ type: "capture", payload }); } catch { /* extension reloaded */ }
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest('button,input[type="submit"],input[type="button"],a,[role="button"]');
    if (!el) return;
    const t = txt(el);
    if (!t || NEG.test(t)) return;
    const ctx = context(el);
    // Plain links only count inside a consent banner ("Continue reading" is not consent).
    if (el.tagName === "A" && !ctx.consent) return;
    if (STRONG.test(t) || (WEAK.test(t) && ctx.consent)) capture(el, "button", ctx.box);
  }, true);

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.type !== "checkbox" || !el.checked) return;
    if (/\b(agree|accept|terms|privacy|consent)\b/i.test(labelFor(el))) capture(el, "checkbox", el.closest("form") || el.parentElement);
  }, true);
})();
