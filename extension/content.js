(() => {
  const RX = /\b(i\s*agree|agree|accept( all)?|allow( all)?|consent|got it|ok(ay)?,? i understand|sign ?up|create account|continue)\b/i;
  const NEG = /\b(reject|decline|deny|disagree|manage|settings|preferences|customi[sz]e)\b/i;
  const CMP = '#onetrust-banner-sdk,#onetrust-consent-sdk,#CybotCookiebotDialog,#truste-consent-track,.truste_box_overlay,#qc-cmp2-container,.cc-window,.cookie-banner,[id*="cookie" i],[class*="cookie" i],[class*="consent" i],[id*="consent" i],[role="dialog"],form';
  let last = 0;

  function txt(el) { return (el.innerText || el.value || el.getAttribute("aria-label") || el.title || "").trim().slice(0, 80); }
  function policyLinks() {
    const out = {}; 
    for (const a of document.querySelectorAll("a[href]")) {
      const t = (a.innerText + " " + a.href).toLowerCase();
      const type = /privacy/.test(t) ? "privacy" : /cookie/.test(t) ? "cookie" : /(terms|tos|conditions|user agreement|eula)/.test(t) ? "terms" : null;
      if (type && /^https?:/.test(a.href) && !Object.values(out).flat().includes(a.href)) (out[type] = out[type] || []).push(a.href);
    }
    for (const k in out) out[k] = out[k].slice(0, 2);
    return out;
  }
  function categories(container) {
    const cats = [];
    (container || document).querySelectorAll('input[type="checkbox"],[role="switch"]').forEach(i => {
      const lab = (i.closest("label")?.innerText || document.querySelector(`label[for="${CSS.escape(i.id || "x")}"]`)?.innerText || i.getAttribute("aria-label") || i.name || "").trim();
      if (lab && lab.length < 60) cats.push({ name: lab, on: i.checked ?? i.getAttribute("aria-checked") === "true" });
    });
    return cats.slice(0, 12);
  }
  function capture(el, kind) {
    if (Date.now() - last < 1500) return; last = Date.now();
    const box = el.closest(CMP) || el.parentElement;
    const payload = {
      domain: location.hostname, url: location.href, ts: Date.now(), kind,
      buttonText: txt(el), bannerText: (box?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 600),
      links: policyLinks(), categories: categories(box), cmp: (document.querySelector("#onetrust-banner-sdk") && "OneTrust") || (document.querySelector("#CybotCookiebotDialog") && "Cookiebot") || (document.querySelector("#truste-consent-track,.truste_box_overlay") && "TrustArc") || null
    };
    try { chrome.runtime.sendMessage({ type: "capture", payload }); } catch (e) {}
  }
  document.addEventListener("click", e => {
    const el = e.target.closest('button,input[type="submit"],input[type="button"],a,[role="button"]');
    if (!el) return;
    const t = txt(el);
    if (t && RX.test(t) && !NEG.test(t)) capture(el, "button");
  }, true);
  document.addEventListener("change", e => {
    const el = e.target;
    if (el.type === "checkbox" && el.checked) {
      const lab = (el.closest("label")?.innerText || document.querySelector(`label[for="${CSS.escape(el.id || "x")}"]`)?.innerText || "");
      if (/(agree|accept|terms|privacy|consent)/i.test(lab)) capture(el, "checkbox");
    }
  }, true);
})();
