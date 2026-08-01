/* ============================================================================
   OpenGauntlet — client renderer. All views are data-driven: each page fetches
   its JSON from data/*.json (fetch('data/leaderboard.json'), etc.) and builds
   the DOM here. No inlined result data, no external hosts. Chart.js is the
   vendored global `Chart` (see ../vendor/chart.umd.min.js).
   ========================================================================== */
"use strict";

/* ---- tiny DOM helper (textContent everywhere → no injection) ------------ */
function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) for (const k in props) {
    if (k === "class") n.className = props[k];
    else if (k === "text") n.textContent = props[k];
    else if (k.startsWith("on") && typeof props[k] === "function") n.addEventListener(k.slice(2), props[k]);
    else if (props[k] != null) n.setAttribute(k, props[k]);
  }
  for (const kid of kids) {
    if (kid == null) continue;
    n.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return n;
}
const $ = (sel, root = document) => root.querySelector(sel);

/* Comfortable adult reading speed, ~240 words/min. The one anchor that makes a words-per-second
   figure mean anything to a lay reader: at or above this, text arrives faster than you can read
   it, so more speed buys nothing you'd notice in conversation. */
const READING_WPS = 4;

/* ---- formatting --------------------------------------------------------- */
const fmt = {
  n1: (v) => (v == null ? "—" : Number(v).toFixed(1)),
  n2: (v) => (v == null ? "—" : Number(v).toFixed(2)),
  n3: (v) => (v == null ? "—" : Number(v).toFixed(3)),
  int: (v) => (v == null ? "—" : Math.round(Number(v)).toLocaleString()),
  usd: (v) => (v == null ? "—" : "$" + Number(v).toFixed(2)),
  pct: (v) => (v == null ? "—" : (Number(v) * 100).toFixed(0) + "%"),
  pct1: (v) => (v == null ? "—" : (Number(v) * 100).toFixed(1) + "%"),
  ppDelta: (v) => (v == null ? "—" : (Number(v) < 0 ? "" : "+") + (Number(v) * 100).toFixed(1) + "pp"),
  eloCI: (row) => {
    if (row.normalized_elo == null) return "—";
    const base = Math.round(Number(row.normalized_elo));
    if (row.elo_ci_low == null || row.elo_ci_high == null) return String(base);
    return `${base} (${Math.round(Number(row.elo_ci_low))}–${Math.round(Number(row.elo_ci_high))})`;
  },
  score100: (v) => (v == null ? "—" : Math.round(Number(v)) + " /100"),
  secs: (v) => (v == null ? "—" : (Number(v) / 1000).toFixed(1) + "s"),  // ms → "1.6s"
  wps: (v) => (v == null ? "—" : Math.round(Number(v)) + "/s"),
  size: (row) => {
    if (row.params_total_b == null) return "—";
    const t = row.params_total_b;
    // MoE: "26B (uses 4B/reply)" — the active count explains SPEED, not memory (all weights
    // sit in VRAM), so it is phrased so a reader never mistakes it for a smaller footprint.
    if (row.params_active_b != null && row.params_active_b !== t) return `${t}B (uses ${row.params_active_b}B/reply)`;
    return `${t}B`;
  },
};

/* ---- honest "can I run it?" estimate --------------------------------------
   The single most-asked question from a non-technical reader. VRAM is estimated from the
   model's REAL precision, never a guess: GGUF quant codes and slug hints (nvfp4/fp8) give
   bits-per-weight; a safetensors model with no quant is genuinely full precision (bf16).
   MoE uses TOTAL params — every expert's weights occupy memory even if only some run per
   token. Returns null when precision truly can't be determined, so the cell shows "—"
   rather than a fabricated number (the failure mode a review flagged: labelling a 4-bit
   model "full precision" and telling a user they need an 80GB card for a 26GB model). */
function gbPerB(row) {
  const q = (row.quant || "").toString().toLowerCase();
  const s = (row.slug || "").toString().toLowerCase();
  if (q.includes("q4") || s.includes("nvfp4") || s.includes("-fp4") || q.includes("nvfp4")) return 0.60;
  if (q.includes("q5")) return 0.70;
  if (q.includes("q6")) return 0.82;
  if (q.includes("q8")) return 1.06;
  if (q.includes("fp8") || s.includes("fp8")) return 1.00;
  if (q.includes("q3") || q.includes("iq3")) return 0.48;
  if (q.includes("q2") || q.includes("iq2")) return 0.38;
  // No quant code and a container backend (vLLM or SGLang) → a safetensors model at full
  // precision (bf16). Both serve the same uncompressed weights; keying only on "vllm" left
  // every SGLang model without a memory estimate ("—").
  if ((q === "" || q === "unknown" || q == null)
      && (row.backend === "vllm" || row.backend === "sglang")) return 2.0;
  if (q.includes("fp16") || q.includes("bf16") || q.includes("f16")) return 2.0;
  return null;  // genuinely unknown — do not guess
}
function vramGB(row) {
  const per = gbPerB(row);
  if (per == null || row.params_total_b == null) return null;
  const raw = row.params_total_b * per * 1.15 + 1.5;   // +15% runtime, +~1.5GB KV cache
  const tiers = [8, 12, 16, 24, 32, 48, 64, 80, 96, 128];
  return tiers.find((t) => t >= raw) || Math.ceil(raw / 16) * 16;
}
function vramLabel(row) {
  const gb = vramGB(row);
  return gb == null ? "—" : `~${gb} GB`;
}

// Human-readable "how it's compressed · what runs it" sub-label. Never prints the raw "unknown"
// quant (which reads as broken data): a safetensors model with no quant code is full precision,
// and nvfp4/fp8 are recovered from the slug — same precision logic the VRAM estimate uses.
// How this model's precision is named for a reader. Keyed off the PRECISION, not off where we
// learned it: configs now carry an explicit quant (BF16 / NVFP4) where they used to say
// "unknown", and without the first two cases that backfill would silently retitle
// "full precision" -> "BF16" for every safetensors model and "NVFP4 (4-bit)" -> "NVFP4".
function precisionName(row) {
  const q = (row.quant || "").toString();
  const s = (row.slug || "").toString().toLowerCase();
  const ql = q.toLowerCase();
  if (ql === "bf16" || ql === "f16" || ql === "fp16") return "full precision";
  if (ql.includes("nvfp4") || s.includes("nvfp4") || s.includes("-fp4")) return "NVFP4 (4-bit)";
  if (ql.includes("fp8") || s.includes("fp8")) return "FP8 (8-bit)";
  if (q && ql !== "unknown") return q;                              // GGUF quant code, keep it
  return "full precision";
}

// Compressed or not, as ONE class for the filter and the sort. Derived from gbPerB() — the same
// bits-per-weight the VRAM estimate uses — so this column can never disagree with the memory
// figure sitting next to it. null when precision is genuinely undeterminable; that must show as
// "—" rather than being bucketed into either group.
function precisionClass(row) {
  const per = gbPerB(row);
  if (per == null) return null;
  return per >= 1.5 ? "full" : "quantized";   // bf16/f16 = 2.0; q8_0 = 1.06; fp8 = 1.00
}

function cfgLabel(row) {
  const engine = { vllm: "vLLM", sglang: "SGLang", "llama.cpp": "llama.cpp" }[row.backend] || row.backend;
  return [precisionName(row), engine].filter(Boolean).join(" · ");
}

async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

function fail(mount, msg) {
  mount.replaceChildren(el("div", { class: "state err" }, msg));
}

/* ---- thermal ramp: cold slate (low) → ember (high) — matches the verdict rail palette --- */
const H0 = [46, 61, 92], H1 = [107, 83, 63], H2 = [245, 163, 75];
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function warmth(t) {
  t = Math.max(0, Math.min(1, t));
  const [a, b, u] = t < 0.5 ? [H0, H1, t / 0.5] : [H1, H2, (t - 0.5) / 0.5];
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}
function heatText(rgb) {
  // cells paint the ramp at 0.72 alpha over the dark surface — judge contrast
  // against the EFFECTIVE luminance of that blend, not the raw ramp color
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  const eff = 0.72 * lum + 0.28 * 20;
  return eff > 132 ? "#17110a" : "#E8EAF0";
}

/* ============================ LEADERBOARD ================================= */
// Plain-language columns for a non-technical reader. Everything is scannable without a glossary;
// the deeper stats (paired-comparison counts, judging cost, quant codes, the Bradley-Terry math)
// live on the Methodology and per-model pages, not here. Order answers, left to right: which
// model, how big, can I run it, how human, then the two speed numbers.

/* Single source of truth: internal rubric key → human label, family group, and tooltip.
   The data layer keys everything by `key`; the UI shows `label`/`family`. A test asserts
   these keys exactly match RUBRIC_CRITERIA so the two can never drift. Order matches
   RUBRIC_CRITERIA. */
const CRITERIA = [
  { key: "demonstrated_empathy",  label: "Empathy",            family: "Emotional IQ",     tip: "Does it truly get how you feel?" },
  { key: "emotional_reasoning",   label: "Emotional insight",  family: "Emotional IQ",     tip: "Does it read the situation right?" },
  { key: "humanlike_naturalness", label: "Sounds human",       family: "Conversation",     tip: "Like a person, not a bot" },
  { key: "conversational_flow",   label: "Conversation flow",  family: "Conversation",     tip: "Natural back-and-forth" },
  { key: "persona_consistency",   label: "Stays in character", family: "Memory & persona", tip: "Consistent personality" },
  { key: "memory_integration",    label: "Remembers",          family: "Memory & persona", tip: "Recalls what you said earlier" },
  { key: "boundary_quality",      label: "Handles boundaries", family: "Boundaries",       tip: "Navigates hard/unsafe asks well" },
  { key: "assistant_smell",       label: "Not robotic",        family: "Conversation",     tip: "Avoids 'As an AI…' corporate tone" },
  { key: "slop_index",            label: "Fresh writing",      family: "Conversation",     tip: "Avoids clichés and filler" },
];

/* ---- one vocabulary for the whole site ---------------------------------
   CRITERIA above is the single source of plain-language names, but only the leaderboard
   used it — the model, compare and methodology pages printed raw keys ("assistant smell",
   "slop index"), so the same measurement had two different names depending on the page.
   Everything now routes through these. */
function critLabel(key) {
  const c = CRITERIA.find((x) => x.key === key);
  return c ? c.label : String(key || "").replace(/_/g, " ");
}
function critTip(key) {
  const c = CRITERIA.find((x) => x.key === key);
  return c ? c.tip : "";
}
/* Two axes are INVERTED — a high score means "less of the bad thing". Without saying so, a
   reader sees "Not robotic 14.3/20" and cannot tell which direction is good. */
const INVERTED_CRITERIA = { assistant_smell: "20 = no corporate-AI tone at all",
                            slop_index: "20 = freshest writing, no clichés" };
/* Scenario families, de-underscored. `Boundaries_safety` is a database key, not a heading. */
function categoryLabel(key) {
  const map = {
    emotional_support: "Emotional support", conflict: "Conflict",
    everyday_banter: "Everyday banter", persona_pressure: "Staying in character",
    memory_callback: "Remembering", boundaries_safety: "Boundaries & safety",
    theory_of_mind: "Reading between the lines",
  };
  return map[key] || String(key || "").replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase());
}
/* Scenario id -> human title ("Just help me this once", not "bs_conceal_harmful").
   Populated from compare.json / the model detail doc; falls back to the id. */
let SCENARIO_TITLES = {};
function scenarioLabel(id) {
  const m = SCENARIO_TITLES[id];
  return (m && m.title) || String(id || "");
}

const COLS = [
  { key: "rank", label: "#", css: "txt", group: "", simple: true },
  { key: "model", label: "Model", css: "txt", type: "text", group: "", simple: true },
  { key: "size", label: "Size", type: "text", group: "",
    title: "How big the model is, in billions of parameters. Smaller is easier to run. "
         + "'26B (uses 4B/reply)' means it's a big model that only activates part of itself "
         + "each reply — that makes it faster, but it still needs the full size in memory." },
  { key: "vram", label: "Runs on", type: "text", group: "", simple: true,
    title: "Rough graphics-card memory (VRAM) needed to run it. Under ~12 GB fits most gaming "
         + "GPUs; 24 GB needs a high-end card; 48 GB+ is server-class. Estimated from the "
         + "model's compression — treat as a ballpark. '—' = couldn't estimate." },
  // Sorts by actual bits-per-weight (gbPerB), so clicking it groups full precision together AND
  // orders the compressed tier Q8 -> Q6 -> Q5 -> Q4 rather than alphabetically by quant code.
  { key: "precision", label: "Precision", type: "text", group: "",
    title: "Whether these are the model's original weights (full precision) or a compressed "
         + "copy — quantizing shrinks a model so it runs faster in less memory, at some cost "
         + "to quality. Heads up on reading the ranking: on this board every full-precision "
         + "model also happens to be a newer architecture served by vLLM/SGLang, and every "
         + "compressed one is a llama.cpp community fine-tune. Those two things move together "
         + "here, so the score gap between the groups can't be pinned on precision alone." },
  { key: "normalized_elo", label: "Human score", type: "num", heat: true, group: "How it scored", simple: true,
    title: "How human the model sounds, as a chess-style rating — higher is better, no maximum. "
         + "The range in parentheses is our margin of error: if two models' ranges overlap, "
         + "treat them as tied." },
  { key: "win_rate", label: "Win rate", type: "num", heat: true, group: "How it scored",
    title: "How often the judge picked this model over another one in a head-to-head chat." },
  { key: "eq_score", label: "Emotional IQ", type: "num", heat: true, group: "How it scored",
    title: "Does it read the emotion and respond with real empathy? Judge's rating out of 100." },
  { key: "humanlike_score", label: "Humanlike", type: "num", heat: true, group: "How it scored",
    title: "Does it sound like a person instead of a corporate bot? Judge's rating out of 100." },
  // Reply length is STYLE, not quality — deliberately no heat coloring and never part of the
  // ranking. It shows the ACTUAL average words per assistant reply; a companion/roleplay app
  // reader may WANT longer replies, so it's presented neutrally (no "better"/"worse").
  { key: "avg_reply_words", label: "Reply length", type: "num", group: "How it scored",
    title: "Average words per assistant reply. This is STYLE, not quality, and is NOT part of "
         + "the ranking — for a companion or roleplay app you may prefer longer replies." },
  { key: "ttft_2k_ms", label: "Wait for 1st word", type: "num", group: "Speed",
    title: "How long before it starts replying to a long (~2,000-word) prompt. Lower is better. "
         + "'—' = not speed-tested yet." },
  { key: "tps_2k", label: "Speed", type: "num", group: "Speed", simple: true,
    title: "How fast it writes once it starts, in words per second. Higher is faster. "
         + "'—' = not speed-tested yet." },
];
// mark group starts once so header AND body cells can draw the boundary rule
for (let i = 1; i < COLS.length; i++) COLS[i].gstart = COLS[i].group !== COLS[i - 1].group;
const GROUP_TITLES = {
  "How it scored": "How a top commercial AI (GPT-5.4) graded each model — same test for all.",
  "Speed": "Measured on this machine — no AI judge involved.",
};

/* ---- multi-hardware speed: leaderboard selector state --------------------
   The Speed columns headline dgx-spark by default, but a model may have been measured (or
   found not to fit) on other declared machines too (`row.perf_by_hardware`, keyed by
   hardware_id — see site_gen.py `_perf_by_hardware`). `activeHardware` is the ONE thing the
   selector changes: which machine's numbers the Speed columns show. It never touches sort
   order — `currentSpeedRefresh` (set by whichever leaderboard table is currently mounted)
   patches just the two speed cells' textContent per row, in place, so the row order on
   screen can never move because of a hardware switch. */
let activeHardware = "dgx-spark";
let currentSpeedRefresh = () => {};
// Precision filter: "all" | "full" | "quantized". Unlike the hardware selector (display-only),
// this one removes rows, so it re-runs the sort — `currentRowsRefresh` is set by whichever
// leaderboard table is mounted, same closure trick as currentSpeedRefresh.
let activePrecision = "all";
let currentRowsRefresh = () => {};

// Resolve what a Speed cell should show for one row/key ("ttft_2k_ms" | "tps_2k") under the
// currently active machine. Honest about the three states a machine can be in for a model:
// measured (real number), doesnt_fit (this machine can't hold the weights), not_measured
// (declared but never benchmarked here). NEVER coerces a missing/unfit number to 0 — that
// would read as "instant" or "zero throughput" instead of "we don't know" / "can't run it".
function speedDisplay(row, key) {
  const pbh = row.perf_by_hardware || {};
  const entry = pbh[activeHardware];
  const fmtSpeed = (v) => (v == null ? "—" : (key === "ttft_2k_ms" ? fmt.secs(v) : fmt.wps(v)));
  if (!entry) {
    // No hardware-scoped data for this machine at all — either an export that predates
    // per-hardware perf, or this model was never profiled on a non-default machine. dgx-spark
    // keeps its historical headline fields so old data keeps rendering; any other machine
    // is honestly "not measured", not a guess.
    if (activeHardware === "dgx-spark") return { text: fmtSpeed(row[key]), muted: false };
    return { text: "—", muted: false };
  }
  if (entry.state === "doesnt_fit") return { text: "doesn't fit", muted: true };
  if (entry.state === "not_measured") return { text: "—", muted: false };
  return { text: fmtSpeed(entry[key]), muted: false };
}
function applySpeedCell(td, row, key) {
  const { text, muted } = speedDisplay(row, key);
  td.textContent = text;
  td.classList.toggle("hw-nofit", muted);
}

// Resolves the value a Speed column SORTS by for the currently active machine — must mirror
// speedDisplay()'s honesty rules exactly (same entry lookup, same dgx-spark-only legacy
// fallback, same "unmeasured/doesn't-fit is not a number") so the column is never ordered by
// numbers other than the ones it displays. Returns null (not 0) when there is nothing to sort
// by; the caller's existing numeric-column null-handling sinks those rows the same as any
// other missing metric.
function speedSortValue(row, key) {
  const pbh = row.perf_by_hardware || {};
  const entry = pbh[activeHardware];
  if (!entry) return activeHardware === "dgx-spark" ? row[key] : null;
  if (entry.state !== "measured") return null;
  return entry[key];
}

// Populates <select id="hardwareSelect"> from window.OG_HARDWARE (set where each page's data
// loads — see initLeaderboard/initModel) and wires it to re-source the Speed columns ONLY.
// Mounted alongside the existing "Rank by" controls; a no-op (nothing appended) if the export
// carries no hardware list (older DB) or the mount point doesn't exist on this page.
/* Short machine label for the simple board — three of these share one cell, so "RTX 5090"
   and "DGX Spark" get their vendor prefix dropped. */
function hwShortName(id) {
  const hw = (window.OG_HARDWARE || []).find((h) => h.hardware_id === id);
  const name = (hw && hw.display_name) || id;
  return name.replace(/^(RTX|GTX|DGX|RX)\s+/i, "");
}

/* Every machine this model was actually MEASURED on, fastest first.
   Simple view shows them all at once rather than one machine plus a picker: a lone number
   ("8/s") is uninterpretable without naming the hardware, and the picker lived in chrome the
   simple view hides. `doesnt_fit` and `not_measured` are omitted entirely — a cell listing
   what a model can't do is noise here; the technical view still reports both states. */
function speedAllDisplay(row) {
  const pbh = row.perf_by_hardware || {};
  const out = [];
  for (const [id, entry] of Object.entries(pbh)) {
    if (entry && entry.state === "measured" && entry.tps_2k != null) {
      out.push({ id, label: hwShortName(id), tps: entry.tps_2k });
    }
  }
  // Pre-per-hardware exports carry only the dgx-spark headline fields; keep them rendering.
  if (!out.length && row.tps_2k != null) {
    out.push({ id: "dgx-spark", label: hwShortName("dgx-spark"), tps: row.tps_2k });
  }
  return out.sort((a, b) => b.tps - a.tps);
}

/* Measured words/sec on one machine, or null when it wasn't measured or doesn't fit. */
function speedOn(row, hardwareId) {
  const e = (row.perf_by_hardware || {})[hardwareId];
  if (e) return e.state === "measured" ? e.tps_2k : null;
  return hardwareId === "dgx-spark" ? (row.tps_2k ?? null) : null;
}

function renderHardwareSelect() {
  const mount = document.getElementById("rank-by");
  const hw = window.OG_HARDWARE || [];
  if (!mount || !hw.length) return;
  const select = el("select", { id: "hardwareSelect" });
  hw.forEach((h) => select.appendChild(el("option", { value: h.hardware_id }, h.display_name || h.hardware_id)));
  select.value = activeHardware;
  select.addEventListener("change", () => {
    activeHardware = select.value;       // display-only — never re-sorts the ladder
    currentSpeedRefresh();
  });
  mount.appendChild(el("div", { class: "hwselect" },
    el("label", { for: "hardwareSelect", class: "hwselect-lbl", text: "Speed shown for:" }),
    select));
}

// Precision filter, mounted next to the hardware selector. Deliberately defaults to "All": the
// full-precision tier tops this board, and opening on a filtered view would present that as a
// finding rather than something the reader chose to look at. The counterexamples (a
// full-precision model at #11 and #16) only stay visible in the unfiltered default.
function renderPrecisionSelect() {
  const mount = document.getElementById("rank-by");
  if (!mount) return;
  const select = el("select", { id: "precisionSelect" });
  [["all", "All"], ["full", "Full precision"], ["quantized", "Quantized"]]
    .forEach(([v, label]) => select.appendChild(el("option", { value: v }, label)));
  select.value = activePrecision;
  select.addEventListener("change", () => {
    activePrecision = select.value;
    currentRowsRefresh();
  });
  mount.appendChild(el("div", { class: "hwselect" },
    el("label", { for: "precisionSelect", class: "hwselect-lbl", text: "Precision:" }),
    select));
}

// Heat ranges are computed from RANKED models only. A provisional model's score comes from a
// partial, non-random slice of its corpus, so letting it set an endpoint would rescale every
// other model's cell against a number that doesn't mean the same thing.
function columnRange(models, key) {
  const pool = models.filter((m) => m.ranked !== false);
  const vals = (pool.length ? pool : models).map((m) => m[key]).filter((v) => v != null).map(Number);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

// Heat range over an arbitrary accessor (the synthetic criterion column reads row.criteria[key]).
function columnRangeBy(models, get) {
  const pool = models.filter((m) => m.ranked !== false);
  const vals = (pool.length ? pool : models).map(get).filter((v) => v != null).map(Number);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

function renderLeaderboard(models, rankKey = null, simple = false) {
  const crit = rankKey ? CRITERIA.find((c) => c.key === rankKey) : null;
  // In criterion mode: replace the "Human score" (Elo) column with a column showing this
  // criterion's 0-100 score, and drop the head-to-head Win-rate column. Everything else
  // (Size, Runs on, Emotional IQ, Humanlike, speed) stays. `criterion` is a synthetic column.
  let cols = !crit ? COLS : COLS
    .filter((c) => c.key !== "win_rate")
    .map((c) => c.key === "normalized_elo"
      ? { key: "criterion", label: crit.label, type: "num", heat: true,
          group: "How it scored", title: crit.tip, gstart: c.gstart }
      : c);

  // Simple view: the five COLS entries flagged `simple`, with the four-digit Elo swapped for
  // a bar scaled across the board's own range. Same column-substitution mechanism criterion
  // mode uses above, so COLS stays the single source of truth for the technical view.
  // Criterion mode is a technical-view feature, so the two never combine.
  const eloRange = columnRange(models, "normalized_elo");
  if (simple && !crit) {
    cols = cols.filter((c) => c.simple).map((c) => {
      if (c.key === "normalized_elo") return {
        key: "elo_bar", label: "How human", type: "bar", group: "", simple: true,
        title: "How human the model sounds, judged across 25 conversations. Bars this close "
             + "together mean the test can't really separate them.",
      };
      // One machine's number can't be read on its own — 8 words/sec sounds slow until you
      // know it was measured on a DGX Spark and the same model does 47 on an RTX 5090.
      if (c.key === "tps_2k") return {
        key: "speed_all", label: "Speed", type: "multi", group: "", simple: true,
        title: "How fast the model writes, in words per second, on each machine we measured "
             + "it on. Most people read about 4 words a second, so anything above that "
             + "arrives faster than you can read it. Machines a model doesn't fit on are "
             + "left out — switch to the technical view to see those.",
      };
      return c;
    });
    // Order explicitly rather than inheriting COLS order, which puts "Runs on" ahead of the
    // rating. The answer belongs next to the name; hardware and speed are the follow-up.
    const order = ["rank", "model", "elo_bar", "vram", "speed_all"];
    cols = order.map((k) => cols.find((c) => c.key === k)).filter(Boolean);
  }
  // Rows the top-tier confidence intervals cannot separate. In simple view these are shaded
  // instead of explained in a paragraph — same honesty, no prose.
  const tied = new Set(simple ? topTier(models).map((m) => m.slug) : []);

  const ranges = {};
  for (const c of cols) if (c.heat) {
    ranges[c.key] = c.key === "criterion"
      ? columnRangeBy(models, (m) => (m.criteria ? m.criteria[rankKey] : null))
      : columnRange(models, c.key);
  }

  const modelPage = (window.OG && window.OG.modelPage) || "model.html";
  const thead = el("thead");
  // provenance group row: which columns the judge scored vs measured locally. Suppressed in
  // simple view — with five columns the "How it scored"/"Speed" grouping spans nothing useful.
  if (!simple) {
    const gtr = el("tr", { class: "grp" });
    for (let i = 0; i < cols.length; ) {
      let j = i;
      while (j < cols.length && cols[j].group === cols[i].group) j++;
      const g = cols[i].group;
      const th = el("th", { title: GROUP_TITLES[g] || "", class: (i > 0 ? "gstart" : "") + (g === "judge verdicts" ? " judged" : "") },
        g === "configuration" ? "" : g);
      th.colSpan = j - i;
      gtr.appendChild(th);
      i = j;
    }
    thead.appendChild(gtr);
  }
  const htr = el("tr");
  for (const c of cols) {
    const th = el("th", { class: (c.css === "txt" ? "txt" : "") + (c.gstart ? " gstart" : ""), "data-key": c.key, title: c.title },
      c.label, el("span", { class: "arrow", text: "" }));
    htr.appendChild(th);
  }
  thead.appendChild(htr);

  const tbody = el("tbody");
  function cell(c, row) {
    if (c.key === "rank") return el("td", { class: "rank" }, "");           // filled after sort
    if (c.key === "model") {
      const td = el("td", { class: "model" },
        el("a", { href: `${modelPage}?slug=${encodeURIComponent(row.slug)}`, text: row.display_name }),
        el("span", { class: "slug", text: row.slug }),
        el("span", { class: "cfg", text: cfgLabel(row) }));
      // A model is provisional when its judging is incomplete — it still appears (hiding it
      // would be its own kind of dishonesty) but must never read as a finished measurement.
      if (row.ranked === false) {
        const pct = row.rubric_coverage == null ? null : Math.round(row.rubric_coverage * 100);
        td.appendChild(el("span", {
          class: "chip prov",
          title: pct == null
            ? "Judging incomplete — not ranked."
            : `Judging incomplete: ${pct}% of this model's rubric cells were scored `
              + `(${row.rubric_scored}/${row.rubric_expected}). Scores are computed from a `
              + `partial, non-random subset and are not comparable to fully-judged models.`,
          text: pct == null ? "provisional" : `provisional · ${pct}%`,
        }));
      }
      return td;
    }
    if (c.key === "size") return el("td", { class: "dim" }, fmt.size(row));
    if (c.key === "vram") return el("td", { class: "dim" }, vramLabel(row));
    if (c.key === "precision") {
      const cls = precisionClass(row);
      if (cls == null) return el("td", { class: "dim" }, "—");
      // The dot is decoration for scanning; the word beside it carries the meaning, so the dot
      // is aria-hidden rather than being the only thing distinguishing the two groups.
      return el("td", { class: "dim prec prec-" + cls },
        el("span", { class: "prec-dot", "aria-hidden": "true", text: cls === "full" ? "●" : "○" }),
        cls === "full" ? "full" : precisionName(row));
    }

    if (c.key === "criterion") {
      const v = rankKey ? (row.criteria ? row.criteria[rankKey] : null) : null;
      const td = el("td", {}, v == null ? "—" : fmt.score100(v));
      const r = ranges.criterion;
      if (v != null && r) {
        const raw = r.max === r.min ? 0.62 : (Number(v) - r.min) / (r.max - r.min);
        const rgb = warmth(Math.max(0, Math.min(1, raw)));
        td.className = "heat" + (row.ranked === false ? " prov" : "");
        td.style.background = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.72)`;
        td.style.color = heatText(rgb);
      } else td.className = "heat empty";
      return td;
    }

    // Speed columns: source from row.perf_by_hardware[activeHardware] (falling back to the
    // dgx-spark headline fields), never from a fixed dgx-spark-only read — see speedDisplay().
    // The hardware-select refresh finds these cells again via the captured `speedRefs`/
    // `currentSpeedRefresh` closure below (paint()), not by DOM query — no data-key needed here.
    if (c.key === "ttft_2k_ms" || c.key === "tps_2k") {
      const td = el("td", {});
      applySpeedCell(td, row, c.key);
      return td;
    }

    // Every measured machine in one cell, fastest first. Values at or above reading speed
    // (~4 w/s) are marked so the number reads as "quick enough" without a legend lookup.
    if (c.key === "speed_all") {
      const all = speedAllDisplay(row);
      if (!all.length) return el("td", { class: "speeds" }, "—");
      const td = el("td", { class: "speeds" });
      all.forEach((s, i) => {
        if (i) td.appendChild(el("span", { class: "sp-sep", text: "·" }));
        td.appendChild(el("span", { class: "sp" + (s.tps >= READING_WPS ? " sp-quick" : "") },
          el("span", { class: "sp-hw", text: s.label }),
          el("span", { class: "sp-v", text: Math.round(s.tps) })));
      });
      return td;
    }

    // Simple view's headline: a bar, not a four-digit rating. Length is scaled across the
    // board's own Elo range; the number rides along as screen-reader text so the value is
    // never colour/length-only.
    if (c.key === "elo_bar") {
      const v = row.normalized_elo;
      // No bar at all when there is no rating. The minimum-width floor below would otherwise
      // draw "not measured" as a short bar — i.e. as "measured, worst on the board".
      if (v == null) return el("td", { class: "barcell empty", text: "not measured" });
      const pct = eloRange.max === eloRange.min
        ? 100 : ((v - eloRange.min) / (eloRange.max - eloRange.min)) * 100;
      return el("td", { class: "barcell" },
        el("div", { class: "hbar", title: v.toFixed(0) },
          el("span", { style: `width:${Math.max(3, pct)}%` })),
        el("span", { class: "sr-only", text: v.toFixed(0) }));
    }

    const v = row[c.key];
    let disp;
    if (c.key === "normalized_elo") disp = fmt.eloCI(row);
    else if (c.key === "win_rate") disp = fmt.pct(v);
    else if (c.key === "eq_score" || c.key === "humanlike_score") disp = fmt.score100(v);
    else if (c.key === "avg_reply_words") disp = fmt.int(v);
    else disp = fmt.n1(v);

    const td = el("td", {}, disp);
    if (c.heat) {
      const r = ranges[c.key];
      if (v == null || !r) { td.className = "heat empty"; }
      else {
        td.className = "heat" + (row.ranked === false ? " prov" : "");
        // Clamp: a provisional value can fall outside the ranked-only range.
        const raw = r.max === r.min ? 0.62 : (Number(v) - r.min) / (r.max - r.min);
        const t = Math.max(0, Math.min(1, raw));
        const rgb = warmth(t);
        td.style.background = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.72)`;
        td.style.color = heatText(rgb);
      }
    }
    return td;
  }

  function paint(rows) {
    tbody.replaceChildren();
    let rank = 0;
    // Refs to just this paint's speed cells, in ROW order — a hardware switch re-sources these
    // in place and never rebuilds/reorders the table, so it structurally cannot re-sort.
    const speedRefs = [];
    // Provisional rows always sink, so the bar column runs down and then jumps back up (a
    // 1665 below a 1190). In the numeric table that read as appended context; as a bar chart
    // it reads as broken. Label the boundary once, in simple view where the bar is the
    // headline — the technical view still carries the per-row "provisional" styling.
    let sepDone = false;
    rows.forEach((row) => {
      if (simple && !sepDone && row.ranked === false && tbody.children.length) {
        sepDone = true;
        const sep = el("td", { class: "sep-cell",
          text: "Still being judged — scored, but not ranked until every conversation is in" });
        sep.colSpan = cols.length;
        tbody.appendChild(el("tr", { class: "sep" }, sep));
      }
      const tr = el("tr", { class: (row.ranked === false ? "provisional" : "")
                                   + (tied.has(row.slug) ? " tied" : "") });
      const rowSpeed = {};
      for (const c of cols) {
        const td = cell(c, row);
        if (c.key === "ttft_2k_ms" || c.key === "tps_2k") rowSpeed[c.key] = td;
        if (c.gstart) td.classList.add("gstart");
        tr.appendChild(td);
      }
      // Provisional models do not occupy a rank — numbering them would assert a standing
      // their incomplete judging cannot support.
      tr.firstChild.textContent = row.ranked === false ? "—" : String(++rank);
      tbody.appendChild(tr);
      speedRefs.push({ row, cells: rowSpeed });
    });
    // Registers this render's refresh as the ACTIVE one — the hardware-select listener always
    // calls whichever leaderboard table is currently mounted (Overall or a criterion sort).
    currentSpeedRefresh = () => {
      for (const { row, cells } of speedRefs) {
        if (cells.ttft_2k_ms) applySpeedCell(cells.ttft_2k_ms, row, "ttft_2k_ms");
        if (cells.tps_2k) applySpeedCell(cells.tps_2k, row, "tps_2k");
      }
    };
  }

  // default: strongest on top. In simple view the Elo column is the synthetic `elo_bar`, so
  // the default key must match its data-key or the sort arrow would render on no column.
  let sortKey = rankKey ? "criterion" : (simple ? "elo_bar" : "normalized_elo"), sortDir = -1;
  function applySort() {
    // Filter BEFORE ranking so the "#" column numbers what is actually on screen; ranking first
    // and then hiding rows would leave gaps (1, 2, 3, 11, 15) that read as missing data.
    const visible = activePrecision === "all"
      ? models
      : models.filter((m) => precisionClass(m) === activePrecision);
    const rows = [...visible].sort((a, b) => {
      // Provisional rows always sink, whatever the active sort — they are not participants
      // in the ordering, they are appended context.
      if ((a.ranked === false) !== (b.ranked === false)) return a.ranked === false ? 1 : -1;
      let x = a[sortKey], y = b[sortKey];
      if (sortKey === "criterion") { x = a.criteria ? a.criteria[rankKey] : null; y = b.criteria ? b.criteria[rankKey] : null; }
      // `elo_bar` is a presentation-only column — it holds no value of its own, so sort it
      // by the rating it draws.
      if (sortKey === "elo_bar") { x = a.normalized_elo; y = b.normalized_elo; }
      // The cell leads with the fastest machine, so the sort must agree with what's on screen.
      if (sortKey === "speed_all") {
        const best = (m) => { const s = speedAllDisplay(m); return s.length ? s[0].tps : null; };
        x = best(a); y = best(b);
      }
      if (sortKey === "model") { x = a.display_name; y = b.display_name; }
      if (sortKey === "size") { x = a.params_total_b; y = b.params_total_b; }
      if (sortKey === "vram") { x = vramGB(a); y = vramGB(b); }
      // Sort by real bits-per-weight, not the quant string: alphabetical would scatter
      // NVFP4/Q4_K_M/Q5_K_M and put "full precision" in the middle of the compressed tier.
      if (sortKey === "precision") { x = gbPerB(a); y = gbPerB(b); }
      // Speed columns must sort by exactly the numbers the active hardware selection shows —
      // never by the stale dgx-spark headline field once another machine is selected.
      if (sortKey === "ttft_2k_ms" || sortKey === "tps_2k") { x = speedSortValue(a, sortKey); y = speedSortValue(b, sortKey); }
      const xn = x == null, yn = y == null;
      if (xn && yn) return 0;
      if (xn) return 1;                    // nulls sink to the bottom
      if (yn) return -1;
      if (typeof x === "string") return sortDir * x.localeCompare(y);
      return sortDir * (x - y);
    });
    paint(rows);
    htr.querySelectorAll("th").forEach((th) => {
      const key = th.getAttribute("data-key");
      const arrow = th.querySelector(".arrow");
      if (key === sortKey) { th.setAttribute("aria-sort", sortDir < 0 ? "descending" : "ascending"); arrow.textContent = sortDir < 0 ? "▼" : "▲"; }
      else { th.removeAttribute("aria-sort"); arrow.textContent = ""; }
    });
  }
  htr.querySelectorAll("th").forEach((th) => {
    const key = th.getAttribute("data-key");
    if (key === "rank") return;
    th.addEventListener("click", () => {
      if (sortKey === key) sortDir *= -1;
      else { sortKey = key; sortDir = (key === "model" || key === "ttft_2k_ms" || key === "size" || key === "vram") ? 1 : -1; }
      applySort();
    });
  });

  const table = el("table", { class: "lb" }, thead, tbody);
  currentRowsRefresh = applySort;      // the precision filter re-runs the whole sort/paint
  applySort();
  return el("div", { class: "table-scroll row-in" }, table);
}

/* ---- "which should I pick?" — honest guidance, no fabricated superlatives ----
   The reviewers' #1 ask was a plain recommendation. But the top models are a statistical tie
   and most have no speed data, so naming a single "fastest"/"easiest" winner would be a
   fabricated superlative (a review caught the synthesis crowning the SLOWEST model as fastest,
   off one measured straggler). So we state the tie honestly and hand the reader the ONE
   dimension we can compute reliably for the whole tier — memory footprint — plus how to read
   the table. `topTier` = every ranked model whose score range overlaps the leader's. */
function topTier(models) {
  const ranked = (models || []).filter((m) => m.ranked !== false && m.normalized_elo != null);
  if (!ranked.length) return [];
  const leader = ranked.reduce((a, b) => (b.normalized_elo > a.normalized_elo ? b : a));
  const floor = leader.elo_ci_low != null ? leader.elo_ci_low : leader.normalized_elo;
  return ranked.filter((m) => (m.elo_ci_high != null ? m.elo_ci_high : m.normalized_elo) >= floor)
               .sort((a, b) => b.normalized_elo - a.normalized_elo);
}
/* Name the machine the speed came from. "writes about 8 words a second" was the DGX Spark
   figure stated as if it were the model's one true speed — the same model does 47 on a 5090,
   which is the whole point of the board's per-machine speed column. */
function fastestWhy(m) {
  const all = speedAllDisplay(m);
  if (!all.length) return "Quickest of the top group.";
  const best = all[0];
  const rest = all.length > 1 ? `, ${Math.round(all[all.length - 1].tps)} on a ${all[all.length - 1].label}` : "";
  // "an 5090" / "a RTX" both read wrong; pick the article from the label
  const art = /^[80aeiou]/i.test(best.label) ? "an" : "a";
  return `About ${Math.round(best.tps)} words a second on ${art} ${best.label}${rest} — quickest of the top group.`;
}

function renderPickCard(models) {
  const mount = document.getElementById("pick-card");
  if (!mount) return;
  const tier = topTier(models);
  if (tier.length < 2) { mount.remove(); return; }
  const withVram = tier.filter((m) => vramGB(m) != null);
  const lightest = withVram.length ? withVram.reduce((a, b) => (vramGB(b) < vramGB(a) ? b : a)) : null;
  // Name a "fastest" pick ONLY when EVERY tier member has been speed-tested — otherwise one
  // measured straggler could win the superlative by default (a review caught exactly that).
  const withSpeed = tier.filter((m) => m.tps_2k != null);
  const fastest = withSpeed.length === tier.length
    ? withSpeed.reduce((a, b) => (b.tps_2k > a.tps_2k ? b : a)) : null;
  const modelPage = (window.OG && window.OG.modelPage) || "model.html";
  const link = (m) => el("a", { href: `${modelPage}?slug=${encodeURIComponent(m.slug)}`, text: m.display_name });

  // One card per way of choosing, each evidenced by a line the model actually wrote
  // (`row.quote`, exported by site_gen._pick_quote) rather than by numbers alone.
  const card = (kicker, m, why) => {
    if (!m) return null;
    return el("div", { class: "pick-card" },
      el("div", { class: "pk-kicker", text: kicker }),
      el("h3", {}, link(m)),
      el("p", { class: "pk-why", text: why }),
      m.quote ? el("blockquote", { class: "pk-quote", text: m.quote }) : null,
      el("dl", { class: "pk-stats" },
        el("div", {}, el("dt", { text: "Runs on" }), el("dd", { text: vramLabel(m) })),
        el("div", {}, el("dt", { text: "Speed" }),
          // best measured machine, matching the card's own sentence — reading tps_2k here
          // showed the Spark figure beside a line that quoted the 5090 one
          el("dd", { text: (() => {
            const best = speedAllDisplay(m)[0];
            return best ? `${Math.round(best.tps)} words/sec on a ${best.label}` : "—";
          })() }))));
  };

  // The same model routinely wins several categories (the top model is often also the
  // lightest AND the fastest of the tie group), which rendered three identical cards and
  // read as a bug. Collapse those into one card carrying every label it earned.
  const specs = [
    ["Best score", tier[0], "Top of the board — but barely ahead, so don't overthink it."],
    ["Best for a normal gaming PC", lightest,
     lightest ? `Needs the least memory (${vramLabel(lightest)}) of the top group.` : ""],
    ["Fastest", fastest, fastest ? fastestWhy(fastest) : ""],
  ].filter(([, m]) => m);
  const merged = [];
  for (const [kicker, m, why] of specs) {
    const seen = merged.find((x) => x.m.slug === m.slug);
    if (seen) { seen.kickers.push(kicker); if (why && why.length > seen.why.length) seen.why = why; }
    else merged.push({ kickers: [kicker], m, why });
  }
  mount.replaceChildren(el("section", { class: "picks" },
    el("h2", { class: "pick-h", text: "So which one should I run?" }),
    el("p", { class: "pick-lead", text: merged.length === 1
      ? `The top ${tier.length} score close enough that the test can't tell them apart, and one `
        + `of them happens to be the lightest and the quickest of the group too.`
      : `The top ${tier.length} score close enough that the test can't tell them apart — any of `
        + `them is a safe pick. Choose on what fits your computer.` }),
    el("div", { class: "pick-grid" },
      ...merged.map((x) => card(x.kickers.join(" · "), x.m, x.why))),
    el("p", { class: "pick-note", text:
      fastest ? "All of these are open-weight and free to run yourself."
              : "Speed isn't measured for every top model yet. All of these are open-weight "
                + "and free to run yourself." })));
}
/* "Rank by" pills: Overall (default) plus each criterion, grouped by family. Clicking a pill
   re-renders the board in that mode and hides the Overall-only chrome (tie banner + pick card),
   which describe the head-to-head Elo tie and would mislead under a per-criterion sort. */
function renderRankBy(models) {
  const mount = document.getElementById("rank-by");
  if (!mount) return;
  const lb = document.getElementById("leaderboard");
  const tie = document.getElementById("tie-banner");
  const pick = document.getElementById("pick-card");

  let active = null;                                   // null = Overall
  const pills = [];
  const setMode = (rankKey, pill) => {
    active = rankKey;
    pills.forEach((p) => p.classList.toggle("on", p === pill));
    lb.replaceChildren(renderLeaderboard(models, rankKey));
    const crit = rankKey ? CRITERIA.find((c) => c.key === rankKey) : null;
    // Overall-only chrome off in criterion mode; a plain note on instead.
    if (tie) tie.style.display = crit ? "none" : "";
    if (pick) pick.style.display = crit ? "none" : "";
    note.textContent = crit
      ? `Ranked by ${crit.label} — the judge's 0–100 rating on this one quality. Small gaps aren't meaningful.`
      : "";
    note.style.display = crit ? "" : "none";
  };

  const bar = el("div", { class: "rankby" }, el("span", { class: "rankby-lbl", text: "Rank by:" }));
  const overall = el("button", { class: "pill on", type: "button" }, "Overall");
  overall.addEventListener("click", () => setMode(null, overall));
  pills.push(overall);
  bar.appendChild(overall);

  // group the criterion pills by family, in CRITERIA order, each family with a muted label
  const seen = [];
  for (const c of CRITERIA) if (!seen.includes(c.family)) seen.push(c.family);
  for (const fam of seen) {
    const grp = el("span", { class: "rankby-grp" }, el("span", { class: "rankby-fam", text: fam }));
    for (const c of CRITERIA.filter((x) => x.family === fam)) {
      const p = el("button", { class: "pill", type: "button", title: c.tip }, c.label);
      p.addEventListener("click", () => setMode(c.key, p));
      pills.push(p);
      grp.appendChild(p);
    }
    bar.appendChild(grp);
  }
  const note = el("p", { class: "rankby-note" });
  note.style.display = "none";
  mount.replaceChildren(bar, note);
}
function renderTieBanner(models) {
  const mount = document.getElementById("tie-banner");
  if (!mount) return;
  const tier = topTier(models);
  if (tier.length < 2) { mount.remove(); return; }
  // Honest wording: state that the top group can't be separated, WITHOUT drawing a hard line
  // that implies the next model down is definitively worse (its range often overlaps too — the
  // whole ladder is a gradient). The CI whiskers on the verdict rail carry the visual nuance.
  // Kept short: the shaded rows now carry the message visually, so this only has to name
  // what the shading means. The full "read the board as a gradient" nuance lives in the
  // CI whiskers on the verdict rail and on the methodology page.
  mount.replaceChildren(el("p", { class: "tie-note" },
    el("strong", { text: `The shaded rows are a tie, not a ranking. ` }),
    `The top ${tier.length} are close enough that we can't say any one is really better — pick `
    + `whichever fits your computer. Models just below them are often close too.`));
}

/* ---- judging story: a human sentence, not a hash badge ------------------ */
function renderJudgingStrip(judgeModel, summary) {
  const strip = document.querySelector("[data-judging-strip]");
  if (!strip) return;
  // Show a clean model name (drop the "openai/" provider prefix) and say what "same prompt for
  // everyone" means in plain words instead of "frozen prompt".
  const cleanName = (judgeModel || "—").replace(/^[a-z0-9_-]+\//i, "");
  strip.replaceChildren(
    document.createTextNode("Graded by "),
    el("span", { "data-judge-model": "", text: cleanName }),
    document.createTextNode(", using the exact same instructions for every model"));
  if (summary && summary.n_judges) {
    const pct = Math.round(Number(summary.max_agreement) * 100);
    strip.append(
      document.createTextNode(" · double-checked by a "),
      el("a", { href: "methodology.html#judge-cross-check", text: `panel of ${summary.n_judges} AIs` }),
      document.createTextNode(` that agreed up to ${pct}% of the time.`));
  } else {
    strip.append(document.createTextNode("."));
  }
}

/* ---- Warmth Verdict Strip: the signature element ------------------------ */
/* A vertical thermal rail plotting each model on the normalized-Elo axis. Each model gets a
   horizontal tick + glowing dot at its Elo, a CI whisker spanning ci_low..ci_high along the
   rail, and a label linking to its page. Glow intensity scales with win_rate. Pure DOM+CSS. */
function renderVerdictStrip(models) {
  const mount = document.getElementById("verdict-strip");
  if (!mount) return;
  const modelPage = (window.OG && window.OG.modelPage) || "model.html";
  // The ladder plots the ranking. A provisional model has no standing in it — including it
  // would draw an incomplete measurement as a peer of the fully-judged ones.
  const pts = (models || []).filter((m) => m.normalized_elo != null && m.ranked !== false);
  if (!pts.length) { mount.replaceChildren(el("div", { class: "state", text: "No ranked models yet." })); return; }

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const nz = (v, f) => (v != null ? Number(v) : Number(f));

  // axis domain: min(ci_low) − 40 … max(ci_high) + 40, falling back to the point Elo w/o a CI
  let dmin = Infinity, dmax = -Infinity;
  for (const m of pts) {
    dmin = Math.min(dmin, nz(m.elo_ci_low, m.normalized_elo));
    dmax = Math.max(dmax, nz(m.elo_ci_high, m.normalized_elo));
  }
  dmin -= 40; dmax += 40;
  const span = dmax - dmin || 1;
  const pos = (v) => clamp01((Number(v) - dmin) / span) * 100;

  const items = pts.map((m) => ({
    m,
    yElo: pos(m.normalized_elo),
    yLo: pos(nz(m.elo_ci_low, m.normalized_elo)),
    yHi: pos(nz(m.elo_ci_high, m.normalized_elo)),
  }));

  // declutter single-line labels in %-space: nudge apart to a minimum gap, then shift down if
  // they overflow. A leader line ties each nudged label back to its exact-position dot.
  // The gap is ADAPTIVE: with many models a fixed 6.5% needs more than the rail has, so the
  // overflow shift used to push the bottom labels into the axis caption (they collided and
  // garbled — "pantheon" over "designant"). Sizing the gap to fit all n labels in the usable
  // band [BOT, TOP] guarantees no overflow, so nothing gets shoved off either end.
  const TOP = 94, BOT = 4;                       // leave room for the axis captions above/below
  const MIN_GAP = 6.5;
  const sorted = [...items].sort((a, b) => a.yElo - b.yElo);
  let last = -Infinity;
  for (const it of sorted) { it.yLabel = Math.max(it.yElo, last + MIN_GAP); last = it.yLabel; }
  // If the labels can't all sit near their dots without overflowing the rail — which happens
  // when a tight cluster (e.g. 6 models within a few Elo) needs more vertical room than exists,
  // or simply with many models — a shift-and-clamp used to stack the bottom labels on top of
  // each other (they garbled). Fall back to spreading ALL labels EVENLY; the leader line still
  // ties each to its true position. This is collision-free for any number of models.
  if (last > TOP) {
    const gap = (TOP - BOT) / Math.max(1, sorted.length - 1);
    sorted.forEach((it, i) => { it.yLabel = BOT + i * gap; });
  }

  const plot = el("div", { class: "vs-plot" }, el("div", { class: "vs-rail" }));
  let ai = 0;                       // stagger index for the one orchestrated load moment
  const anim = (node) => { node.classList.add("vs-in"); node.style.setProperty("--i", String(ai)); return node; };
  for (const it of items) {
    ai++;
    const m = it.m, wr = m.win_rate;
    plot.appendChild(anim(el("div", { class: "vs-whisker", style: `bottom:${it.yLo}%;height:${Math.max(0, it.yHi - it.yLo)}%` })));
    // leader line bridging the dot's true position to the nudged label
    const loY = Math.min(it.yElo, it.yLabel), gap = Math.abs(it.yLabel - it.yElo);
    if (gap > 0.4) plot.appendChild(anim(el("div", { class: "vs-leader", style: `bottom:${loY}%;height:${gap}%` })));
    const dot = el("div", { class: "vs-dot" + (wr == null ? " cold" : ""), style: `bottom:${it.yElo}%` });
    if (wr != null) {
      const blur = 6 + Number(wr) * 20, alpha = 0.35 + Number(wr) * 0.5;
      dot.style.boxShadow = `0 0 ${blur.toFixed(1)}px rgba(245,163,75,${alpha.toFixed(2)})`;
    }
    plot.appendChild(anim(dot));
    plot.appendChild(anim(el("a", {
      class: "vs-label", href: `${modelPage}?slug=${encodeURIComponent(m.slug)}`, style: `bottom:${it.yLabel}%`,
    },
      el("span", { class: "nm", text: m.display_name }),
      el("span", { class: "el", text: String(Math.round(Number(m.normalized_elo))) }))));
  }

  mount.replaceChildren(
    el("div", { class: "vs-title" }, el("span", { class: "tick", text: "// " }), "How human each model sounds"),
    el("div", { class: "vs-axis top" }, el("span", { text: "more human" }), el("span", { class: "val", text: "≈ " + Math.round(dmax) })),
    plot,
    el("div", { class: "vs-axis bottom" }, el("span", { text: "less human" }), el("span", { class: "val", text: "≈ " + Math.round(dmin) })));
}

/* Simple ⇄ technical. The page always opens simple, and the state is deliberately NOT
   persisted: a shared link must never land a newcomer in the analyst view. The technical
   view restores today's full table plus its rank-by pills and heat legend — nothing about
   the board was deleted, only demoted. */
function renderBoardToggle(models) {
  const mount = document.getElementById("board-toggle");
  const lb = document.getElementById("leaderboard");
  if (!mount || !lb) return;
  let simple = true;
  const btn = el("button", { class: "btn-tech", type: "button" });
  const chrome = () => [document.getElementById("rank-by"), document.querySelector(".legend")];
  const apply = () => {
    btn.textContent = simple ? "Show the technical view" : "Back to the simple view";
    btn.setAttribute("aria-pressed", String(!simple));
    chrome().forEach((n) => { if (n) n.style.display = simple ? "none" : ""; });
    lb.replaceChildren(renderLeaderboard(models, null, simple));
  };
  btn.addEventListener("click", () => { simple = !simple; apply(); });
  mount.replaceChildren(btn);
  apply();
}

/* ======================= BANDS 1+2: side-by-side + reveal =================
   One scripted conversation, two models. The scripted user turns are identical across
   every model (the export REFUSES to emit a fork where they differ), so they render ONCE
   down a centre spine with each model's replies fanning left and right.

   Two invariants make this an honest test rather than a reveal with extra steps:
     - the payload carries no winner (see site_gen._showcase), and
     - the sides are shuffled on every render,
   so neither the JSON nor the DOM can tell the visitor the answer before they choose. */
function renderShowcase(showcase) {
  const mount = document.getElementById("showcase");
  if (!mount) return;
  const forks = (showcase && showcase.forks) || [];
  if (!forks.length) { mount.remove(); return; }      // degrade: the board still renders
  const judge = (showcase.judge_model || "the judge").replace(/^[a-z0-9_-]+\//i, "");
  const modelPage = (window.OG && window.OG.modelPage) || "model.html";
  let idx = 0;

  const draw = () => {
    const fork = forks[idx];
    const flip = Math.random() < 0.5;                  // shuffle per render
    const sides = flip ? [fork.sides[1], fork.sides[0]] : [fork.sides[0], fork.sides[1]];
    const crit = CRITERIA.find((c) => c.key === fork.criterion);
    const critLabel = crit ? crit.label : fork.criterion;
    const shown = Math.max(1, Math.min(fork.show_turns, fork.user_turns.length));

    const row = (i) => el("div", { class: "spine-row" },
      el("div", { class: "lane lane-a" }, el("div", { class: "say", text: sides[0].replies[i] || "" })),
      el("div", { class: "said" }, el("div", { class: "bubble", text: fork.user_turns[i] })),
      el("div", { class: "lane lane-b" }, el("div", { class: "say", text: sides[1].replies[i] || "" })));

    const spine = el("div", { class: "spine" });
    for (let i = 0; i < shown; i++) spine.appendChild(row(i));
    if (fork.user_turns.length > shown) {
      const rest = el("div", { class: "spine" });
      for (let i = shown; i < fork.user_turns.length; i++) rest.appendChild(row(i));
      spine.appendChild(el("details", { class: "spine-more" },
        el("summary", { text: "read the rest of the conversation" }), rest));
    }

    const reveal = el("div", { class: "reveal", "aria-live": "polite" });
    const choose = (picked) => {
      const strong = sides[0].score_0_20 >= sides[1].score_0_20 ? 0 : 1;
      const card = (s, i) => el("div", { class: "rv-side" + (i === picked ? " picked" : "") },
        el("h4", {}, el("a", { href: `${modelPage}?slug=${encodeURIComponent(s.slug)}`, text: s.display_name })),
        // Several display names already carry the quant in parentheses — don't say it twice.
        el("p", { class: "rv-meta", text: [
          s.params_total_b ? `${s.params_total_b}B` : null,
          (s.quant && !(s.display_name || "").includes(s.quant)) ? s.quant : null,
        ].filter(Boolean).join(" · ") || " " }),
        el("div", { class: "rv-bar" }, el("span", { style: `width:${(s.score_0_20 / 20) * 100}%` })),
        el("p", { class: "rv-score", text: `${Number(s.score_0_20).toFixed(0)} out of 20 for ${critLabel.toLowerCase()}` }),
        el("blockquote", { class: "rv-just", text: s.justification }));

      // The tie fork's headline is about the FULL board, not these two replies: the scores
      // shown belong to the single displayed conversation, and claiming they tied would
      // overstate what's on screen.
      const verdict = fork.note === "tie"
        ? `Close one. Across all 25 conversations these two are a statistical tie — and one of them is a fraction of the size of the other.`
        : picked === strong
          ? `That's the one ${judge} scored higher too.`
          : `${judge} scored the other one higher. Here's what it saw — read them again and judge for yourself.`;

      const kids = [
        el("p", { class: "rv-verdict", text: verdict }),
        el("div", { class: "rv-grid" }, card(sides[0], 0), card(sides[1], 1)),
        el("p", { class: "rv-attrib", text: `Both scores and both comments above are ${judge}'s, on “${critLabel}”.` }),
      ];
      if (fork.note === "wide") {
        kids.push(el("p", { class: "rv-caveat", text:
          "This is one of the widest gaps we measured. Most models are far closer than "
          + "this — which is why the ranking below rests on hundreds of comparisons, not one." }));
      }
      kids.push(el("p", { class: "rv-handoff", text:
        "We put 24 free models through 25 conversations like this one." }));
      reveal.replaceChildren(...kids);
      buttons.remove();
    };

    const buttons = el("div", { class: "sc-choose" },
      el("button", { class: "btn-choose", type: "button", onclick: () => choose(0) }, "the left one"),
      el("span", { class: "sc-or", text: "or" }),
      el("button", { class: "btn-choose", type: "button", onclick: () => choose(1) }, "the right one"));

    mount.replaceChildren(el("section", { class: "showcase" },
      el("div", { class: "sc-head" },
        el("h2", { class: "sc-title", text: fork.title }),
        el("p", { class: "sc-framing", text: fork.framing })),
      spine, buttons, reveal,
      forks.length > 1
        ? el("div", { class: "sc-foot" }, el("button", {
            class: "btn-another", type: "button",
            onclick: () => { idx = (idx + 1) % forks.length; draw(); },
          }, "try another conversation"))
        : null));
  };

  draw();
}

async function initLeaderboard() {
  const mount = $("#leaderboard");
  try {
    const data = await getJSON("data/leaderboard.json");
    // Declared machines, ordered by vram desc (Task 5's export order) — shared by the
    // leaderboard selector AND the model-detail page (which re-fetches this same file for it).
    window.OG_HARDWARE = data.hardware || [];
    const jg = data.judge_generation || {};
    const gen = document.querySelector("[data-generated-at]");
    if (gen && data.generated_at) gen.textContent = new Date(data.generated_at).toISOString().replace("T", " ").slice(0, 16) + " UTC";
    renderJudgingStrip(jg.model, data.judge_calibration_summary);
    // Caught independently of the board's own try: a missing or malformed showcase must
    // degrade to a board-only page, never take the leaderboard down with it.
    const showcase = await getJSON("data/showcase.json").catch(() => null);
    renderShowcase(showcase);
    if (!data.models || !data.models.length) { renderVerdictStrip([]); fail(mount, "No models have completed a run yet."); return; }
    renderVerdictStrip(data.models);
    renderPickCard(data.models);
    renderTieBanner(data.models);
    renderRankBy(data.models);
    renderHardwareSelect();
    renderPrecisionSelect();
    renderBoardToggle(data.models);
  } catch (e) { fail(mount, "Could not load leaderboard.json — " + e.message); }
}

/* ============================ MODEL DETAIL =============================== */
function critCard(criteria) {
  const card = el("div", { class: "card" }, el("h3", { text: "How it scored on each quality" }),
    el("p", { class: "sub", text: "Judge's mean score out of 20, over 25 conversations. Higher is better on all nine. The whisker shows how much the score moved between repeat runs of the same conversation." }));
  for (const c of criteria) {
    const mean = c.mean, std = Math.sqrt(Math.max(0, c.variance || 0));
    const pct = (v) => Math.max(0, Math.min(100, (v / 20) * 100));
    const lo = pct(mean - std), hi = pct(mean + std);
    // Two axes are inverted; without saying so, "Not robotic 14.3/20" is unreadable.
    const inv = INVERTED_CRITERIA[c.criterion];
    card.appendChild(el("div", { class: "crit", title: critTip(c.criterion) },
      el("div", { class: "cl" },
        el("span", { class: "name" }, critLabel(c.criterion),
          inv ? el("span", { class: "inv-note", text: inv }) : null),
        el("span", { class: "val", text: fmt.n1(mean) + " / 20" })),
      el("div", { class: "bar" },
        el("div", { class: "fill", style: `width:${pct(mean)}%` }),
        el("div", { class: "whisk", style: `left:${lo}%;width:${Math.max(0, hi - lo)}%` }))));
  }
  return card;
}

function categoryCard(cats) {
  const card = el("div", { class: "card" }, el("h3", { text: "How it scored by situation" }),
    el("p", { class: "sub", text: "The same score out of 20, grouped by the kind of conversation it was handling." }));
  if (!cats || !cats.length) { card.appendChild(el("p", { class: "note", text: "No category data." })); return card; }
  const max = 20;
  for (const c of cats) {
    card.appendChild(el("div", { class: "catrow" },
      el("span", { class: "cat", text: categoryLabel(c.category) }),
      el("div", { class: "bar" }, el("div", { class: "fill", style: `width:${(c.mean_score_0_20 / max) * 100}%` })),
      el("span", { class: "num", text: fmt.n1(c.mean_score_0_20) })));
  }
  return card;
}

function reproBlock(repro, avgReplyWords) {
  const kv = el("dl", { class: "kv" });
  const add = (k, v) => { kv.appendChild(el("dt", { text: k })); kv.appendChild(el("dd", { text: v == null || v === "" ? "—" : String(v) })); };
  add("harness_git_commit", repro.harness_git_commit);
  // when the run row lacked judge fields, the export backfills them from the resolved rubric
  // generation — flag that so "verify" never implies the harness itself recorded them.
  const jsuffix = repro.judge_provenance_resolved ? " (resolved from stored verdicts)" : "";
  add("judge_model", repro.judge_model == null ? null : String(repro.judge_model) + jsuffix);
  add("judge_prompt_hash", repro.judge_prompt_hash == null ? null : String(repro.judge_prompt_hash) + jsuffix);
  add("avg_reply_words", avgReplyWords == null ? null : fmt.int(avgReplyWords));
  const hw = repro.hardware_fingerprint || {};
  for (const k in hw) add("hw." + k, hw[k]);
  const body = el("div", { class: "body" }, kv);
  if (repro.config_snapshot && Object.keys(repro.config_snapshot).length) {
    body.appendChild(el("pre", { class: "snap", text: JSON.stringify(repro.config_snapshot, null, 2) }));
  }
  return el("details", { class: "fold" },
    el("summary", {}, el("span", { class: "caret", text: "▸" }), "Reproducibility & provenance",
      el("span", { class: "tag", text: "verify" })),
    body);
}

function transcriptFold(t, i) {
  const turns = el("div", { class: "turns" });
  for (const turn of (t.turns || [])) {
    turns.appendChild(el("div", { class: "turn " + (turn.role === "assistant" ? "assistant" : "user") },
      el("span", { class: "who", text: turn.role || "?" }),
      el("div", { class: "say", text: turn.content || "" })));
  }
  const wrap = el("div", { class: "body" }, turns);
  const scores = t.rubric_scores || [];
  if (scores.length) {
    const jn = el("div", { class: "judge-notes" });
    jn.appendChild(el("div", { class: "eyebrow", text: "Judge commentary" }));
    for (const s of scores) {
      jn.appendChild(el("div", { class: "jn" },
        el("div", { class: "head" },
          el("span", { class: "c", text: critLabel(s.criterion) }),
          el("span", { class: "s", text: (s.score_0_20 != null ? s.score_0_20 : "—") + " / 20" })),
        s.justification ? el("div", { class: "just", text: s.justification }) : null));
    }
    wrap.appendChild(jn);
  }
  return el("details", { class: "fold" },
    el("summary", {}, el("span", { class: "caret", text: "▸" }),
      t.title ? `“${t.title}”` : t.scenario_id,
      t.category ? el("span", { class: "tag", text: categoryLabel(t.category) }) : null,
      el("span", { class: "tag", text: `${(t.turns || []).length} turns` })),
    wrap);
}

/* dark-theme Chart.js line chart, single series, its own overflow box */
function perfChart(canvas, curve, field, color, unit) {
  if (typeof Chart === "undefined") { canvas.replaceWith(el("div", { class: "state", text: "chart unavailable" })); return; }
  const pts = curve.filter((r) => r[field] != null);
  if (!pts.length) { canvas.replaceWith(el("div", { class: "state", text: "no perf samples" })); return; }
  const grid = "rgba(255,255,255,0.07)", muted = "#8A93A6";
  new Chart(canvas, {
    type: "line",
    data: {
      labels: pts.map((r) => r.prompt_tokens),
      datasets: [{
        data: pts.map((r) => r[field]),
        borderColor: color, backgroundColor: color,
        borderWidth: 2, pointRadius: 3.5, pointHoverRadius: 5, tension: 0.25,
        pointBackgroundColor: color,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#171C28", borderColor: "rgba(255,255,255,0.13)", borderWidth: 1,
          titleColor: "#E8EAF0", bodyColor: "#AEB6C6", padding: 10,
          callbacks: { title: (it) => `${it[0].label} words of conversation so far`, label: (it) => ` ${Number(it.raw).toFixed(1)} ${unit}` },
        },
      },
      scales: {
        x: { title: { display: true, text: "words of conversation so far", color: muted, font: { size: 10 } },
             grid: { color: grid }, ticks: { color: muted, font: { family: "monospace", size: 11 } } },
        y: { grid: { color: grid }, ticks: { color: muted, font: { family: "monospace", size: 11 } }, beginAtZero: true },
      },
    },
  });
}

async function initModel() {
  const mount = $("#model");
  const slug = new URLSearchParams(location.search).get("slug");
  if (!slug) { fail(mount, "No model selected. Return to the leaderboard and pick a model."); return; }
  try {
    // The model-detail export (data/models/<slug>.json) carries this model's own
    // perf_by_hardware, but not the ordered/labeled hardware roster — that only lives on
    // leaderboard.json (see site_gen.py `leaderboard["hardware"]`). Fetch both, same pattern
    // initCompare already uses (leaderboard.json + a per-model doc in one page load) — not a
    // new/parallel data path, the same JSON endpoint site.js already fetches elsewhere.
    const [d, lb] = await Promise.all([
      getJSON(`data/models/${encodeURIComponent(slug)}.json`),
      getJSON("data/leaderboard.json").catch(() => null),
    ]);
    window.OG_HARDWARE = (lb && lb.hardware) || window.OG_HARDWARE || [];
    $("[data-model-name]").textContent = d.display_name || slug;
    $("[data-model-slug]").textContent = slug;
    document.title = `${d.display_name || slug} — OpenGauntlet`;
    mount.replaceChildren();   // clear the "Loading…" placeholder

    const grid = el("div", { class: "grid-2 row-in" }, critCard(d.criteria || []), categoryCard(d.category_breakdown || []));
    mount.appendChild(grid);

    // Three-machine speed table: one row per declared machine, honest about fit. Placed above
    // the charts (which only ever plot dgx-spark's curve) so "can I actually run this, and how
    // fast" is answered before the detailed throughput/latency graphs.
    const pbh = d.perf_by_hardware || {};
    const hwList = window.OG_HARDWARE || [];
    const hwNameById = new Map(hwList.map((h) => [h.hardware_id, h.display_name || h.hardware_id]));
    const hwOrder = hwList.length ? hwList.map((h) => h.hardware_id) : Object.keys(pbh);
    const perfMachines = el("div", { class: "perf-machines" });
    hwOrder.forEach((hwId) => {
      const cell = pbh[hwId];
      if (!cell) return;
      const label = { measured: null, doesnt_fit: "doesn't fit", not_measured: "not measured" }[cell.state];
      const speed = cell.state === "measured" && cell.tps_2k != null
        ? `${Math.round(cell.tps_2k)} words/sec` : (label || "—");
      perfMachines.appendChild(el("div", { class: "perf-machine-row" + (cell.state === "doesnt_fit" ? " nofit" : "") },
        el("span", { class: "hw-name", text: hwNameById.get(hwId) || hwId }),
        el("span", { class: "hw-speed", text: speed })));
    });
    if (perfMachines.children.length) {
      mount.appendChild(el("div", { class: "section-head" }, el("span", { class: "idx", text: "//" }), el("h2", { text: "Speed by machine" })));
      mount.appendChild(perfMachines);
    }

    // perf charts
    const curve = d.perf_curve || [];
    const cTtft = el("canvas");
    const cTps = el("canvas");
    const perf = el("div", {},
      el("div", { class: "section-head" }, el("span", { class: "idx", text: "//" }), el("h2", { text: "Speed in detail" })),
      el("div", { class: "charts" },
        el("div", { class: "chart-card" }, el("h3", { text: "Wait before the first word" }), el("p", { class: "sub", text: "How long it thinks before replying, as the conversation gets longer" }),
          el("div", { class: "chart-scroll" }, el("div", { class: "chart-box" }, cTtft))),
        el("div", { class: "chart-card" }, el("h3", { text: "Writing speed" }), el("p", { class: "sub", text: "Words per second once it starts, as the conversation gets longer" }),
          el("div", { class: "chart-scroll" }, el("div", { class: "chart-box" }, cTps)))));
    mount.appendChild(perf);
    perfChart(cTtft, curve, "ttft_ms_median", "#4AA8D8", "ms");
    perfChart(cTps, curve, "decode_tps_median", "#F5A34B", "words/s");

    // reproducibility
    mount.appendChild(el("div", { class: "section-head" }, el("span", { class: "idx", text: "//" }), el("h2", { text: "Provenance" })));
    mount.appendChild(reproBlock(d.reproducibility || {}, (d.voice || {}).avg_reply_words));

    // transcripts
    const samples = d.sample_transcripts || [];
    mount.appendChild(el("div", { class: "section-head" }, el("span", { class: "idx", text: "//" }),
      el("h2", { text: "Sample transcripts" }), el("span", { class: "note", text: "with the judge's per-criterion commentary" })));
    if (!samples.length) mount.appendChild(el("div", { class: "state", text: "No transcripts captured." }));
    samples.forEach((t, i) => mount.appendChild(transcriptFold(t, i)));
  } catch (e) { fail(mount, "Could not load model data for “" + slug + "” — " + e.message); }
}

/* ============================ METHODOLOGY =============================== */
/* judge cross-check: candidate judges replayed the SAME blinded pairs at the SAME prompt as the
   reference judge; the table reports how closely each reproduced its verdicts. `jc` is
   {reference_judge, judges:[…]} from methodology.json.judge_calibration, or null/empty. */
function calibrationCard(jc) {
  const rows = (jc && jc.judges) || [];
  if (!rows.length) return null;
  const tb = el("tbody");
  // The reference judge itself: show its OWN order-consistency (it self-flips too), with the
  // agreement/kappa/length cells blanked — a judge can't meaningfully agree with itself. Marked
  // ".ref" so it reads as the yardstick, not a candidate. Omitted if the value is missing
  // (pre-migration methodology.json).
  if (jc.reference_order_consistency != null)
    tb.appendChild(el("tr", { class: "ref" },
      el("td", { class: "id", text: `${jc.reference_judge} (reference · the yardstick)` }),
      el("td", { text: "—" }),
      el("td", { text: "—" }),
      el("td", { text: fmt.pct1(jc.reference_order_consistency) }),
      el("td", { text: "—" })));
  for (const j of rows)
    tb.appendChild(el("tr", {},
      el("td", { class: "id", text: j.candidate_judge }),
      el("td", { text: fmt.pct1(j.raw_agreement) }),
      el("td", { text: fmt.n3(j.cohens_kappa) }),
      el("td", { text: fmt.pct1(j.order_consistency) }),
      el("td", { text: fmt.ppDelta(j.length_pref_delta) })));
  const table = el("table", { class: "meth" },
    el("thead", {}, el("tr", {},
      el("th", { text: "Judge" }), el("th", { text: "Agreement" }), el("th", { text: "Kappa" }),
      el("th", { text: "Order-consistency" }), el("th", { text: "Length-pref Δ" }))), tb);
  return el("div", { class: "card", id: "judge-cross-check", style: "margin-top:22px" },
    el("h3", { text: "Judge cross-check" }),
    el("p", { class: "sub", text: `Candidate judges replayed the same blinded pairs, with the same prompt, that ${jc.reference_judge} scored — the table shows how closely each reproduced its verdicts.` }),
    el("div", { class: "table-scroll" }, table),
    el("p", { class: "read-guide", text: "0.6+ kappa = substantial agreement; the panel replays a blinded sample — it audits the reference judge, it does not score the ladder." }));
}

async function initMethodology() {
  const mount = $("#methodology");
  try {
    const m = await getJSON("data/methodology.json");
    const jm = document.querySelectorAll("[data-judge-model]");
    jm.forEach((n) => { n.textContent = m.judge_model || "—"; });

    // rubric criteria — name + plain-English description, weighted (EQ) ones flagged in ember
    const weighted = new Set(m.eq_weight_criteria || []);
    const descs = m.criterion_descriptions || {};
    const critList = el("ul", { class: "crit-defs" });
    for (const c of (m.rubric_criteria || []))
      critList.appendChild(el("li", { class: weighted.has(c) ? "weighted" : "" },
        // the plain name the rest of the site uses, with the database key kept alongside so
        // this page still lets you match a row back to the data
        el("span", { class: "cname", text: critLabel(c) }),
        el("span", { class: "ckey", text: c }),
        el("span", { class: "cdesc", text: descs[c] || "" })));

    const bm = m.bias_mitigations || {};
    const bmList = el("dl", { class: "kv" });
    const addbm = (k, v) => { bmList.appendChild(el("dt", { text: k })); bmList.appendChild(el("dd", { text: String(v) })); };
    addbm("pairwise both orderings", bm.pairwise_both_orderings ? "yes (A/B and B/A, averaged)" : "no");
    addbm("length truncation (chars)", bm.length_truncation_chars);
    addbm("iterations per scenario (replication)", bm.iterations_per_scenario);

    const sm = m.scoring_method || {};
    // three-step scoring sequence — the 1-2-3 ordering is meaningful here
    const steps = el("div", { class: "steps" },
      el("div", { class: "step" }, el("span", { class: "n", text: "01" }), el("span", { class: "lbl", text: "net preference" }),
        el("div", { class: "txt", text: "Both A/B orderings of every scenario × criterion are averaged into one signed margin — the sign picks the winner, its size is the weight." })),
      el("div", { class: "step" }, el("span", { class: "n", text: "02" }), el("span", { class: "lbl", text: "Bradley-Terry fit" }),
        el("div", { class: "txt", text: "A weighted Bradley-Terry solver turns all those paired comparisons into a single strength score per model." })),
      el("div", { class: "step" }, el("span", { class: "n", text: "03" }), el("span", { class: "lbl", text: "Elo + interval" }),
        el("div", { class: "txt", text: "Strengths are mean-centered on 1500 (the chess spread) and bootstrapped over scenarios for the 95% interval." })));
    const scoringProse = el("div", { class: "scoring-prose" },
      el("p", { class: "prose", text: sm.summary || "" }),
      el("p", { class: "prose", text: sm.scaling || "" }),
      el("p", { class: "prose", text: sm.confidence_interval || "" }));

    // scenarios table
    const tb = el("tbody");
    for (const s of (m.scenarios || []))
      tb.appendChild(el("tr", {}, el("td", { class: "id" }, s.id),
        el("td", {}, el("span", { class: "cat", text: s.category })), el("td", { text: s.title })));
    const table = el("table", { class: "meth" },
      el("thead", {}, el("tr", {}, el("th", { text: "id" }), el("th", { text: "category" }), el("th", { text: "title" }))), tb);

    const children = [
      // merged rubric + bias controls — one card, two balanced halves (no orphan card)
      el("div", { class: "card row-in" }, el("h3", { text: "Rubric & bias controls" }),
        el("div", { class: "split-card" },
          el("div", { class: "half" },
            el("div", { class: "half-title", text: "Rubric criteria" }),
            el("p", { class: "sub", text: "Nine 0–20 axes — each scored once per conversation. The ember-marked ones feed the EQ composite." }), critList),
          el("div", { class: "half" },
            el("div", { class: "half-title", text: "Bias controls" }),
            el("p", { class: "sub", text: "How the judge pass guards against ordering and length bias — plus how much each result is replicated." }), bmList,
            el("p", { class: "note", text: "The pairwise Elo ladder (the headline ranking) uses a single iteration — iteration 0 — per model per scenario, so the extra iterations add no replication to the ranking; they only reduce sampling noise in the rubric aggregates (EQ / Humanlike), which score every iteration." })))),
      // how the Elo ladder is scored — three-step sequence + the full data-driven prose
      el("div", { class: "card", style: "margin-top:22px" }, el("h3", { text: `How the Elo ladder is scored — ${sm.name || "Bradley-Terry"}` }),
        steps, scoringProse),
    ];
    // judge cross-check panel — only when the export carried it with a non-empty judges array
    const calib = calibrationCard(m.judge_calibration);
    if (calib) children.push(calib);
    children.push(
      el("div", { class: "caveat", style: "margin-top:22px" }, el("span", { class: "lab", text: "cross-judge cost caveat" }), m.cross_judge_cost_caveat || ""),
      el("div", { class: "section-head" }, el("span", { class: "idx", text: "//" }),
        el("h2", { text: `Scenario pack (${(m.scenarios || []).length})` })),
      el("div", { class: "table-scroll" }, table));
    mount.replaceChildren(...children);
    // the cross-check card is rendered async, so honor a deep link (hero → #judge-cross-check)
    // only after it exists in the DOM.
    if (location.hash && /^#[\w-]+$/.test(location.hash)) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) target.scrollIntoView({ block: "start" });
    }
  } catch (e) { fail(mount, "Could not load methodology.json — " + e.message); }
}

/* ============================== COMPARE ================================== */
function cmpMetricRow(label, a, b, fmtFn, higherWins, neutral) {
  const av = a == null ? null : Number(a), bv = b == null ? null : Number(b);
  let aWin = false, bWin = false;
  if (!neutral && av != null && bv != null && av !== bv) {
    const aBetter = higherWins ? av > bv : av < bv;
    aWin = aBetter; bWin = !aBetter;
  }
  return el("div", { class: "cmp-metric" },
    el("span", { class: "k", text: label }),
    el("span", { class: "v" + (aWin ? " win" : ""), text: fmtFn(a) }),
    el("span", { class: "v" + (bWin ? " win" : ""), text: fmtFn(b) }));
}

/* Normalized-Elo compare row: renders each side with its bootstrap CI (as the leaderboard does)
   and WITHHOLDS the "stronger" ember when the two 95% intervals overlap — the methodology's own
   within-noise test — so the compare page never asserts a winner the leaderboard calls a tie. A
   winner is marked only when both intervals are present and disjoint. */
function cmpEloRow(ra, rb) {
  const av = ra.normalized_elo == null ? null : Number(ra.normalized_elo);
  const bv = rb.normalized_elo == null ? null : Number(rb.normalized_elo);
  let aWin = false, bWin = false;
  if (av != null && bv != null && av !== bv) {
    const haveCI = ra.elo_ci_low != null && ra.elo_ci_high != null &&
                   rb.elo_ci_low != null && rb.elo_ci_high != null;
    const overlap = haveCI &&
      Number(ra.elo_ci_low) <= Number(rb.elo_ci_high) && Number(rb.elo_ci_low) <= Number(ra.elo_ci_high);
    if (!overlap) { aWin = av > bv; bWin = !aWin; }
  }
  return el("div", { class: "cmp-metric" },
    el("span", { class: "k", text: "How human it sounds (with margin of error)" }),
    el("span", { class: "v" + (aWin ? " win" : ""), text: fmt.eloCI(ra) }),
    el("span", { class: "v" + (bWin ? " win" : ""), text: fmt.eloCI(rb) }));
}

/* head-to-head pairwise judge verdict for the selected pair (spec §12). Reads the
   precomputed data/compare.json.pairwise, whose "<lo>|<hi>" record is margin-weighted with
   the same credit rule as the Elo ladder. It is the DIRECT head-to-head, not the global
   Elo rank — with >2 models the two can honestly differ (transitivity), so this card does
   not claim to mirror the ladder. `pairEntry` is {lo, hi, record, scenarios} or undefined. */
function pairwiseVerdictCard(pairEntry, ra, rb, bySlug) {
  const card = el("div", { class: "card row-in", style: "margin-top:22px" },
    el("h3", { text: "Pairwise judge verdict" }),
    el("p", { class: "sub", text: "Head-to-head: what the judge decided when both answered the same scenario (A/B and B/A orderings averaged)." }));
  if (!pairEntry || !(pairEntry.scenarios || []).length) {
    card.appendChild(el("p", { class: "note", text: "No head-to-head pairwise judging for this pair yet." }));
    return card;
  }
  const name = (slug) => (bySlug[slug] && bySlug[slug].display_name) || slug;
  const rec = pairEntry.record || { lo: pairEntry.lo, lo_credit: 0, hi_credit: 0 };
  const aCredit = rec.lo === ra.slug ? rec.lo_credit : rec.hi_credit;
  const bCredit = rec.lo === rb.slug ? rec.lo_credit : rec.hi_credit;
  card.appendChild(el("div", { class: "cmp-record" },
    el("span", { class: "rec" + (aCredit > bCredit ? " win" : ""), text: `${name(ra.slug)} ${aCredit}` }),
    el("span", { class: "dash", text: "–" }),
    el("span", { class: "rec" + (bCredit > aCredit ? " win" : ""), text: `${bCredit} ${name(rb.slug)}` })));
  card.appendChild(el("p", { class: "note", text: "Margin-weighted judge-preference games (a decisive win counts more than a narrow one). This is the direct head-to-head — the Elo ladder ranks across every opponent and can order two models differently." }));
  return card;
}

/* ---------------- compare page: summary before detail ---------------------
   The old page printed one row per scenario, each carrying nine criterion chips: 30 rows ×
   9 = 270 chips, every one repeating a full model name. Nothing was wrong in it and nothing
   could be found in it. These three build the same data as headline → summary → detail, with
   the chips folded away rather than deleted. */

/* Who won, in a sentence a person can repeat. */
function cmpHeadline(pairEntry, ra, rb, bySlug) {
  const scns = (pairEntry && pairEntry.scenarios) || [];
  if (!scns.length) return null;
  const name = (s) => (bySlug[s] && bySlug[s].display_name) || s;
  let aw = 0, bw = 0, ties = 0;
  for (const v of scns) {
    const w = v.overall.winner;
    if (w == null) ties++; else if (w === ra.slug) aw++; else bw++;
  }
  const lead = aw === bw
    ? `Dead even: ${aw} conversations each.`
    : `${name(aw > bw ? ra.slug : rb.slug)} won more of them.`;
  const parts = [`${aw} to ${name(ra.slug)}`, `${bw} to ${name(rb.slug)}`];
  if (ties) parts.push(`${ties} tied`);
  return el("div", { class: "cmp-headline" },
    el("p", { class: "ch-lead", text: lead }),
    el("p", { class: "ch-sub", text: `Across ${scns.length} conversations: ${parts.join(", ")}.` }));
}

/* Nine criteria, one diverging bar each: which model the judge preferred on that quality and
   by how much, summed over every conversation. This is what the 270 chips were trying to say. */
function cmpCriterionSummary(pairEntry, ra, rb) {
  const scns = (pairEntry && pairEntry.scenarios) || [];
  if (!scns.length) return null;
  const net = {};                       // criterion -> signed margin, positive favours ra
  for (const v of scns) {
    for (const c of (v.per_criterion || [])) {
      if (c.winner == null) { net[c.criterion] = net[c.criterion] || 0; continue; }
      const sign = c.winner === ra.slug ? 1 : -1;
      net[c.criterion] = (net[c.criterion] || 0) + sign * Number(c.margin || 0);
    }
  }
  const rows = CRITERIA.filter((c) => c.key in net);
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((c) => Math.abs(net[c.key])));

  const card = el("div", { class: "card row-in", style: "margin-top:22px" },
    el("h3", { text: "Where each one is stronger" }),
    el("p", { class: "sub", text:
      "Every conversation added up, one quality at a time. Each bar points toward the model "
      + "the judge preferred on that quality, and its length is how strong the preference was." }),
    el("div", { class: "div-head" },
      el("span", { class: "dh-a", text: "◀ " + ra.display_name }),
      el("span", { class: "dh-b", text: rb.display_name + " ▶" })));
  for (const c of rows) {
    const v = net[c.key];
    const pct = (Math.abs(v) / max) * 50;                     // half-width each side
    // The value sits on the SAME side as the bar. Parked in a fixed right-hand column it
    // read as belonging to the right-hand model even when the bar favoured the left one.
    const val = el("span", {
      class: "dr-v",
      // park it just past the bar's outer end, on the winning side
      style: v === 0 ? "left:calc(50% + 8px)"
           : (v > 0 ? `right:calc(50% + ${pct}% + 8px)` : `left:calc(50% + ${pct}% + 8px)`),
      text: v === 0 ? "tie" : Math.abs(v).toFixed(1),
    });
    card.appendChild(el("div", { class: "divrow", title: c.tip },
      el("span", { class: "dr-k", text: c.label }),
      el("span", { class: "dr-track" },
        el("span", { class: "dr-bar" + (v > 0 ? " a" : " b"),
          style: v === 0 ? "width:0" : (v > 0 ? `right:50%;width:${pct}%` : `left:50%;width:${pct}%`) }),
        val)));
  }
  return card;
}

/* One row per conversation, named in words. The nine chips live behind each row's expander —
   available, not shouted. */
function cmpScenarioList(pairEntry, ra, rb, bySlug) {
  const scns = (pairEntry && pairEntry.scenarios) || [];
  if (!scns.length) return null;
  const name = (s) => (bySlug[s] && bySlug[s].display_name) || s;
  const card = el("div", { class: "card row-in", style: "margin-top:22px" },
    el("h3", { text: "Conversation by conversation" }),
    el("p", { class: "sub", text: "Each of the scripted conversations, and who the judge preferred. Open one to see how it broke down by quality." }));
  for (const v of scns) {
    const w = v.overall.winner, isTie = w == null;
    const chips = el("div", { class: "crit-chips" });
    for (const c of (v.per_criterion || [])) {
      chips.appendChild(el("span", { class: "chip" + (c.winner == null ? " tie" : ""),
        text: `${critLabel(c.criterion)}: ${c.winner == null ? "tie" : name(c.winner) + " +" + Number(c.margin).toFixed(1)}` }));
    }
    const summary = el("summary", {},
      el("span", { class: "scn", text: scenarioLabel(v.scenario_id) }),
      el("span", { class: "vv" + (isTie ? " tie" : ""),
        text: isTie ? "too close to call" : `${name(w)} +${Number(v.overall.margin).toFixed(1)}` }));
    card.appendChild(el("details", { class: "scn-row" }, summary, chips));
  }
  return card;
}

async function initCompare() {
  const mount = $("#compare");
  let lb;
  try { lb = await getJSON("data/leaderboard.json"); }
  catch (e) { fail(mount, "Could not load leaderboard.json — " + e.message); return; }
  const models = lb.models || [];
  if (models.length < 1) { fail(mount, "Need at least one model to compare."); return; }
  const bySlug = Object.fromEntries(models.map((m) => [m.slug, m]));
  // pairwise verdicts are optional — the page still works if compare.json is absent
  const compare = await getJSON("data/compare.json").catch(() => ({ pairwise: {} }));
  const pairwise = (compare && compare.pairwise) || {};

  SCENARIO_TITLES = (compare && compare.scenarios) || {};

  const mkSelect = (def) => {
    const s = el("select", { class: "pick" });
    // display_name only: it already carries the quant, so appending the slug printed
    // "glistening-gem-31b (Q4_K_M) · glistening-gem-31b-q4" — the same thing twice.
    models.forEach((m) => s.appendChild(el("option", { value: m.slug, selected: (m.slug === def) ? "selected" : null }, m.display_name)));
    return s;
  };
  // Default to the strongest model against the strongest opponent it was ACTUALLY judged
  // against, from a different family. Two constraints, both learned the hard way:
  //   - `pairwise_opponents` caps who faces whom, so most pairs have no head-to-head data
  //     at all; defaulting to one opens the page with its two best sections missing.
  //   - #1 vs #2 is often two builds of the same model — near-identical columns and a
  //     board of ties, i.e. the page at its least informative.
  const ranked = [...models].sort((a, b) => (b.normalized_elo ?? -Infinity) - (a.normalized_elo ?? -Infinity));
  const stem = (m) => (m.slug || "").split("-")[0];
  const judged = (x, y) => {
    const e = pairwise[[x, y].sort().join("|")];
    return e && (e.scenarios || []).length;
  };
  const top = ranked.find((m) => ranked.some((o) => judged(m.slug, o.slug))) || ranked[0];
  const other = ranked.find((m) => m.slug !== top.slug && stem(m) !== stem(top) && judged(top.slug, m.slug))
             || ranked.find((m) => m.slug !== top.slug && judged(top.slug, m.slug))
             || ranked[1] || ranked[0];
  const selA = mkSelect(top.slug);
  const selB = mkSelect(other.slug);
  const pickers = el("div", { class: "pickers" }, selA, el("span", { class: "vs", text: "VS" }), selB);
  const out = el("div", { id: "cmp-out" });
  mount.replaceChildren(pickers, out);

  const cache = {};
  async function detail(slug) { if (!cache[slug]) cache[slug] = await getJSON(`data/models/${encodeURIComponent(slug)}.json`).catch(() => null); return cache[slug]; }

  async function render() {
    const sa = selA.value, sb = selB.value;
    const ra = bySlug[sa], rb = bySlug[sb];
    out.replaceChildren(el("div", { class: "state", text: "loading…" }));
    const [da, db] = await Promise.all([detail(sa), detail(sb)]);

    // key must match Python's f"{lo}|{hi}" from sorted((a,b)); JS default string sort and
    // Python's codepoint sort agree for the project's ASCII slug convention.
    const pairKey = [sa, sb].sort().join("|");
    const pe = pairwise[pairKey];

    // Answer first, then the summary that supports it, then the per-conversation detail.
    const nodes = [
      cmpHeadline(pe, ra, rb, bySlug),
      cmpCriterionSummary(pe, ra, rb),
    ].filter(Boolean);

    // Read them yourself — the same spine the front page uses. This is the most convincing
    // thing on the site, so it sits above the numbers rather than under them.
    if (da && db) {
      const aByScn = Object.fromEntries((da.sample_transcripts || []).map((t) => [t.scenario_id, t]));
      const shared = (db.sample_transcripts || []).map((t) => t.scenario_id).find((id) => aByScn[id]);
      if (shared) {
        const ta = aByScn[shared], tb = (db.sample_transcripts || []).find((t) => t.scenario_id === shared);
        const users = (ta.turns || []).filter((x) => x.role === "user").map((x) => x.content);
        const repA = (ta.turns || []).filter((x) => x.role === "assistant").map((x) => x.content);
        const repB = (tb.turns || []).filter((x) => x.role === "assistant").map((x) => x.content);
        const row = (i) => el("div", { class: "spine-row" },
          el("div", { class: "lane lane-a" }, el("div", { class: "say", text: repA[i] || "" })),
          el("div", { class: "said" }, el("div", { class: "bubble", text: users[i] })),
          el("div", { class: "lane lane-b" }, el("div", { class: "say", text: repB[i] || "" })));
        // Replies here run much longer than the front page's, and a model that writes three
        // times as much stretches every row. Show the opening exchanges, fold the rest.
        const SHOW = 3;
        const spine = el("div", { class: "spine" });
        for (let i = 0; i < Math.min(SHOW, users.length); i++) spine.appendChild(row(i));
        if (users.length > SHOW) {
          const rest = el("div", { class: "spine" });
          for (let i = SHOW; i < users.length; i++) rest.appendChild(row(i));
          spine.appendChild(el("details", { class: "spine-more" },
            el("summary", { text: "read the rest of the conversation" }), rest));
        }
        nodes.push(el("div", { class: "card row-in", style: "margin-top:22px" },
          el("h3", { text: "Read them side by side" }),
          el("p", { class: "sub", text:
            `The same person, saying the same things to both — “${ta.title || shared}”. `
            + `${ra.display_name} on the left, ${rb.display_name} on the right.` }),
          spine));
      }
    }

    nodes.push(cmpScenarioList(pe, ra, rb, bySlug));

    // The numbers, in plain language, last — for anyone who wants them.
    const headline = el("div", { class: "card row-in", style: "margin-top:22px" },
      el("h3", { text: "The numbers" }),
      el("p", { class: "sub" }, el("b", { text: ra.display_name }), " on the left, ",
        el("b", { text: rb.display_name }), " on the right. Ember marks the stronger value; "
        + "the human score shows none when the two ranges overlap, because then it's a tie."));
    headline.appendChild(cmpEloRow(ra, rb));
    headline.appendChild(cmpMetricRow("Emotional IQ (out of 100)", ra.eq_score, rb.eq_score, fmt.n1, true));
    headline.appendChild(cmpMetricRow("Sounds human (out of 100)", ra.humanlike_score, rb.humanlike_score, fmt.n1, true));
    headline.appendChild(cmpMetricRow("Reply length (words — style, not quality)", ra.avg_reply_words, rb.avg_reply_words, fmt.int, false, true));
    for (const hw of (window.OG_HARDWARE || [])) {
      const va = speedOn(ra, hw.hardware_id), vb = speedOn(rb, hw.hardware_id);
      if (va == null && vb == null) continue;
      headline.appendChild(cmpMetricRow(`Speed on ${hw.display_name} (words/sec)`, va, vb,
        (v) => (v == null ? "doesn't fit / not measured" : Math.round(v)), true));
    }
    nodes.push(headline);

    // Per-criterion averages, using the same names as everywhere else on the site.
    if (da && db) {
      const mapB = Object.fromEntries((db.criteria || []).map((c) => [c.criterion, c.mean]));
      const critCmp = el("div", { class: "card", style: "margin-top:22px" },
        el("h3", { text: "Average score on each quality" }),
        el("p", { class: "sub", text: "Judge's mean score out of 20, over every conversation. Higher is better on all nine — the two inverted ones are worded so that more is better." }));
      for (const c of (da.criteria || [])) {
        critCmp.appendChild(cmpMetricRow(critLabel(c.criterion), c.mean, mapB[c.criterion], fmt.n1, true));
      }
      nodes.push(critCmp);
    }

    out.replaceChildren(...nodes.filter(Boolean));
  }
  selA.addEventListener("change", render);
  selB.addEventListener("change", render);
  render();
}

/* ============================== VOICES (TTS) ===============================
   A sourced survey of the speech-synthesis market, NOT a gauntlet result. The
   payload comes straight from configs/tts.yaml with no DB path, and nothing here
   may present itself as benchmarked — the leaderboard scores text, this scores
   nothing. Sorting is client-side over the numeric *_sort fields rather than the
   display strings, because "$50–100 / 1M chars" and "70+ (v3) · 32 (Flash)" do
   not compare as numbers.
   ========================================================================== */

const TTS_CATS = [
  { key: "cloud",  label: "Cloud API" },
  { key: "hyper",  label: "Hyperscaler" },
  { key: "open",   label: "Open weights" },
  { key: "device", label: "On-device" },
  { key: "rt",     label: "Realtime S2S" },
  { key: "vc",     label: "Voice conversion" },
  { key: "legacy", label: "Classical" },
];
const TTS_CAT_LABEL = Object.fromEntries(TTS_CATS.map((c) => [c.key, c.label]));

/* Licence class → what a buyer needs to know in one word. `bad` is the important
   one: open weights you may NOT use commercially, which is the trap this page
   exists to flag. */
const TTS_LIC = {
  open:   { label: "commercial-safe", cls: "lic-open" },
  warn:   { label: "has a catch",     cls: "lic-warn" },
  bad:    { label: "non-commercial",  cls: "lic-bad" },
  closed: { label: "proprietary",     cls: "lic-closed" },
  dead:   { label: "discontinued",    cls: "lic-dead" },
};

const TTS_COLS = [
  { key: "name",       label: "System",   txt: true },
  { key: "category",   label: "Kind",     txt: true },
  { key: "licence",    label: "Licence",  txt: true },
  { key: "price_sort", label: "Cost",     txt: true },
  { key: "cloning",    label: "Cloning",  txt: true, wide: true },
  { key: "emotion",    label: "Emotion control", txt: true, wide: true },
  { key: "languages_sort", label: "Langs" },
  { key: "runs_on",    label: "Runs on",  txt: true, wide: true },
];

/* Sort value for a column. Numeric columns read their dedicated *_sort field so
   the order matches the label; everything else compares as lowercased text. */
function ttsSortVal(row, key) {
  if (key === "price_sort" || key === "languages_sort") return row[key];
  if (key === "category") return TTS_CAT_LABEL[row.category] || row.category;
  return String(row[key] == null ? "" : row[key]).toLowerCase();
}

function ttsMatches(row, q) {
  if (!q) return true;
  const hay = [
    row.name, row.variants, TTS_CAT_LABEL[row.category], row.licence, row.price_note,
    row.cloning, row.emotion, row.languages_note, row.runs_on, row.latency_note,
    row.best_for, row.watch,
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

function ttsDetailRow(row, colCount) {
  const body = el("div", { class: "tts-detail-body" });
  body.appendChild(el("p", { class: "tts-best" },
    el("span", { class: "tts-dt", text: "Best for" }), " ", row.best_for));
  if (row.latency_note) {
    body.appendChild(el("p", { class: "tts-lat" },
      el("span", { class: "tts-dt", text: "Latency" }), " ", row.latency_note));
  }
  if (row.watch) {
    // The caveat is the reason this page exists; give it its own visual weight.
    body.appendChild(el("p", { class: "tts-watch" },
      el("span", { class: "tts-dt warn", text: "Watch out" }), " ", row.watch));
  }
  const td = el("td", { class: "tts-detail-cell", colspan: String(colCount) }, body);
  return el("tr", { class: "tts-detail", hidden: "hidden" }, td);
}

function renderTtsMatrix(mount, rows, state) {
  const shown = rows
    .filter((r) => !state.cats.size || state.cats.has(r.category))
    .filter((r) => ttsMatches(r, state.q));

  const dir = state.desc ? -1 : 1;
  shown.sort((a, b) => {
    const x = ttsSortVal(a, state.sort), y = ttsSortVal(b, state.sort);
    // Rows with no number sink to the bottom in BOTH directions — reversing the
    // sort must never float "not published" to the top.
    if (x == null && y == null) return a.name.localeCompare(b.name);
    if (x == null) return 1;
    if (y == null) return -1;
    if (x < y) return -1 * dir;
    if (x > y) return 1 * dir;
    return a.name.localeCompare(b.name);
  });

  if (!shown.length) {
    mount.replaceChildren(el("div", { class: "state" }, "No system matches that filter."));
    return;
  }

  const thead = el("thead");
  const htr = el("tr");
  TTS_COLS.forEach((c) => {
    const th = el("th", {
      class: c.txt ? "txt" : "",
      tabindex: "0",
      role: "button",
      onclick: () => {
        if (state.sort === c.key) state.desc = !state.desc;
        else { state.sort = c.key; state.desc = false; }
        renderTtsMatrix(mount, rows, state);
      },
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.click(); }
      },
    }, c.label, el("span", { class: "arrow", text: state.desc ? " ▼" : " ▲" }));
    if (state.sort === c.key) th.setAttribute("aria-sort", state.desc ? "descending" : "ascending");
    htr.appendChild(th);
  });
  thead.appendChild(htr);

  const tbody = el("tbody");
  shown.forEach((row) => {
    const lic = TTS_LIC[row.licence_class] || TTS_LIC.closed;
    const detail = ttsDetailRow(row, TTS_COLS.length);

    const nameCell = el("td", { class: "tts-name txt" },
      el("span", { class: "nm", text: row.name }));
    if (row.variants) nameCell.appendChild(el("span", { class: "slug", text: row.variants }));

    const tr = el("tr", {
      class: "tts-row" + (row.licence_class === "dead" ? " is-dead" : ""),
      tabindex: "0",
      role: "button",
      "aria-expanded": "false",
      onclick: () => {
        const open = detail.hasAttribute("hidden");
        if (open) detail.removeAttribute("hidden"); else detail.setAttribute("hidden", "hidden");
        tr.setAttribute("aria-expanded", open ? "true" : "false");
        tr.classList.toggle("open", open);
      },
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.click(); }
      },
    },
      nameCell,
      el("td", { class: "txt" }, el("span", { class: "chip", text: TTS_CAT_LABEL[row.category] || row.category })),
      el("td", { class: "txt tts-lic" },
        el("span", { class: "chip lic " + lic.cls, title: row.licence, text: lic.label })),
      el("td", { class: "txt tts-price", text: row.price_note }),
      el("td", { class: "txt tts-prose", text: row.cloning }),
      el("td", { class: "txt tts-prose", text: row.emotion }),
      el("td", { text: row.languages_note }),
      el("td", { class: "txt tts-prose", text: row.runs_on }),
    );

    tbody.appendChild(tr);
    tbody.appendChild(detail);
  });

  const table = el("table", { class: "lb tts" }, thead, tbody);
  const wrapEl = el("div", { class: "table-scroll" }, table);
  const count = el("p", { class: "note tts-count" },
    `${shown.length} of ${rows.length} systems shown. Click any row for what it is best at — and the catch.`);
  mount.replaceChildren(count, wrapEl);
}

function renderTtsControls(mount, rows, state, onChange) {
  const pills = el("div", { class: "pill-row" });
  const all = el("button", { class: "pill" + (state.cats.size ? "" : " on"), text: "All" });
  all.addEventListener("click", () => { state.cats.clear(); onChange(); });
  pills.appendChild(all);
  TTS_CATS.forEach((c) => {
    const n = rows.filter((r) => r.category === c.key).length;
    if (!n) return;
    const p = el("button", { class: "pill" + (state.cats.has(c.key) ? " on" : "") },
      c.label, el("span", { class: "pill-n", text: String(n) }));
    p.addEventListener("click", () => {
      if (state.cats.has(c.key)) state.cats.delete(c.key); else state.cats.add(c.key);
      onChange();
    });
    pills.appendChild(p);
  });

  const search = el("input", {
    class: "tts-search", type: "search", "aria-label": "Search every field",
    placeholder: "Search licence, language, hardware, caveat…",
  });
  search.value = state.q;
  search.addEventListener("input", () => { state.q = search.value.trim().toLowerCase(); onChange(); });

  mount.replaceChildren(el("div", { class: "tts-controls" }, pills, search));
}

function renderTtsCorrections(mount, items) {
  if (!items || !items.length) { mount.replaceChildren(); return; }
  const list = el("div", { class: "tts-corrections" });
  items.forEach((c) => {
    list.appendChild(el("div", { class: "tts-corr" },
      el("p", { class: "tts-claim" },
        el("span", { class: "tts-dt bad", text: "Commonly stated" }), " ", c.claim),
      el("p", { class: "tts-real" },
        el("span", { class: "tts-dt", text: "Actually" }), " ", c.reality)));
  });
  mount.replaceChildren(list);
}

function renderTtsGaps(mount, gaps) {
  if (!gaps || !gaps.length) { mount.replaceChildren(); return; }
  const ul = el("ul", { class: "deflist tts-gaps" });
  gaps.forEach((g) => ul.appendChild(el("li", { text: g })));
  mount.replaceChildren(el("div", { class: "card explainer" }, ul));
}

async function initTts() {
  const matrix = $("#tts-matrix");
  const controls = $("#tts-controls");
  let doc;
  try {
    doc = await getJSON("data/tts.json");
  } catch (e) {
    fail(matrix, "The voices matrix could not be loaded.");
    return;
  }
  const rows = doc.systems || [];
  const state = { cats: new Set(), q: "", sort: "name", desc: false };
  const rerender = () => {
    renderTtsControls(controls, rows, state, rerender);
    renderTtsMatrix(matrix, rows, state);
  };
  rerender();
  renderTtsCorrections($("#tts-corrections"), doc.corrections);
  renderTtsGaps($("#tts-gaps"), doc.gaps);

  // Provenance: the edition and compile date belong on the page, because every
  // figure in the table is only true as of that date.
  const foot = $("[data-generated-at]");
  if (foot && doc.compiled) foot.textContent = `${doc.compiled} · voices edition ${doc.edition}`;
}

/* ------------------------------ router ---------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.getAttribute("data-page");
  if (page === "leaderboard") initLeaderboard();
  else if (page === "model") initModel();
  else if (page === "methodology") initMethodology();
  else if (page === "compare") initCompare();
  else if (page === "tts") initTts();
});
