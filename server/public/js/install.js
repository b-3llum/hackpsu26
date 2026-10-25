import { api, findExtension, isChromium, freshDownloadLinks } from "./common.js";

const $ = (id) => document.getElementById(id);
const { data: config = {} } = await api("/api/config").catch(() => ({ data: {} }));
const ids = config.extensionIds || [];

if (!isChromium()) $("not-chromium").hidden = false;

// Version and size of the download (written next to the zip on deploy), and a cache proof link.
freshDownloadLinks($("download")).then((m) => {
  if (m) $("dl-meta").textContent = `Version ${m.version}, ${Math.round(m.bytes / 1024)} KB`;
});

async function check() {
  const id = await findExtension(ids);
  $("installed").hidden = !id;
  return id;
}
await check();

$("copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText("chrome://extensions");
    $("copy-status").textContent = "Copied. Paste it into a new tab.";
  } catch {
    const range = document.createRange();
    range.selectNodeContents($("ext-url"));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    $("copy-status").textContent = "Selected. Press Ctrl+C or Cmd+C.";
  }
});

// Chrome only lets a page talk to an extension that was installed before the page loaded, so check, then
// reload once if needed.
$("done").addEventListener("click", async () => {
  $("done-status").textContent = "Checking...";
  if (await check()) { location.assign("/account?connect=1"); return; }
  if (!sessionStorage.getItem("cr-install-reloaded")) {
    sessionStorage.setItem("cr-install-reloaded", "1");
    location.reload();
    return;
  }
  $("done-status").textContent = "We can't see it yet. Make sure it is on in the extensions page, then try again.";
  sessionStorage.removeItem("cr-install-reloaded");
});

// After the reload from "I installed it": continue to connecting if it is there now.
if (sessionStorage.getItem("cr-install-reloaded")) {
  sessionStorage.removeItem("cr-install-reloaded");
  if (await check()) location.assign("/account?connect=1");
  else $("done-status").textContent = "We can't see it yet. Make sure it is on in the extensions page, then try again.";
}
