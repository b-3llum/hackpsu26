// Build the Chrome Web Store package: dist/consent-receipts-<version>.zip
// Usage: node extension/tools/build-store.mjs
// - drops the manifest "key" (the store assigns its own extension ID)
// - leaves out tests, the offline demo, docs, package files, and server only code
// - checks that every import from the entry points resolves inside the package
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const EXT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(EXT, "..");
const OUT = join(ROOT, "dist", "store");
const INCLUDE = ["manifest.json", "background.js", "content.js", "icons", "popup", "options", "lib"];
const EXCLUDE = [/\/test\//, /README\.md$/, /package\.json$/, /^lib\/gemini\.js$/, /\.DS_Store$/];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const item of INCLUDE) {
  cpSync(join(EXT, item), join(OUT, item), {
    recursive: true,
    filter: (src) => {
      const rel = relative(EXT, src).split("\\").join("/");
      return !EXCLUDE.some((re) => re.test(rel) || re.test(`${rel}/`));
    },
  });
}

const manifest = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8"));
delete manifest.key;
// Store limits: name 75 characters, description 132.
if (manifest.name.length > 75) throw new Error(`manifest name is ${manifest.name.length} characters (max 75)`);
if (manifest.description.length > 132) throw new Error(`manifest description is ${manifest.description.length} characters (max 132)`);
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

// Every file referenced by the manifest exists.
const referenced = [
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((c) => c.js),
  manifest.action.default_popup,
  manifest.options_page,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon || {}),
];
for (const f of referenced) if (!existsSync(join(OUT, f))) throw new Error(`manifest references missing file: ${f}`);

// Every static import, from the service worker and the pages' module scripts, resolves inside the package.
const seen = new Set();
function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = readFileSync(file, "utf8");
  for (const [, spec] of src.matchAll(/^\s*import\s[^'"]*["'](\.{1,2}\/[^'"]+)["']/gm)) {
    const target = resolve(dirname(file), spec);
    if (!target.startsWith(OUT) || !existsSync(target)) throw new Error(`${relative(OUT, file)} imports missing ${spec}`);
    walk(target);
  }
}
const pageScripts = [manifest.action.default_popup, manifest.options_page].flatMap((page) => {
  const html = readFileSync(join(OUT, page), "utf8");
  return [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => join(dirname(join(OUT, page)), m[1]));
});
[join(OUT, manifest.background.service_worker), ...pageScripts].forEach(walk);

// Unused JavaScript is a smell in a store package; list it so it can be removed.
const allJs = [];
(function list(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) list(p);
    else if (p.endsWith(".js")) allJs.push(p);
  }
})(OUT);
const contentScripts = new Set(manifest.content_scripts.flatMap((c) => c.js).map((f) => join(OUT, f)));
const unused = allJs.filter((p) => !seen.has(p) && !contentScripts.has(p));
if (unused.length) console.warn("unused JS in package:", unused.map((p) => relative(OUT, p)));

const zip = join(ROOT, "dist", `consent-receipts-${manifest.version}.zip`);
rmSync(zip, { force: true });
execFileSync("zip", ["-qrX", zip, "."], { cwd: OUT });
const files = execFileSync("zipinfo", ["-1", zip], { encoding: "utf8" }).trim().split("\n").filter((f) => !f.endsWith("/"));
console.log(`built ${relative(ROOT, zip)}: ${files.length} files, ${(statSync(zip).size / 1024).toFixed(1)} KB, version ${manifest.version}, no key`);
console.log(files.map((f) => `  ${f}`).join("\n"));
