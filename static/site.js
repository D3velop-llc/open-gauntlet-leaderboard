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
function cfgLabel(row) {
  const q = (row.quant || "").toString();
  const s = (row.slug || "").toString().toLowerCase();
  let prec;
  if (q && q.toLowerCase() !== "unknown") prec = q;                 // GGUF quant code, keep it
  else if (s.includes("nvfp4") || s.includes("-fp4")) prec = "NVFP4 (4-bit)";
  else if (s.includes("fp8")) prec = "FP8 (8-bit)";
  else prec = "full precision";
  const engine = { vllm: "vLLM", sglang: "SGLang", "llama.cpp": "llama.cpp" }[row.backend] || row.backend;
  return [prec, engine].filter(Boolean).join(" · ");
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

const COLS = [
  { key: "rank", label: "#", css: "txt", group: "" },
  { key: "model", label: "Model", css: "txt", type: "text", group: "" },
  { key: "size", label: "Size", type: "text", group: "",
    title: "How big the model is, in billions of parameters. Smaller is easier to run. "
         + "'26B (uses 4B/reply)' means it's a big model that only activates part of itself "
         + "each reply — that makes it faster, but it still needs the full size in memory." },
  { key: "vram", label: "Runs on", type: "text", group: "",
    title: "Rough graphics-card memory (VRAM) needed to run it. Under ~12 GB fits most gaming "
         + "GPUs; 24 GB needs a high-end card; 48 GB+ is server-class. Estimated from the "
         + "model's compression — treat as a ballpark. '—' = couldn't estimate." },
  { key: "normalized_elo", label: "Human score", type: "num", heat: true, group: "How it scored",
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
  // ranking. (The underlying composite correlates -0.93 with mean reply length, so coloring it
  // would wrongly paint a long-form model as "worse".) For a companion/roleplay app a reader
  // may WANT longer replies, so it's presented neutrally.
  { key: "voice_composite", label: "Reply length", type: "num", group: "How it scored",
    title: "Higher = shorter, punchier replies. This is STYLE, not quality, and is NOT part of "
         + "the ranking — for a companion or roleplay app you may prefer longer replies." },
  { key: "ttft_2k_ms", label: "Wait for 1st word", type: "num", group: "Speed",
    title: "How long before it starts replying to a long (~2,000-word) prompt. Lower is better. "
         + "'—' = not speed-tested yet." },
  { key: "tps_2k", label: "Speed", type: "num", group: "Speed",
    title: "How fast it writes once it starts, in words per second. Higher is faster. "
         + "'—' = not speed-tested yet." },
];
// mark group starts once so header AND body cells can draw the boundary rule
for (let i = 1; i < COLS.length; i++) COLS[i].gstart = COLS[i].group !== COLS[i - 1].group;
const GROUP_TITLES = {
  "How it scored": "How a top commercial AI (GPT-5.4) graded each model — same test for all.",
  "Speed": "Measured on this machine — no AI judge involved.",
};

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

function renderLeaderboard(models, rankKey = null) {
  const crit = rankKey ? CRITERIA.find((c) => c.key === rankKey) : null;
  // In criterion mode: replace the "Human score" (Elo) column with a column showing this
  // criterion's 0-100 score, and drop the head-to-head Win-rate column. Everything else
  // (Size, Runs on, Emotional IQ, Humanlike, speed) stays. `criterion` is a synthetic column.
  const cols = !crit ? COLS : COLS
    .filter((c) => c.key !== "win_rate")
    .map((c) => c.key === "normalized_elo"
      ? { key: "criterion", label: crit.label, type: "num", heat: true,
          group: "How it scored", title: crit.tip, gstart: c.gstart }
      : c);

  const ranges = {};
  for (const c of cols) if (c.heat) {
    ranges[c.key] = c.key === "criterion"
      ? columnRangeBy(models, (m) => (m.criteria ? m.criteria[rankKey] : null))
      : columnRange(models, c.key);
  }

  const modelPage = (window.OG && window.OG.modelPage) || "model.html";
  const thead = el("thead");
  // provenance group row: which columns the judge scored vs measured locally
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

    const v = row[c.key];
    let disp;
    if (c.key === "ttft_2k_ms") disp = fmt.secs(v);
    else if (c.key === "tps_2k") disp = fmt.wps(v);
    else if (c.key === "normalized_elo") disp = fmt.eloCI(row);
    else if (c.key === "win_rate") disp = fmt.pct(v);
    else if (c.key === "eq_score" || c.key === "humanlike_score") disp = fmt.score100(v);
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
    rows.forEach((row) => {
      const tr = el("tr", { class: row.ranked === false ? "provisional" : "" });
      for (const c of cols) {
        const td = cell(c, row);
        if (c.gstart) td.classList.add("gstart");
        tr.appendChild(td);
      }
      // Provisional models do not occupy a rank — numbering them would assert a standing
      // their incomplete judging cannot support.
      tr.firstChild.textContent = row.ranked === false ? "—" : String(++rank);
      tbody.appendChild(tr);
    });
  }

  let sortKey = rankKey ? "criterion" : "normalized_elo", sortDir = -1;   // default: strongest on top
  function applySort() {
    const rows = [...models].sort((a, b) => {
      // Provisional rows always sink, whatever the active sort — they are not participants
      // in the ordering, they are appended context.
      if ((a.ranked === false) !== (b.ranked === false)) return a.ranked === false ? 1 : -1;
      let x = a[sortKey], y = b[sortKey];
      if (sortKey === "criterion") { x = a.criteria ? a.criteria[rankKey] : null; y = b.criteria ? b.criteria[rankKey] : null; }
      if (sortKey === "model") { x = a.display_name; y = b.display_name; }
      if (sortKey === "size") { x = a.params_total_b; y = b.params_total_b; }
      if (sortKey === "vram") { x = vramGB(a); y = vramGB(b); }
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

  const kids = [
    el("h2", { class: "pick-h", text: "Which should I pick?" }),
    el("p", { class: "pick-lead" },
      `The top ${tier.length} models all score about the same — the test can't tell them apart, `
      + `so any of them is a safe pick. Choose by what fits your computer:`),
  ];
  const ul = el("ul", { class: "pick-list" });
  if (lightest) {
    ul.appendChild(el("li", {},
      el("strong", { text: "Lightest to run: " }), link(lightest),
      document.createTextNode(` — needs the least memory (${vramLabel(lightest)}) of the top group.`)));
  }
  if (fastest) {
    ul.appendChild(el("li", {},
      el("strong", { text: "Fastest: " }), link(fastest),
      document.createTextNode(` — writes about ${Math.round(fastest.tps_2k)} words/second, quickest of the top group.`)));
  }
  ul.appendChild(el("li", {},
    el("strong", { text: "Want the top score: " }), link(tier[0]),
    document.createTextNode(" — but it's barely ahead, so don't overthink it.")));
  ul.appendChild(el("li", { class: "pick-note" },
    fastest ? "All of these are open-weight and free to run yourself."
            : "Speed isn't measured for every top model yet — check the “Speed” columns if that "
              + "matters. All of these are open-weight and free to run yourself."));
  kids.push(ul);
  mount.replaceChildren(el("div", { class: "pick" }, ...kids));
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
  mount.replaceChildren(el("p", { class: "tie-note" },
    el("strong", { text: `The top ${tier.length} are a tie, not a ranking. ` }),
    `Their scores are close enough that we can't say any one is really better — treat #1 through `
    + `#${tier.length} as equally good and choose on size and speed. Models just below them are `
    + `often close too, so read the whole board as a gradient, not exact places.`));
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

async function initLeaderboard() {
  const mount = $("#leaderboard");
  try {
    const data = await getJSON("data/leaderboard.json");
    const jg = data.judge_generation || {};
    const gen = document.querySelector("[data-generated-at]");
    if (gen && data.generated_at) gen.textContent = new Date(data.generated_at).toISOString().replace("T", " ").slice(0, 16) + " UTC";
    renderJudgingStrip(jg.model, data.judge_calibration_summary);
    if (!data.models || !data.models.length) { renderVerdictStrip([]); fail(mount, "No models have completed a run yet."); return; }
    renderVerdictStrip(data.models);
    renderPickCard(data.models);
    renderTieBanner(data.models);
    renderRankBy(data.models);
    mount.replaceChildren(renderLeaderboard(data.models));
  } catch (e) { fail(mount, "Could not load leaderboard.json — " + e.message); }
}

/* ============================ MODEL DETAIL =============================== */
function critCard(criteria) {
  const card = el("div", { class: "card" }, el("h3", { text: "Rubric criteria" }),
    el("p", { class: "sub", text: "Mean score per criterion (0–20). The whisker spans ±1 std of iteration-to-iteration noise, averaged over scenarios (it excludes scenario-to-scenario spread)." }));
  for (const c of criteria) {
    const mean = c.mean, std = Math.sqrt(Math.max(0, c.variance || 0));
    const pct = (v) => Math.max(0, Math.min(100, (v / 20) * 100));
    const lo = pct(mean - std), hi = pct(mean + std);
    card.appendChild(el("div", { class: "crit" },
      el("div", { class: "cl" },
        el("span", { class: "name", text: c.criterion.replace(/_/g, " ") }),
        el("span", { class: "val", text: fmt.n1(mean) + " / 20" })),
      el("div", { class: "bar" },
        el("div", { class: "fill", style: `width:${pct(mean)}%` }),
        el("div", { class: "whisk", style: `left:${lo}%;width:${Math.max(0, hi - lo)}%` }))));
  }
  return card;
}

function categoryCard(cats) {
  const card = el("div", { class: "card" }, el("h3", { text: "By scenario category" }),
    el("p", { class: "sub", text: "Mean rubric score (0–20) grouped by scenario family." }));
  if (!cats || !cats.length) { card.appendChild(el("p", { class: "note", text: "No category data." })); return card; }
  const max = 20;
  for (const c of cats) {
    card.appendChild(el("div", { class: "catrow" },
      el("span", { class: "cat", text: c.category }),
      el("div", { class: "bar" }, el("div", { class: "fill", style: `width:${(c.mean_score_0_20 / max) * 100}%` })),
      el("span", { class: "num", text: fmt.n1(c.mean_score_0_20) })));
  }
  return card;
}

function reproBlock(repro, voiceComposite) {
  const kv = el("dl", { class: "kv" });
  const add = (k, v) => { kv.appendChild(el("dt", { text: k })); kv.appendChild(el("dd", { text: v == null || v === "" ? "—" : String(v) })); };
  add("harness_git_commit", repro.harness_git_commit);
  // when the run row lacked judge fields, the export backfills them from the resolved rubric
  // generation — flag that so "verify" never implies the harness itself recorded them.
  const jsuffix = repro.judge_provenance_resolved ? " (resolved from stored verdicts)" : "";
  add("judge_model", repro.judge_model == null ? null : String(repro.judge_model) + jsuffix);
  add("judge_prompt_hash", repro.judge_prompt_hash == null ? null : String(repro.judge_prompt_hash) + jsuffix);
  add("voice_composite", fmt.n2(voiceComposite));
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
          el("span", { class: "c", text: s.criterion.replace(/_/g, " ") }),
          el("span", { class: "s", text: (s.score_0_20 != null ? s.score_0_20 : "—") + " / 20" })),
        s.justification ? el("div", { class: "just", text: s.justification }) : null));
    }
    wrap.appendChild(jn);
  }
  return el("details", { class: "fold" },
    el("summary", {}, el("span", { class: "caret", text: "▸" }), `Transcript — ${t.scenario_id} · iter ${t.iteration}`,
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
          callbacks: { title: (it) => `${it[0].label} prompt tokens`, label: (it) => ` ${Number(it.raw).toFixed(1)} ${unit}` },
        },
      },
      scales: {
        x: { title: { display: true, text: "prompt tokens", color: muted, font: { size: 10 } },
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
    const d = await getJSON(`data/models/${encodeURIComponent(slug)}.json`);
    $("[data-model-name]").textContent = d.display_name || slug;
    $("[data-model-slug]").textContent = slug;
    document.title = `${d.display_name || slug} — OpenGauntlet`;
    mount.replaceChildren();   // clear the "Loading…" placeholder

    const grid = el("div", { class: "grid-2 row-in" }, critCard(d.criteria || []), categoryCard(d.category_breakdown || []));
    mount.appendChild(grid);

    // perf charts
    const curve = d.perf_curve || [];
    const cTtft = el("canvas");
    const cTps = el("canvas");
    const perf = el("div", {},
      el("div", { class: "section-head" }, el("span", { class: "idx", text: "//" }), el("h2", { text: "Throughput & latency" })),
      el("div", { class: "charts" },
        el("div", { class: "chart-card" }, el("h3", { text: "Time to first token" }), el("p", { class: "sub", text: "TTFT median (ms) vs prompt size" }),
          el("div", { class: "chart-scroll" }, el("div", { class: "chart-box" }, cTtft))),
        el("div", { class: "chart-card" }, el("h3", { text: "Decode speed" }), el("p", { class: "sub", text: "words/sec median vs prompt size" }),
          el("div", { class: "chart-scroll" }, el("div", { class: "chart-box" }, cTps)))));
    mount.appendChild(perf);
    perfChart(cTtft, curve, "ttft_ms_median", "#4AA8D8", "ms");
    perfChart(cTps, curve, "decode_tps_median", "#F5A34B", "words/s");

    // reproducibility
    mount.appendChild(el("div", { class: "section-head" }, el("span", { class: "idx", text: "//" }), el("h2", { text: "Provenance" })));
    mount.appendChild(reproBlock(d.reproducibility || {}, (d.voice || {}).composite));

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
        el("span", { class: "cname", text: c.replace(/_/g, " ") }),
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
function cmpMetricRow(label, a, b, fmtFn, higherWins) {
  const av = a == null ? null : Number(a), bv = b == null ? null : Number(b);
  let aWin = false, bWin = false;
  if (av != null && bv != null && av !== bv) {
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
    el("span", { class: "k", text: "Normalized Elo (95% CI)" }),
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
  // record credit is keyed by lo/hi; map to the selected left (ra) / right (rb) models
  const rec = pairEntry.record || { lo: pairEntry.lo, lo_credit: 0, hi_credit: 0 };
  const aCredit = rec.lo === ra.slug ? rec.lo_credit : rec.hi_credit;
  const bCredit = rec.lo === rb.slug ? rec.lo_credit : rec.hi_credit;
  card.appendChild(el("div", { class: "cmp-record" },
    el("span", { class: "rec" + (aCredit > bCredit ? " win" : ""), text: `${name(ra.slug)} ${aCredit}` }),
    el("span", { class: "dash", text: "–" }),
    el("span", { class: "rec" + (bCredit > aCredit ? " win" : ""), text: `${bCredit} ${name(rb.slug)}` })));
  card.appendChild(el("p", { class: "note", text: "Margin-weighted judge-preference games (a decisive win counts more than a narrow one). This is the direct head-to-head — the Elo ladder ranks across every opponent and can order two models differently." }));
  for (const v of pairEntry.scenarios) {
    const w = v.overall.winner;
    const isTie = w == null;
    const verdict = isTie ? "tie" : `${name(w)} +${Number(v.overall.margin).toFixed(1)}`;
    const chips = el("div", { class: "crit-chips" });
    for (const c of (v.per_criterion || [])) {
      const cw = c.winner;
      chips.appendChild(el("span", { class: "chip" + (cw == null ? " tie" : ""),
        text: `${c.criterion.replace(/_/g, " ")}: ${cw == null ? "tie" : name(cw) + " +" + Number(c.margin).toFixed(1)}` }));
    }
    card.appendChild(el("div", { class: "verdict-row" },
      el("span", { class: "scn", text: v.scenario_id }),
      el("span", { class: "vv" + (isTie ? " tie" : ""), text: verdict }),
      chips));
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

  const mkSelect = (def) => {
    const s = el("select", { class: "pick" });
    models.forEach((m, i) => s.appendChild(el("option", { value: m.slug, selected: (m.slug === def) ? "selected" : null }, `${m.display_name} · ${m.slug}`)));
    return s;
  };
  // default to the two strongest ranked models — the most informative first view
  const ranked = [...models].sort((a, b) => (b.normalized_elo ?? -Infinity) - (a.normalized_elo ?? -Infinity));
  const selA = mkSelect(ranked[0].slug);
  const selB = mkSelect((ranked[1] || ranked[0]).slug);
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

    const headline = el("div", { class: "card row-in" }, el("h3", { text: "Headline metrics" }),
      el("p", { class: "sub" }, el("b", { text: ra.display_name }), " (left) vs ", el("b", { text: rb.display_name }), " (right) — ember marks the stronger value (Elo shows no ember when the two 95% intervals overlap)."));
    headline.appendChild(cmpEloRow(ra, rb));
    headline.appendChild(cmpMetricRow("EQ composite", ra.eq_score, rb.eq_score, fmt.n1, true));
    headline.appendChild(cmpMetricRow("Humanlike", ra.humanlike_score, rb.humanlike_score, fmt.n1, true));
    headline.appendChild(cmpMetricRow("Brevity", ra.voice_composite, rb.voice_composite, fmt.n1, true));
    headline.appendChild(cmpMetricRow("TTFT 2k (ms, lower better)", ra.ttft_2k_ms, rb.ttft_2k_ms, fmt.n1, false));
    headline.appendChild(cmpMetricRow("words/s 2k", ra.tps_2k, rb.tps_2k, fmt.n1, true));

    // key must match Python's f"{lo}|{hi}" from sorted((a,b)); JS default string sort and
    // Python's codepoint sort agree for the project's ASCII slug convention.
    const pairKey = [sa, sb].sort().join("|");
    const nodes = [headline, pairwiseVerdictCard(pairwise[pairKey], ra, rb, bySlug)];

    // per-criterion side by side
    if (da && db) {
      const mapB = Object.fromEntries((db.criteria || []).map((c) => [c.criterion, c.mean]));
      const critCmp = el("div", { class: "card", style: "margin-top:22px" }, el("h3", { text: "Rubric criteria" }),
        el("p", { class: "sub", text: "Mean 0–20 per criterion, side by side." }));
      for (const c of (da.criteria || [])) {
        critCmp.appendChild(cmpMetricRow(c.criterion.replace(/_/g, " "), c.mean, mapB[c.criterion], fmt.n1, true));
      }
      nodes.push(critCmp);

      // shared-scenario transcript pair
      const aByScn = Object.fromEntries((da.sample_transcripts || []).map((t) => [t.scenario_id, t]));
      const shared = (db.sample_transcripts || []).map((t) => t.scenario_id).find((id) => aByScn[id]);
      if (shared) {
        const ta = aByScn[shared], tb = (db.sample_transcripts || []).find((t) => t.scenario_id === shared);
        const side = (t) => {
          const turns = el("div", { class: "sc-turns" });
          for (const turn of (t.turns || []))
            turns.appendChild(el("div", { class: "turn " + (turn.role === "assistant" ? "assistant" : "user") },
              el("span", { class: "who", text: turn.role || "?" }), el("div", { class: "say", text: turn.content || "" })));
          return turns;
        };
        nodes.push(el("div", { class: "section-head", style: "margin-top:32px" }, el("span", { class: "idx", text: "//" }),
          el("h2", { text: "Same scenario, side by side" }), el("span", { class: "note", text: shared })));
        nodes.push(el("div", { class: "cmp-grid scenario-cmp" },
          el("div", { class: "card" }, el("h3", { text: ra.display_name }), side(ta)),
          el("div", { class: "card" }, el("h3", { text: rb.display_name }), side(tb))));
      }
    }
    out.replaceChildren(...nodes);
  }
  selA.addEventListener("change", render);
  selB.addEventListener("change", render);
  render();
}

/* ------------------------------ router ---------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.getAttribute("data-page");
  if (page === "leaderboard") initLeaderboard();
  else if (page === "model") initModel();
  else if (page === "methodology") initMethodology();
  else if (page === "compare") initCompare();
});
