import { DEFAULT_MODEL } from "./gemini.js";

export const DEFAULTS = { autoCapture: true, freqHours: 24, financeMode: true, geminiKey: "", geminiModel: DEFAULT_MODEL };

export async function getSettings() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get("settings")).settings };
}
