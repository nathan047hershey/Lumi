import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("c:/Vincent/Projects/02.Lumi");
const TARGET = path.join(ROOT, "lumi", ".env");
const SOURCES = [
  path.join(ROOT, "_zip_analysis", "server", ".env"),
  path.join(ROOT, "_zip_analysis", "server", "local.env"),
];

function isPlaceholder(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  return /your-|example|replace-with|changeme|placeholder|sk-your-/i.test(text);
}

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cut = line.indexOf("=");
    if (cut < 1) continue;
    const key = line.slice(0, cut).trim();
    let value = line.slice(cut + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!key || isPlaceholder(value)) continue;
    out[key] = value;
  }
  return out;
}

function serialize(env) {
  const keys = Object.keys(env).sort((a, b) => a.localeCompare(b));
  return keys.map((key) => `${key}=${env[key]}`).join("\n") + "\n";
}

const merged = {
  DATABASE_URL: "file:./dev.db",
};
for (const source of SOURCES) {
  Object.assign(merged, parseEnv(source));
}
delete merged.PORT;
merged.DATABASE_URL = "file:./dev.db";
if (merged.OUTLOOK_REDIRECT_URI) {
  merged.OUTLOOK_REDIRECT_URI = String(merged.OUTLOOK_REDIRECT_URI).replace(":9017", ":3000");
}

const existing = parseEnv(TARGET);
const next = { ...existing, ...merged, DATABASE_URL: "file:./dev.db" };
delete next.PORT;
fs.writeFileSync(TARGET, serialize(next));

const names = Object.keys(next).filter((key) => key !== "DATABASE_URL").sort();
console.log(`Wrote ${names.length} env keys to lumi/.env (values not printed)`);
console.log(names.join(", "));
