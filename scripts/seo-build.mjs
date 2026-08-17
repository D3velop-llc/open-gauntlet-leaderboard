#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const WORKSPACE = process.cwd();
const ROOT = existsSync(join(WORKSPACE, "site", "index.html"))
  ? join(WORKSPACE, "site")
  : WORKSPACE;
const ORIGIN = "https://opengauntlet.com";
const TODAY = new Date().toISOString().slice(0, 10);
const changed = new Set();

const pages = {
  "index.html": {
    title: "Local Conversational AI Model Leaderboard | OpenGauntlet",
    description: "Independent conversational AI benchmark results for local open-weight models, including humanlikeness, emotional reasoning, transcripts, latency, and speed.",
    h1: "Local conversational AI <span class=\"warm\">model leaderboard</span>",
    type: "WebPage",
    canonical: "/",
  },
  "asr.html": {
    title: "Local ASR Benchmark Results | OpenGauntlet",
    description: "Measured local speech-to-text results from the OpenGauntlet ASR Lab, with disclosed audio, hardware, execution mode, word error rate, and receipts.",
    h1: "Speech-to-text and <span class=\"warm\">ASR systems compared</span>",
    type: "WebPage",
  },
  "turns.html": {
    title: "Voice Agent Turn Detection & VAD Compared | OpenGauntlet",
    description: "Compare VAD, semantic turn detection, endpointing, and interruption systems for realtime voice agents, with deployment and licensing evidence.",
    h1: "Voice agent turn detection and <span class=\"warm\">VAD compared</span>",
    type: "CollectionPage",
  },
  "tts.html": {
    title: "Local Text-to-Speech Benchmark Results | OpenGauntlet",
    description: "Measured local text-to-speech results from the OpenGauntlet TTS Lab, with blind ratings, disclosed hardware, method, limitations, and receipts.",
    h1: "Text-to-speech <span class=\"warm\">systems compared</span>",
    type: "WebPage",
  },
  "runtimes.html": {
    title: "LLM Inference Engines & Runtimes Compared | OpenGauntlet",
    description: "Compare local and server LLM inference engines by model support, quantization, hardware, throughput, deployment, and first-party benchmark evidence.",
    h1: "LLM inference engines and <span class=\"warm\">runtimes compared</span>",
    type: "CollectionPage",
  },
  "memory.html": {
    title: "Vector Databases & AI Agent Memory Compared | OpenGauntlet",
    description: "Compare vector databases, graph memory, and agent-memory frameworks by retrieval, filtering, deployment, persistence, scale, and licensing.",
    h1: "Vector databases and <span class=\"warm\">AI agent memory compared</span>",
    type: "CollectionPage",
  },
  "hardware.html": {
    title: "Local AI GPU VRAM & Memory Bandwidth Guide | OpenGauntlet",
    description: "A practical hardware reference for local AI: compare GPU VRAM, unified memory, memory bandwidth, and realistic model-size limits.",
    h1: "Local AI hardware: <span class=\"warm\">what fits where</span>",
    type: "CollectionPage",
  },
  "orchestrators.html": {
    title: "Voice Agent Frameworks & Orchestrators Compared | OpenGauntlet",
    description: "Compare voice-agent frameworks and orchestration platforms by transport, tool calling, realtime architecture, observability, and deployment.",
    h1: "Voice agent frameworks and <span class=\"warm\">orchestrators compared</span>",
    type: "CollectionPage",
  },
  "quantization.html": {
    title: "LLM Quantization Tools & Methods Compared | OpenGauntlet",
    description: "Compare LLM quantization tools and algorithms by format, calibration cost, bit width, accuracy retention, model support, and hardware kernels.",
    h1: "LLM quantization tools and <span class=\"warm\">methods compared</span>",
    type: "CollectionPage",
  },
  "utilities.html": {
    title: "Voice AI Utilities: Speaker ID, Wake Words & Audio | OpenGauntlet",
    description: "Compare speaker verification, wake-word detection, speech enhancement, noise suppression, and echo-cancellation tools for voice AI.",
    h1: "Voice AI <span class=\"warm\">utilities compared</span>",
    type: "CollectionPage",
  },
  "llms.html": {
    title: "Open-Weight LLMs Compared: Size, License & Hardware | OpenGauntlet",
    description: "Compare open-weight LLMs by parameters, architecture, context, licensing, hardware requirements, and external evaluation evidence.",
    h1: "Open-weight <span class=\"warm\">LLMs compared</span>",
    type: "CollectionPage",
  },
  "compare.html": {
    title: "Compare Local AI Models Head to Head | OpenGauntlet",
    description: "Compare two local conversational AI models on identical conversations, including rubric scores, pairwise judgments, replies, latency, and speed.",
    h1: "Compare local AI models <span class=\"warm\">head to head</span>",
    type: "WebPage",
  },
  "methodology.html": {
    title: "Conversational AI Benchmark Methodology | OpenGauntlet",
    description: "How OpenGauntlet tests local conversational AI with fixed multi-turn scenarios, rubric and pairwise judges, calibration, and reproducibility receipts.",
    h1: "Conversational AI <span class=\"warm\">benchmark methodology</span>",
    type: "TechArticle",
  },
  "tts-guide.html": {
    title: "How to Compare Text-to-Speech Systems | OpenGauntlet",
    description: "A practical guide to TTS quality and latency metrics, MOS limits, streaming behavior, voice cloning, dataset comparability, and deployment tradeoffs.",
    h1: "How to compare <span class=\"warm\">text-to-speech systems</span>",
    type: "TechArticle",
  },
  "tts-legal.html": {
    title: "TTS Licensing, Voice Consent & Legal Risks | OpenGauntlet",
    description: "A practical research guide to TTS code and weight licenses, voice-cloning consent, biometric privacy, retention, and commercial deployment risk.",
    h1: "TTS licensing, voice consent, and <span class=\"warm\">legal risks</span>",
    type: "Article",
  },
};

const utilityPages = {
  speakerid: {
    file: "speaker-verification.html",
    title: "Speaker Verification Software & Voice Clone Evaluation | OpenGauntlet",
    description: "Compare speaker verification software, voice embeddings, similarity metrics, and APIs for evaluating whether a cloned voice matches its target.",
    h1: "Speaker verification software and <span class=\"warm\">voice clone evaluation</span>",
    lede: "A sourced comparison of speaker-verification metrics, embedding models, and verification APIs: what each one measures, how it runs, and the licensing or reliability catch to know before shipping.",
  },
  wakeword: {
    file: "wake-word-detection.html",
    title: "Wake Word Detection & Keyword Spotting Compared | OpenGauntlet",
    description: "Compare wake-word detection and keyword-spotting engines by accuracy evidence, custom training, hardware, runtime, licensing, and deployment.",
    h1: "Wake word detection and <span class=\"warm\">keyword spotting compared</span>",
    lede: "A sourced comparison of wake-word and keyword-spotting engines for always-listening voice products, including custom phrase training, hardware floors, runtimes, and licensing.",
  },
  enhancement: {
    file: "speech-enhancement.html",
    title: "Speech Enhancement, Noise Suppression & AEC Compared | OpenGauntlet",
    description: "Compare speech enhancement, noise suppression, denoising, dereverberation, and acoustic echo cancellation tools for realtime voice systems.",
    h1: "Speech enhancement, noise suppression, and <span class=\"warm\">echo cancellation compared</span>",
    lede: "A sourced comparison of realtime speech enhancement, denoising, dereverberation, and acoustic echo cancellation tools—the audio cleanup that happens before ASR or a voice agent sees the microphone.",
  },
};

function read(file) {
  return readFileSync(join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
}

function write(file, content) {
  const target = join(ROOT, file);
  const normalized = content.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n+$/, "\n");
  if (existsSync(target) && readFileSync(target, "utf8").replace(/\r\n/g, "\n") === normalized) return;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, normalized, "utf8");
  changed.add(file.replace(/\\/g, "/"));
}

if (ROOT !== WORKSPACE) {
  for (const name of ["site.css", "site.js"]) {
    write(`static/${name}`, readFileSync(join(WORKSPACE, "src", "open_gauntlet", "templates", "static", name), "utf8"));
  }
}

const assetVersions = Object.fromEntries(["site.css", "site.js"].map((name) => [
  name,
  createHash("sha256").update(readFileSync(join(ROOT, "static", name), "utf8").replace(/\r\n/g, "\n")).digest("hex").slice(0, 10),
]));

const evidencePairs = {
  asr: {
    measuredFile: "asr.html",
    surveyedFile: "asr-survey.html",
    measuredCount: 14,
    surveyedCount: 106,
    measured: pages["asr.html"],
    surveyed: {
      title: "Speech-to-Text & ASR Systems Compared | OpenGauntlet",
      description: "Compare 106 speech-to-text and ASR systems for voice agents by accuracy, latency, languages, licensing, deployment, and sourced evidence.",
      h1: pages["asr.html"].h1,
      type: "CollectionPage",
    },
    measuredLede: "A disclosed local transcription experiment across approved clips and a fixed owner recording. Compare corrected-reference word error rate, execution mode, hardware, and limitations without mixing these results with vendor claims or unrelated test sets.",
  },
  tts: {
    measuredFile: "tts.html",
    surveyedFile: "tts-survey.html",
    measuredCount: 16,
    surveyedCount: 168,
    measured: pages["tts.html"],
    surveyed: {
      title: "Text-to-Speech Systems Compared | OpenGauntlet",
      description: "Compare 168 text-to-speech systems by quality evidence, streaming, voice cloning, languages, pricing, licensing, and deployment options.",
      h1: pages["tts.html"].h1,
      type: "CollectionPage",
    },
    measuredLede: "A disclosed local blind-listening experiment for speech quality and voice identity. Compare listener ratings, hardware, method, sample size, and limitations without treating a small local test as a score for the entire TTS market.",
  },
};

// Capture the generator output before this post-build rewrites it. On the first
// run that source is the old mixed page; on later runs the two already-split
// documents become their own stable sources.
const evidenceSources = Object.fromEntries(Object.entries(evidencePairs).map(([key, pair]) => {
  const measured = read(pair.measuredFile);
  const surveyed = existsSync(join(ROOT, pair.surveyedFile)) ? read(pair.surveyedFile) : "";
  const mixed = [measured, surveyed].find((html) => html.includes(`id="${key}-lab"`) && html.includes(`id="${key}-matrix"`)) || "";
  return [key, { measured, surveyed, mixed }];
}));

function esc(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function setMetadata(html, config, file) {
  const canonical = `${ORIGIN}${config.canonical || `/${file}`}`;
  const name = config.title.replace(/ \| OpenGauntlet$/, "");
  html = html.replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(config.description)}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(config.title)}</title>`);
  if (/<link rel="canonical" href="[^"]*">/.test(html)) {
    html = html.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${canonical}">`);
  } else {
    html = html.replace(/<\/title>/, `</title>\n  <link rel="canonical" href="${canonical}">`);
  }
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(name)}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(config.description)}">`);
  html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${canonical}">`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${esc(name)}">`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${esc(config.description)}">`);
  return html;
}

function pageSchema(config, file) {
  const canonical = `${ORIGIN}${config.canonical || `/${file}`}`;
  return {
    "@context": "https://schema.org",
    "@type": config.type || "WebPage",
    name: config.title.replace(/ \| OpenGauntlet$/, ""),
    url: canonical,
    description: config.description,
    dateModified: TODAY,
    isPartOf: { "@type": "WebSite", name: "OpenGauntlet", url: `${ORIGIN}/` },
    publisher: { "@type": "Organization", name: "D3velop", url: "https://d3velop.com/" },
  };
}

function setFirstJsonLd(html, value) {
  const block = `  <script type="application/ld+json">\n${JSON.stringify(value, null, 2).split("\n").map((line) => `  ${line}`).join("\n")}\n  </script>`;
  return html.replace(/  <script type="application\/ld\+json">[\s\S]*?<\/script>/, block);
}

function normalizeRootPage(html) {
  html = html.replaceAll('href="index.html"', 'href="/"');
  html = html.replace('window.OG = { modelPage: "model.html" }', 'window.OG = { modelBase: "/models/" }');
  html = html.replace(
    "Words is measured here; the open-weight LLM survey, Voices, Listening, Turns, Runtimes, Memory, Hardware Reference, Orchestrators, Quantization, and Utilities are sourced surveys.",
    "The Words leaderboard and scoped Listening and Voices labs are measured here; their Surveyed pages, plus Turns, Runtimes, Memory, Hardware Reference, Orchestrators, Quantization, and Utilities, are sourced research catalogs."
  );
  if (!html.includes('href="about.html"')) {
    html = html.replace('<a href="methodology.html">How it works', '<a href="about.html">About OpenGauntlet<span class="nm-sub">ownership &amp; standards</span></a>\n            <a href="methodology.html">How it works');
  }
  if (!html.includes('href="data-license.html"')) {
    html = html.replace('<a href="feed.xml">Updates</a>', '<a href="about.html">About</a><span class="sep">·</span>\n        <a href="data-license.html">Data license</a><span class="sep">·</span>\n        <a href="feed.xml">Updates</a>');
  }
  return html;
}

function evidenceSwitch(pair, mode) {
  const item = (kind, count, file, description) => {
    const dot = kind === "Measured" ? "solid" : "hollow";
    const content = `<span class="ev-line"><span class="ev ${dot}" aria-hidden="true"></span>${kind} &middot; ${count}</span>\n    <span class="ev-desc">${description}</span>`;
    return mode === kind.toLowerCase()
      ? `<span class="ev-seg is-current" aria-current="page">\n    ${content}<span class="sr-only"> — current page</span></span>`
      : `<a class="ev-seg" href="/${file}">\n    ${content}</a>`;
  };
  return `<nav class="ev-switch" aria-label="Measured and surveyed evidence in this section">\n  ${item("Measured", pair.measuredCount, pair.measuredFile, "our own lab results, with method and receipts")}\n  ${item("Surveyed", pair.surveyedCount, pair.surveyedFile, "the market matrix — sourced, not scored")}\n</nav>`;
}

function makeEvidencePage(key, pair, mode) {
  const sources = evidenceSources[key];
  let html = mode === "measured"
    ? (sources.mixed || sources.measured || sources.surveyed)
    : (sources.mixed || sources.surveyed);
  if (!html) throw new Error(`No ${mode} source available for ${key}`);

  const file = mode === "measured" ? pair.measuredFile : pair.surveyedFile;
  const config = mode === "measured" ? pair.measured : pair.surveyed;
  html = normalizeRootPage(html);
  html = setMetadata(html, config, file);
  html = setFirstJsonLd(html, pageSchema(config, file));
  html = html.replace(/<body[^>]*>/, `<body data-page="${mode === "measured" ? `${key}-lab` : key}" data-kind="${mode}">`);
  html = html.replace(/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/, `<h1>${config.h1}</h1>`);
  html = html.replace(/<nav class="ev-switch"[\s\S]*?<\/nav>/, evidenceSwitch(pair, mode));
  html = html.replace(/(<div class="eyebrow"><span class="tick">\/\/<\/span>)[\s\S]*?(<\/div>)/,
    `$1 ${mode === "measured" ? `${pair.measuredCount} measured locally · published receipts` : `${pair.surveyedCount} surveyed · sourced, not benchmarked`}$2`);

  if (mode === "measured") {
    html = html.replace(/<p class="lede">[\s\S]*?<\/p>/, `<p class="lede">${pair.measuredLede}</p>`);
    const wideStart = html.indexOf('  <div class="wrap wrap-wide">');
    const asideStart = html.indexOf('\n\n  <aside class="community-cta"', wideStart);
    if (wideStart < 0 || asideStart < 0) throw new Error(`${file}: evidence content shell changed`);
    const measuredBlock = `  <div class="wrap wrap-wide">\n    <section class="block tts-lab-block">\n      <section id="${key}-lab" aria-label="OpenGauntlet measured ${key.toUpperCase()} results"><div class="state">Loading…</div></section>\n    </section>\n  </div>`;
    html = html.slice(0, wideStart) + measuredBlock + html.slice(asideStart);
  } else {
    const wideStart = html.indexOf('  <div class="wrap wrap-wide">');
    const asideStart = html.indexOf('\n\n  <aside class="community-cta"', wideStart);
    if (wideStart < 0 || asideStart < 0) throw new Error(`${file}: evidence content shell changed`);
    let wide = html.slice(wideStart, asideStart);
    wide = wide.replace(new RegExp(`\\s*<section id="${key}-lab"[\\s\\S]*?<\\/section>\\s*`), "\n      ");
    wide = wide.replace("The market matrix below is separate from\n        the Lab measurements above, vendor claims, and external ratings.", "This market matrix is separate from OpenGauntlet's measured Lab results, vendor claims, and external ratings.");
    wide = wide.replaceAll("The separately labelled Lab card is", "The separate Measured page is");
    wide = wide.replace('href="tts.html">Voices</a>', 'href="tts-survey.html">Voices</a>');
    html = html.slice(0, wideStart) + wide + html.slice(asideStart);
  }
  return html;
}

for (const [file, config] of Object.entries(pages)) {
  let html = normalizeRootPage(read(file));
  html = setMetadata(html, config, file);
  html = html.replace(/<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/, `<h1>${config.h1}</h1>`);
  if (file !== "index.html") html = setFirstJsonLd(html, pageSchema(config, file));
  write(file, html);
}

for (const [key, pair] of Object.entries(evidencePairs)) {
  const source = JSON.parse(read(`data/${key}.json`));
  if (!source.lab) throw new Error(`data/${key}.json: missing lab evidence`);
  write(`data/${key}-lab.json`, `${JSON.stringify({ lab: source.lab }, null, 2)}\n`);
  write(pair.measuredFile, makeEvidencePage(key, pair, "measured"));
  write(pair.surveyedFile, makeEvidencePage(key, pair, "surveyed"));
}

// The homepage is both the site identity and the published benchmark dataset.
let home = read("index.html");
home = home.replace(/(?:\n    "license": "https:\/\/opengauntlet\.com\/data-license\.html",)+/g, "");
home = home.replace('"description": "Locally hosted open-weight language models evaluated on conversational realism, emotional intelligence, memory, voice suitability, and on-device performance.",', '"description": "Locally hosted open-weight language models evaluated on conversational realism, emotional intelligence, memory, voice suitability, and on-device performance.",\n    "license": "https://opengauntlet.com/data-license.html",');
home = home.replace(/"dateModified": "[^"]+"/, `"dateModified": "${TODAY}"`);
write("index.html", home);

let llmsTxt = read("llms.txt");
llmsTxt = llmsTxt
  .replace(/(?:\n- \[ASR lab JSON\]\(https:\/\/opengauntlet\.com\/data\/asr-lab\.json\))+/g, "")
  .replace(/(?:\n- \[TTS lab JSON\]\(https:\/\/opengauntlet\.com\/data\/tts-lab\.json\))+/g, "")
  .replace("- [Speech-to-text research](https://opengauntlet.com/asr.html): Sourced ASR system comparison.", "- [Speech-to-text measurements](https://opengauntlet.com/asr.html): Scoped local ASR experiment with disclosed method and receipts.\n- [Speech-to-text survey](https://opengauntlet.com/asr-survey.html): Sourced comparison of 106 ASR systems.")
  .replace("- [Text-to-speech research](https://opengauntlet.com/tts.html): Sourced TTS system comparison.", "- [Text-to-speech measurements](https://opengauntlet.com/tts.html): Scoped local TTS blind-listening experiment with disclosed method and receipts.\n- [Text-to-speech survey](https://opengauntlet.com/tts-survey.html): Sourced comparison of 168 TTS systems.");
if (!llmsTxt.includes("[ASR lab JSON]")) {
  llmsTxt = llmsTxt.replace("- [ASR research JSON](https://opengauntlet.com/data/asr.json)", "- [ASR research JSON](https://opengauntlet.com/data/asr.json)\n- [ASR lab JSON](https://opengauntlet.com/data/asr-lab.json)");
}
if (!llmsTxt.includes("[TTS lab JSON]")) {
  llmsTxt = llmsTxt.replace("- [TTS research JSON](https://opengauntlet.com/data/tts.json)", "- [TTS research JSON](https://opengauntlet.com/data/tts.json)\n- [TTS lab JSON](https://opengauntlet.com/data/tts-lab.json)");
}
write("llms.txt", llmsTxt);

let feed = read("feed.xml");
feed = feed
  .replaceAll("https://opengauntlet.com/asr.html", "https://opengauntlet.com/asr-survey.html")
  .replaceAll("https://opengauntlet.com/tts.html", "https://opengauntlet.com/tts-survey.html");
write("feed.xml", feed);

// Keep the three-topic Utilities page as a hub, but give each search intent a
// dedicated, canonical document that loads the same governed source matrix.
let utilityHub = read("utilities.html");
if (!utilityHub.includes("seo-topic-links")) {
  utilityHub = utilityHub.replace('</p>\n    </section>\n\n    <nav class="util-tabs"', '</p>\n      <p class="subnav seo-topic-links"><a href="speaker-verification.html">Speaker verification</a><span class="sep">·</span><a href="wake-word-detection.html">Wake-word detection</a><span class="sep">·</span><a href="speech-enhancement.html">Speech enhancement</a></p>\n    </section>\n\n    <nav class="util-tabs"');
  write("utilities.html", utilityHub);
}

function makeUtilityPage(key, config) {
  let html = read("utilities.html");
  const utilityLinks = `<p class="subnav seo-topic-links"><a href="speaker-verification.html">Speaker verification</a><span class="sep">·</span><a href="wake-word-detection.html">Wake-word detection</a><span class="sep">·</span><a href="speech-enhancement.html">Speech enhancement</a><span class="sep">·</span><a href="utilities.html">All utilities</a></p>`;
  html = html.replace('data-page="utilities"', `data-page="${key}"`);
  html = setMetadata(html, { ...config, type: "CollectionPage" }, config.file);
  html = setFirstJsonLd(html, pageSchema({ ...config, type: "CollectionPage" }, config.file));
  html = html.replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${config.h1}</h1>`);
  html = html.replace(/<p class="lede">[\s\S]*?<\/p>/, `<p class="lede">${esc(config.lede)}</p>`);
  html = html.replace(/<p class="subnav seo-topic-links">[\s\S]*?<\/p>/, utilityLinks);
  html = html.replace(/<nav class="util-tabs"[\s\S]*?<\/nav>/, "");
  const wrapStart = html.indexOf('  <div class="wrap wrap-wide">');
  const wrapEnd = html.indexOf('\n\n\n  <aside class="community-cta"', wrapStart);
  const panelStart = html.indexOf(`<section id="${key}-panel"`, wrapStart);
  const nextPanel = html.indexOf('\n    <section id="', panelStart + 20);
  const panelEnd = nextPanel === -1 || nextPanel > wrapEnd ? wrapEnd : nextPanel;
  const panel = html.slice(panelStart, panelEnd)
    .replace(' role="tabpanel"', "")
    .replace(/ aria-labelledby="[^"]+"/, "")
    .replace(/ hidden(?=>)/, "");
  html = html.slice(0, wrapStart) + `  <div class="wrap wrap-wide">\n    ${panel.trim()}\n  </div>` + html.slice(wrapEnd);
  return html;
}

for (const [key, config] of Object.entries(utilityPages)) write(config.file, makeUtilityPage(key, config));

function makeInfoPage(file, config, body) {
  const source = read("methodology.html");
  const bodyAt = source.indexOf("<body");
  const bodyEnd = source.indexOf(">", bodyAt) + 1;
  const headerAt = source.indexOf("<header", bodyEnd);
  const headerEnd = source.indexOf("</header>", headerAt) + "</header>".length;
  const asideAt = source.indexOf('<aside class="community-cta"', headerEnd);
  let html = source.slice(0, bodyAt)
    + `<body data-page="${config.page}" data-kind="${config.kind || "surveyed"}">\n  `
    + source.slice(headerAt, headerEnd)
    + `\n\n${body}\n\n  `
    + source.slice(asideAt);
  html = html.replace(/ class="active"/g, "");
  html = setMetadata(html, config, file);
  html = setFirstJsonLd(html, pageSchema(config, file));
  return normalizeRootPage(html);
}

const aboutBody = `  <main class="wrap prose-page">
    <section class="hero hero-lede">
      <div class="eyebrow"><span class="tick">//</span> ownership, evidence, and corrections</div>
      <h1>About <span class="warm">OpenGauntlet</span></h1>
      <p class="lede">OpenGauntlet is an independent public research project from D3velop, built while developing Imprynt. It publishes measured conversational-AI benchmark results and clearly labeled, primary-source research catalogs.</p>
    </section>
    <section class="block prose">
      <h2>Who publishes it</h2>
      <p>OpenGauntlet is published by <a href="https://d3velop.com/" target="_blank" rel="noopener">D3velop</a>. The work began as internal model-selection research for <a href="https://imprynt.ai/" target="_blank" rel="noopener">Imprynt</a> and is shared publicly so builders can inspect the evidence instead of relying on vendor superlatives.</p>
      <h2>What is measured</h2>
      <p>The Words leaderboard directly measures local open-weight language models. Models receive the same multi-turn scenarios and instructions, then go through the same rubric and pairwise judging pipeline. Listening and Voices also publish smaller local experiments with their own disclosed recordings, listeners, hardware, methods, and limitations. Those labs are kept separate from the market surveys and are not population-wide rankings. The full conversational protocol is in the <a href="methodology.html">benchmark methodology</a>.</p>
      <h2>What is surveyed</h2>
      <p>The Listening and Voices market catalogs, plus Turns, Runtimes, Memory, Hardware, Orchestrators, Quantization, the wider LLM field, and Utilities, are sourced comparisons—not claims that OpenGauntlet benchmarked every listed system. Entries are checked against primary papers, official documentation, source repositories, model cards, or measured receipts, and uncertainty remains visible.</p>
      <h2>Editorial standards</h2>
      <ul><li>Measured, vendor-reported, paper-reported, and inferred claims are labeled separately.</li><li>Commercial-use and model-weight terms are checked separately from code licenses.</li><li>Missing evidence is reported as missing; it is not converted into a score.</li><li>Material corrections update the published data and provenance notes.</li><li>No placement can be purchased and no vendor sponsors a ranking.</li></ul>
      <h2>Corrections and contact</h2>
      <p>Every page links to its evidence. To challenge a claim or provide a stronger primary source, <a href="https://github.com/D3velop-llc/open-gauntlet-leaderboard/issues/new?title=Correction%3A%20" target="_blank" rel="noopener">open a correction request</a>. The public repository preserves the resulting change history.</p>
      <p class="scope-line"><strong>Last reviewed:</strong> ${TODAY}. This page describes the standards applied to the currently published site.</p>
    </section>
  </main>`;

write("about.html", makeInfoPage("about.html", {
  page: "about", type: "AboutPage", title: "About OpenGauntlet & Editorial Standards | OpenGauntlet",
  description: "Who publishes OpenGauntlet, what it measures, how sourced surveys differ from benchmarks, and the evidence, correction, and editorial standards used.",
}, aboutBody));

const licenseBody = `  <main class="wrap prose-page">
    <section class="hero hero-lede"><div class="eyebrow"><span class="tick">//</span> reuse the research responsibly</div><h1>OpenGauntlet <span class="warm">data license</span></h1><p class="lede">The original OpenGauntlet benchmark results and research compilation are available for reuse with attribution. Linked software, model weights, papers, and third-party source material keep their own licenses.</p></section>
    <section class="block prose"><h2>License</h2><p>Unless a file or field says otherwise, OpenGauntlet's original benchmark measurements, rankings, annotations, and compilation in the <code>data/</code> directory are licensed under the <a href="https://creativecommons.org/licenses/by/4.0/" rel="license">Creative Commons Attribution 4.0 International License</a>.</p><h2>Attribution</h2><p>Attribute reused data to “OpenGauntlet by D3velop” and link to <a href="https://opengauntlet.com/">opengauntlet.com</a>. Preserve source links and verification notes when republishing individual claims.</p><h2>What this does not license</h2><p>This license does not relicense third-party code, model weights, datasets, trademarks, papers, screenshots, audio, or vendor text referenced by the catalog. Consult each linked source for its terms. The site software and repository files are governed by any license stated in their respective files.</p><p class="scope-line"><strong>Effective:</strong> ${TODAY}.</p></section>
  </main>`;

write("data-license.html", makeInfoPage("data-license.html", {
  page: "data-license", type: "WebPage", title: "OpenGauntlet Data License | OpenGauntlet",
  description: "License and attribution terms for reusing OpenGauntlet benchmark results and research data, with third-party materials explicitly excluded.",
}, licenseBody));

// The committed site/ tree can be refreshed on a development checkout whose
// local bench.db is intentionally empty. Keep verified model-card URLs sourced
// from the private model configs so the public artifacts do not regress to the
// older database snapshots' null values between benchmark-machine renders.
if (ROOT !== WORKSPACE) {
  const configDir = join(WORKSPACE, "configs", "models");
  const sourceBySlug = new Map();
  for (const name of readdirSync(configDir).filter((item) => item.endsWith(".yaml"))) {
    const yaml = readFileSync(join(configDir, name), "utf8");
    const slug = yaml.match(/^slug:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
    const sourceUrl = yaml.match(/^source_url:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
    if (slug && /^https:\/\//.test(sourceUrl || "")) sourceBySlug.set(slug, sourceUrl);
  }
  const publicLeaderboard = JSON.parse(read("data/leaderboard.json"));
  for (const row of publicLeaderboard.models || []) {
    if (sourceBySlug.has(row.slug)) row.source_url = sourceBySlug.get(row.slug);
  }
  write("data/leaderboard.json", `${JSON.stringify(publicLeaderboard, null, 2)}\n`);
  for (const name of readdirSync(join(ROOT, "data", "models")).filter((item) => item.endsWith(".json"))) {
    const file = `data/models/${name}`;
    const detail = JSON.parse(read(file));
    if (!sourceBySlug.has(detail.slug)) continue;
    detail.source_url = sourceBySlug.get(detail.slug);
    write(file, `${JSON.stringify(detail, null, 2)}\n`);
  }
}

// Legacy query URLs cannot issue HTTP redirects on GitHub Pages. A same-origin
// location.replace is the cleanest migration path while all new internal links
// and sitemap entries point directly at the static canonical documents.
let legacy = normalizeRootPage(read("model.html"));
legacy = legacy.replace(/\n  <link rel="canonical" href="[^"]*">/, "");
legacy = legacy.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex,follow">');
if (!legacy.includes("legacy-model-redirect")) {
  legacy = legacy.replace("</head>", `  <script id="legacy-model-redirect">\n    const legacySlug = new URLSearchParams(location.search).get("slug");\n    if (legacySlug && /^[a-z0-9-]+$/.test(legacySlug)) location.replace(\`/models/\${encodeURIComponent(legacySlug)}/\`);\n  </script>\n</head>`);
}
write("model.html", legacy);

const leaderboard = JSON.parse(read("data/leaderboard.json"));
const rows = new Map((leaderboard.models || []).map((row) => [row.slug, row]));
const ranked = (leaderboard.models || []).filter((row) => row.ranked !== false).sort((a, b) => (b.normalized_elo ?? -Infinity) - (a.normalized_elo ?? -Infinity));
const rankBySlug = new Map(ranked.map((row, index) => [row.slug, index + 1]));
const modelFiles = readdirSync(join(ROOT, "data", "models")).filter((name) => name.endsWith(".json")).sort();

function modelDescription(row, detail) {
  const name = detail.display_name || row?.display_name || detail.slug;
  const score = row?.humanlike_score == null ? "" : ` Humanlikeness ${Math.round(row.humanlike_score)}/100.`;
  const speed = row?.tps_2k == null ? "" : ` Measured ${Number(row.tps_2k).toFixed(1)} words/sec at 2K context.`;
  const full = `${name} tested on 30 multi-turn conversations with rubric scores, pairwise results, transcript evidence, and local hardware measurements.${score}${speed}`;
  if (full.length <= 158) return full;
  const fallback = `${name} benchmark: humanlikeness scores, pairwise rankings, transcripts, latency, and measured local speed.`;
  if (fallback.length <= 158) return fallback;
  return `${fallback.slice(0, 157).replace(/\s+\S*$/, "").replace(/[,:;]$/, "")}.`;
}

function makeModelPage(detail) {
  const row = rows.get(detail.slug) || {};
  const sourceUrl = detail.source_url || row.source_url;
  const name = detail.display_name || row.display_name || detail.slug;
  const titleBase = `${name} benchmark results`;
  const title = titleBase.length <= 58 ? `${titleBase} | OpenGauntlet` : titleBase;
  const description = modelDescription(row, detail);
  const file = `models/${detail.slug}/index.html`;
  let html = read("model.html").replace(/  <script id="legacy-model-redirect">[\s\S]*?<\/script>\n/, "");
  html = html.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">');
  html = setMetadata(html, { title, description, canonical: `/models/${detail.slug}/` }, file);
  html = html.replace('data-page="model"', `data-page="model" data-model-id="${esc(detail.slug)}"`);
  html = html.replace(/<section class="detail-head">[\s\S]*?<\/section>/, `<section class="detail-head"><a class="back" href="/">← back to the leaderboard</a><h1 data-model-name>${esc(name)} conversational AI benchmark</h1><div class="detail-source" data-model-source>${sourceUrl ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">Model source ↗</a>` : ""}</div><div class="slug mono" data-model-slug>${esc(detail.slug)}</div></section>`);
  const rank = rankBySlug.get(detail.slug);
  const stats = [
    rank ? `<div><dt>Leaderboard rank</dt><dd>#${rank} of ${ranked.length}</dd></div>` : `<div><dt>Status</dt><dd>Provisional</dd></div>`,
    row.humanlike_score != null ? `<div><dt>Humanlikeness</dt><dd>${Number(row.humanlike_score).toFixed(1)} / 100</dd></div>` : "",
    row.normalized_elo != null ? `<div><dt>Pairwise rating</dt><dd>${Math.round(row.normalized_elo)}</dd></div>` : "",
    row.tps_2k != null ? `<div><dt>Measured speed</dt><dd>${Number(row.tps_2k).toFixed(1)} words/sec</dd></div>` : "",
  ].filter(Boolean).join("");
  const summary = `<section class="block model-seo-summary" aria-label="Benchmark summary"><p>${esc(description)}</p><dl class="model-seo-stats">${stats}</dl><p class="scope-line"><strong>Evidence:</strong> identical scenario pack and judge protocol; measured and judged results are shown separately below. <a href="/methodology.html">Read the methodology</a>.</p></section>`;
  html = html.replace('<section class="block">\n      <div id="model">', `${summary}\n    <section class="block">\n      <div id="model">`);
  html = html.replace(/href="(?!https?:|\/|#|mailto:)([^"]+)"/g, 'href="/$1"');
  html = html.replace(/src="(?!https?:|\/)([^"]+)"/g, 'src="/$1"');
  html = html.replace("</head>", `  <script>window.OG = { modelBase: "/models/", assetRoot: "/", modelSlug: ${JSON.stringify(detail.slug)} };</script>\n</head>`);
  const schema = {
    "@context": "https://schema.org", "@type": "WebPage", name: titleBase,
    url: `${ORIGIN}/models/${detail.slug}/`, description, dateModified: TODAY,
    isPartOf: { "@type": "WebSite", name: "OpenGauntlet", url: `${ORIGIN}/` },
    about: { "@type": "SoftwareApplication", name, applicationCategory: "Artificial Intelligence", ...(sourceUrl ? { url: sourceUrl } : {}) },
    breadcrumb: { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "OpenGauntlet", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: "Model results", item: `${ORIGIN}/models/` },
      { "@type": "ListItem", position: 3, name, item: `${ORIGIN}/models/${detail.slug}/` },
    ] },
    publisher: { "@type": "Organization", name: "D3velop", url: "https://d3velop.com/" },
  };
  return setFirstJsonLd(html, schema);
}

const modelLinks = [];
for (const name of modelFiles) {
  const detail = JSON.parse(read(`data/models/${name}`));
  write(`models/${detail.slug}/index.html`, makeModelPage(detail));
  const row = rows.get(detail.slug) || {};
  modelLinks.push({ slug: detail.slug, name: detail.display_name || row.display_name || detail.slug, rank: rankBySlug.get(detail.slug), score: row.humanlike_score });
}

const modelIndexItems = modelLinks.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name)).map((model) => `<li><a href="/models/${esc(model.slug)}/">${esc(model.name)}</a>${model.rank ? ` — rank #${model.rank}, humanlikeness ${Number(model.score).toFixed(1)}/100` : " — provisional"}</li>`).join("\n        ");
const modelIndexBody = `  <main class="wrap prose-page"><section class="hero hero-lede"><div class="eyebrow"><span class="tick">//</span> one canonical page per measured configuration</div><h1>Conversational AI <span class="warm">model benchmark results</span></h1><p class="lede">Every model and quantized configuration tested by OpenGauntlet, with its own rubric scores, pairwise standing, transcripts, and measured hardware performance.</p></section><section class="block prose"><h2>All measured model configurations</h2><ol class="model-index-list">${modelIndexItems}</ol><p>Results use the same scenario pack and judging protocol. <a href="/methodology.html">Read the methodology</a> or <a href="/compare.html">compare two models head to head</a>.</p></section></main>`;
write("models/index.html", makeInfoPage("models/index.html", {
  page: "model-index", type: "CollectionPage", canonical: "/models/",
  title: "Conversational AI Model Benchmark Results | OpenGauntlet",
  description: "Browse every local conversational AI model and quantized configuration tested by OpenGauntlet, with scores, transcripts, latency, and speed.",
}, modelIndexBody).replace(/href="(?!https?:|\/|#|mailto:)([^"]+)"/g, 'href="/$1"').replace(/src="(?!https?:|\/)([^"]+)"/g, 'src="/$1"'));

function navLink(href, label, sub, isActive, dot) {
  return `<a href="${href}"${isActive ? ' class="active" aria-current="page"' : ""}><span class="nav-evidence-label"><span class="ev ${dot}" aria-hidden="true"></span>${label}</span><span class="nm-sub">${sub}</span></a>`;
}

function evidenceDropdown(label, topic, currentTopic, currentEvidence, measuredHref, measuredSub, surveyedHref, surveyedSub) {
  const isTopic = currentTopic === topic;
  return `<details class="nav-more nav-topic"><summary${isTopic ? ' class="active"' : ""} title="${label} — choose measured or surveyed evidence"><span class="nav-topic-marks" aria-hidden="true"><span class="ev solid"></span><span class="ev hollow"></span></span>${label}</summary>
          <div class="nav-more-panel nav-evidence-panel">
            ${navLink(measuredHref, "Measured", measuredSub, isTopic && currentEvidence === "measured", "solid")}
            ${navLink(surveyedHref, "Surveyed", surveyedSub, isTopic && currentEvidence === "surveyed", "hollow")}
          </div>
        </details>`;
}

function normalizeTopNav(html, file) {
  const clean = file.replaceAll("\\", "/");
  let currentTopic = "";
  let currentEvidence = "";
  if (clean === "asr.html" || clean === "asr-survey.html") {
    currentTopic = "listening"; currentEvidence = clean.includes("survey") ? "surveyed" : "measured";
  } else if (clean === "tts.html" || clean === "tts-survey.html") {
    currentTopic = "voices"; currentEvidence = clean.includes("survey") ? "surveyed" : "measured";
  } else if (clean === "index.html" || clean === "llms.html" || clean === "model.html" || clean.startsWith("models/")) {
    currentTopic = "words"; currentEvidence = clean === "llms.html" ? "surveyed" : "measured";
  }
  const direct = (name, href, label, title) => `<a href="${href}" title="${title}"${clean === name ? ' class="active" aria-current="page"' : ""}><span class="ev hollow" aria-hidden="true"></span>${label}</a>`;
  const referenceFiles = new Set(["hardware.html", "quantization.html", "orchestrators.html", "utilities.html", "speaker-verification.html", "wake-word-detection.html", "speech-enhancement.html"]);
  const aboutFiles = new Set(["about.html", "methodology.html", "compare.html", "tts-guide.html", "tts-legal.html", "data-license.html"]);
  const item = (href, label, sub) => {
    const name = href.slice(1);
    const active = clean === name || (name === "utilities.html" && ["speaker-verification.html", "wake-word-detection.html", "speech-enhancement.html"].includes(clean));
    return `<a href="${href}"${active ? ' class="active" aria-current="page"' : ""}>${label}<span class="nm-sub">${sub}</span></a>`;
  };
  const nav = `<nav class="nav" aria-label="Primary navigation">
        ${evidenceDropdown("Listening", "listening", currentTopic, currentEvidence, "/asr.html", "14 local results", "/asr-survey.html", "106 sourced systems")}
        ${direct("turns.html", "/turns.html", "Turns", "Turns — turn-taking: whose turn it is")}
        ${evidenceDropdown("Words", "words", currentTopic, currentEvidence, "/", "37 benchmarked models", "/llms.html", "51 sourced models")}
        ${evidenceDropdown("Voices", "voices", currentTopic, currentEvidence, "/tts.html", "16 local results", "/tts-survey.html", "168 sourced systems")}
        ${direct("runtimes.html", "/runtimes.html", "Runtimes", "Runtimes — inference engines: how it runs")}
        ${direct("memory.html", "/memory.html", "Memory", "Memory — retrieval systems: what it remembers")}
        <details class="nav-more"><summary${referenceFiles.has(clean) ? ' class="active"' : ""}>Reference</summary>
          <div class="nav-more-panel">
            ${item("/hardware.html", "What fits where", "hardware")}
            ${item("/quantization.html", "How models get compressed", "quantization")}
            ${item("/orchestrators.html", "Wiring it together", "orchestrators")}
            ${item("/utilities.html", "The parts around the edges", "utilities")}
          </div>
        </details>
        <details class="nav-more"><summary${aboutFiles.has(clean) ? ' class="active"' : ""}>About</summary>
          <div class="nav-more-panel">
            ${item("/about.html", "About OpenGauntlet", "ownership &amp; standards")}
            ${item("/methodology.html", "How it works", "methodology")}
            ${item("/compare.html", "Head to head", "two models, same chat")}
            ${item("/tts-guide.html", "Reading the voice numbers", "guide")}
            ${item("/tts-legal.html", "What you may ship", "voice licences")}
          </div>
        </details>
      </nav>`;
  return html.replace(/<nav class="nav"(?:\s[^>]*)?>[\s\S]*?<\/nav>/, nav);
}

function walkHtml(dir = ROOT) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === ".git" || entry.name === "vendor" || entry.name === ".remember") return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walkHtml(full);
    return entry.name.endsWith(".html") ? [relative(ROOT, full).replaceAll("\\", "/")] : [];
  });
}

for (const file of walkHtml()) {
  let html = normalizeTopNav(read(file), file);
  html = html.replace(/static\/site\.css\?v=[a-f0-9]+/g, `static/site.css?v=${assetVersions["site.css"]}`);
  html = html.replace(/static\/site\.js\?v=[a-f0-9]+/g, `static/site.js?v=${assetVersions["site.js"]}`);
  write(file, html);
}

// In the private source repository the public tree lives under site/. Publish
// the same post-build and validator beside that tree so the public README's
// documented commands remain truthful without exposing any private sources.
if (ROOT !== WORKSPACE) {
  for (const name of ["seo-build.mjs", "validate-seo.mjs"]) {
    write(`scripts/${name}`, readFileSync(join(WORKSPACE, "scripts", name), "utf8"));
  }
}

function gitDate(file) {
  if (changed.has(file) || !existsSync(join(ROOT, file))) return TODAY;
  try {
    const dirty = execFileSync("git", ["status", "--porcelain", "--", file], { cwd: ROOT, encoding: "utf8" }).trim();
    if (dirty) return TODAY;
    return execFileSync("git", ["log", "-1", "--format=%cs", "--", file], { cwd: ROOT, encoding: "utf8" }).trim() || TODAY;
  } catch {
    return TODAY;
  }
}

const sitemapFiles = [
  ...Object.keys(pages), "about.html", "data-license.html",
  ...Object.values(evidencePairs).map((pair) => pair.surveyedFile),
  ...Object.values(utilityPages).map((item) => item.file), "models/index.html",
  ...modelLinks.map((model) => `models/${model.slug}/index.html`),
].filter((file) => file !== "model.html");
const urls = sitemapFiles.map((file) => {
  const loc = file === "index.html" ? `${ORIGIN}/` : file === "models/index.html" ? `${ORIGIN}/models/` : file.endsWith("/index.html") ? `${ORIGIN}/${file.slice(0, -"index.html".length)}` : `${ORIGIN}/${file}`;
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${gitDate(file)}</lastmod>\n  </url>`;
}).join("\n");
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

// Fail loudly if a future generator changes the page shell in a way that
// silently drops the SEO contract.
const validationFiles = [...sitemapFiles, "model.html"];
const errors = [];
for (const file of validationFiles) {
  const html = read(file);
  const canonicals = (html.match(/<link rel="canonical"/g) || []).length;
  const h1s = (html.match(/<h1(?:\s|>)/g) || []).length;
  const descriptions = (html.match(/<meta name="description"/g) || []).length;
  if (file !== "model.html" && canonicals !== 1) errors.push(`${file}: expected one canonical, found ${canonicals}`);
  if (file === "model.html" && canonicals !== 0) errors.push(`${file}: legacy redirect must not declare a canonical`);
  if (h1s !== 1) errors.push(`${file}: expected one h1, found ${h1s}`);
  if (descriptions !== 1) errors.push(`${file}: expected one description, found ${descriptions}`);
}
if (errors.length) throw new Error(`SEO build validation failed:\n${errors.join("\n")}`);

console.log(`SEO build complete: ${modelLinks.length} canonical model pages, ${sitemapFiles.length} sitemap URLs, ${changed.size} files updated${changed.size ? ` (${[...changed].join(", ")})` : ""}.`);
