// Копирует не-TS ассеты (.html шаблоны) из src/ в dist/ — tsc сам этого не делает.
// Вызывается из `npm run build` после `tsc`.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..", "src");
const distRoot = join(here, "..", "dist");

const EXTENSIONS = new Set([".html"]);

const walk = (dir, onFile) => {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, onFile);
    else onFile(p);
  }
};

let copied = 0;
walk(srcRoot, (filePath) => {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return;
  const ext = filePath.slice(dot);
  if (!EXTENSIONS.has(ext)) return;
  const dest = join(distRoot, relative(srcRoot, filePath));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(filePath, dest);
  copied += 1;
});

console.log(`copy-assets: copied ${copied} asset(s) into ${distRoot}`);
