// The hosted site: accounts, billing, and Pro summaries.
export const SITE = "https://whatyousignupfor.us";

export const DEFAULTS = { autoCapture: true, freqHours: 24, financeMode: true };

export async function getSettings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get("settings")).settings };
}
