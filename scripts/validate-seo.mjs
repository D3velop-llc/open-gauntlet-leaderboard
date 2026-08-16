#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const errors = [];

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === ".git" || entry.name === "vendor" || entry.name === ".remember" ? [] : walk(full);
    return entry.name.endsWith(".html") ? [relative(root, full).replaceAll("\\", "/")] : [];
  });
}

function localTarget(href) {
  const clean = href.split("#")[0].split("?")[0];
  if (!clean || /^(?:https?:|mailto:|tel:)/.test(clean)) return null;
  if (clean === "/") return "index.html";
  const path = clean.startsWith("/") ? clean.slice(1) : clean;
  return path.endsWith("/") ? `${path}index.html` : path;
}

const htmlFiles = walk(root).sort();
const canonicals = new Map();
for (const file of htmlFiles) {
  const html = readFileSync(join(root, file), "utf8");
  const isLegacy = file === "model.html";
  const title = html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
  const description = html.match(/<meta name="description" content="([^"]*)">/)?.[1] || "";
  const canonical = html.match(/<link rel="canonical" href="([^"]*)">/)?.[1];
  const h1s = html.match(/<h1(?:\s|>)/g) || [];
  if (!title) errors.push(`${file}: missing title`);
  if (description.length < 70 || description.length > 165) errors.push(`${file}: description length ${description.length}`);
  if (h1s.length !== 1) errors.push(`${file}: expected one h1, found ${h1s.length}`);
  if (!isLegacy && !canonical) errors.push(`${file}: missing canonical`);
  if (isLegacy && canonical) errors.push(`${file}: legacy page must not have a canonical`);
  if (canonical) {
    if (canonicals.has(canonical)) errors.push(`${file}: canonical duplicates ${canonicals.get(canonical)}`);
    canonicals.set(canonical, file);
  }
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(match[1]); } catch (error) { errors.push(`${file}: invalid JSON-LD (${error.message})`); }
  }
  if (/href="index\.html"/.test(html)) errors.push(`${file}: links to duplicate index.html`);
  if (/href="model\.html\?slug=/.test(html)) errors.push(`${file}: links to legacy model query URL`);
  for (const href of ["/asr.html", "/asr-survey.html", "/", "/llms.html", "/tts.html", "/tts-survey.html"]) {
    if (!html.includes(`href="${href}"`)) errors.push(`${file}: dual-evidence navigation missing ${href}`);
  }
  for (const match of html.matchAll(/href="([^"]+)"/g)) {
    const target = localTarget(match[1]);
    if (!target || target.startsWith("data/") || target === "feed.xml") continue;
    try { statSync(join(root, target)); } catch { errors.push(`${file}: broken internal link ${match[1]}`); }
  }
}

for (const [key, measuredFile, surveyedFile] of [["asr", "asr.html", "asr-survey.html"], ["tts", "tts.html", "tts-survey.html"]]) {
  const measured = readFileSync(join(root, measuredFile), "utf8");
  const surveyed = readFileSync(join(root, surveyedFile), "utf8");
  if (!measured.includes(`data-page="${key}-lab" data-kind="measured"`)) errors.push(`${measuredFile}: not marked as measured lab evidence`);
  if (!measured.includes(`id="${key}-lab"`) || measured.includes(`id="${key}-matrix"`)) errors.push(`${measuredFile}: measured page must contain only the lab evidence surface`);
  if (!measured.includes(`<section id="${key}-lab" aria-label="OpenGauntlet measured ${key.toUpperCase()} results"><div class="state">Loading…</div></section>`)) errors.push(`${measuredFile}: measured lab shell is malformed`);
  if (!measured.includes('<aside class="community-cta" aria-labelledby="community-title">')) errors.push(`${measuredFile}: community call-to-action shell is malformed`);
  if (!surveyed.includes(`data-page="${key}" data-kind="surveyed"`)) errors.push(`${surveyedFile}: not marked as surveyed evidence`);
  if (!surveyed.includes(`id="${key}-matrix"`) || surveyed.includes(`id="${key}-lab"`)) errors.push(`${surveyedFile}: survey page must contain only the sourced matrix surface`);
  const fullData = JSON.parse(readFileSync(join(root, "data", `${key}.json`), "utf8"));
  const labData = JSON.parse(readFileSync(join(root, "data", `${key}-lab.json`), "utf8"));
  if (JSON.stringify(fullData.lab) !== JSON.stringify(labData.lab)) errors.push(`data/${key}-lab.json: lab evidence differs from data/${key}.json`);
}

const sitemap = readFileSync(join(root, "sitemap.xml"), "utf8");
const locations = [...sitemap.matchAll(/<loc>https:\/\/opengauntlet\.com([^<]*)<\/loc>/g)].map((match) => match[1] || "/");
if (new Set(locations).size !== locations.length) errors.push("sitemap.xml: duplicate URL");
for (const location of locations) {
  const target = location === "/" ? "index.html" : location.endsWith("/") ? `${location.slice(1)}index.html` : location.slice(1);
  try { statSync(join(root, target)); } catch { errors.push(`sitemap.xml: missing target ${location}`); }
}
for (const [canonical, file] of canonicals) {
  const location = canonical.replace("https://opengauntlet.com", "") || "/";
  if (!locations.includes(location)) errors.push(`sitemap.xml: missing canonical for ${file}`);
}
const leaderboard = JSON.parse(readFileSync(join(root, "data", "leaderboard.json"), "utf8"));
const leaderboardBySlug = new Map((leaderboard.models || []).map((row) => [row.slug, row]));
for (const file of readdirSync(join(root, "data", "models")).filter((name) => name.endsWith(".json"))) {
  const detail = JSON.parse(readFileSync(join(root, "data", "models", file), "utf8"));
  const slug = detail.slug;
  try { statSync(join(root, "models", slug, "index.html")); } catch { errors.push(`missing generated model page for ${slug}`); }
  if (!/^https:\/\//.test(detail.source_url || "")) errors.push(`${file}: missing HTTPS model source URL`);
  const row = leaderboardBySlug.get(slug);
  if (row && row.source_url !== detail.source_url) errors.push(`${file}: source URL differs from leaderboard.json`);
}
for (const row of leaderboard.models || []) {
  if (!/^https:\/\//.test(row.source_url || "")) errors.push(`leaderboard.json: ${row.slug} missing HTTPS model source URL`);
}
if (!readFileSync(join(root, "index.html"), "utf8").includes('"license": "https://opengauntlet.com/data-license.html"')) errors.push("index.html: Dataset license missing");

if (errors.length) {
  console.error(`SEO validation failed (${errors.length}):\n${errors.join("\n")}`);
  process.exit(1);
}
console.log(`SEO validation passed: ${htmlFiles.length} HTML documents, ${canonicals.size} unique canonicals, ${locations.length} sitemap URLs.`);
