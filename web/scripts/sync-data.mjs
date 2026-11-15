// Copy the batch pipeline's snapshot into the web app before dev/build (NFR-09).
// The snapshot is produced by ingest/ and committed at data/snapshot/; the app reads a copy
// in web/data/ (gitignored) so the Next.js bundle never reaches outside its own folder.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(web, "..");
const out = join(web, "data");
mkdirSync(out, { recursive: true });

const sources = [
  [join(repo, "data", "snapshot"), null],
  [join(repo, "config"), ["portfolio.json", "preferences.json", "models.json"]],
];

let n = 0;
for (const [dir, only] of sources) {
  if (!existsSync(dir)) {
    console.warn(`sync-data: ${dir} not found, skipping`);
    continue;
  }
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || (only && !only.includes(f))) continue;
    copyFileSync(join(dir, f), join(out, f));
    n++;
  }
}
console.log(`sync-data: copied ${n} files into web/data`);
