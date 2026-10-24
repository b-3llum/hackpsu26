// Local rule-based summarizer. Works in the service worker and in Node.
(function (root) {
  const RULES = [
    { id: "sell", w: 3, label: "Your data may be sold or shared with third parties", re: /\b(sell|sold|sale of)\b[^.]{0,80}\b(data|information)\b|\bshare[sd]?\b[^.]{0,80}\b(third[- ]part(y|ies)|partners|affiliates)\b/i },
    { id: "ads", w: 2, label: "They track you for advertising", re: /\b(advertis\w*|targeted ads?|cookies?|tracking|pixel|beacon|analytics)\b/i },
    { id: "location", w: 2, label: "They collect your location", re: /\b(location|geolocation|gps|ip address)\b/i },
    { id: "contacts", w: 2, label: "They can access your contacts or address book", re: /\b(contacts|address book|phone book)\b/i },
    { id: "bio", w: 3, label: "They collect biometric data (face, voice, fingerprint)", re: /\b(biometric\w*|face ?print|facial recognition|fingerprint|voiceprint)\b/i },
    { id: "retention", w: 1, label: "Data retention: {x}", re: /\b(retain|retention|keep|store)\w*\b[^.]{0,120}?((\d+\s*(days?|months?|years?))|indefinitely|as long as (necessary|needed))/i, extract: 2 },
    { id: "arbitration", w: 3, label: "You give up the right to sue in court (arbitration / class action waiver)", re: /\b(arbitration|class[- ]action waiver|waive[^.]{0,40}class action|jury trial)\b/i },
    { id: "renew", w: 2, label: "Your subscription auto-renews", re: /\b(auto(matic(ally)?)?[- ]?renew\w*|recurring (charge|billing|payment))\b/i },
    { id: "deletion", w: -1, label: "You can delete your account and data", re: /\b(delete|deletion|erase|erasure)\b[^.]{0,60}\b(account|data|information)\b/i },
    { id: "ai", w: 3, label: "Your content may be used to train AI", re: /\b(train\w*|improve)\b[^.]{0,80}\b(ai|artificial intelligence|machine learning|models?)\b/i },
    { id: "children", w: 1, label: "Mentions children's data", re: /\b(children|under (the age of )?1[3-8]|minors|coppa)\b/i },
    { id: "change", w: 1, label: "They can change these terms at any time", re: /\b(change|modify|update)\b[^.]{0,40}\b(at any time|without (prior )?notice)\b/i }
  ];

  function splitSentences(text) {
    return (text || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/).map(s => s.trim()).filter(s => s.length > 20);
  }

  function summarizeRules(text) {
    const sentences = splitSentences(text);
    const items = []; let score = 0;
    for (const r of RULES) {
      const hit = sentences.find(s => r.re.test(s));
      if (!hit) continue;
      let label = r.label;
      if (r.extract) { const m = hit.match(r.re); label = label.replace("{x}", m && m[r.extract] ? m[r.extract] : "stated in policy"); }
      items.push({ id: r.id, text: label, evidence: hit.slice(0, 220), good: r.w < 0 });
      score += r.w;
    }
    const risk = score >= 7 ? "High" : score >= 3 ? "Medium" : "Low";
    const reasons = items.filter(i => !i.good).sort((a, b) => (RULES.find(r => r.id === b.id).w - RULES.find(r => r.id === a.id).w)).slice(0, 3).map(i => i.text);
    return { source: "rules", risk, score, items, reasons, bullets: items.map(i => (i.good ? "Good news: " : "You agreed to: ") + i.text) };
  }

  function diffSentences(oldText, newText) {
    const a = new Set(splitSentences(oldText)), b = new Set(splitSentences(newText));
    return { added: [...b].filter(s => !a.has(s)).slice(0, 30), removed: [...a].filter(s => !b.has(s)).slice(0, 30) };
  }

  function htmlToText(html) {
    let h = String(html || "");
    const main = h.match(/<(main|article)[\s\S]*?<\/\1>/i);
    if (main) h = main[0];
    return h.replace(/<(script|style|noscript|nav|header|footer|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, ". ").replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
      .replace(/\.\s*\./g, ".").replace(/\s+/g, " ").trim();
  }

  const api = { summarizeRules, diffSentences, htmlToText, splitSentences, RULES };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CR = api;
})(typeof self !== "undefined" ? self : this);
