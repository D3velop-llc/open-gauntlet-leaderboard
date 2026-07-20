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
  usd: (v) => (v == null ? "—" : "$" + Number(v).toFixed(4)),
  pct: (v) => (v == null ? "—" : (Number(v) * 100).toFixed(0) + "%"),
  pct1: (v) => (v == null ? "—" : (Number(v) * 100).toFixed(1) + "%"),
  ppDelta: (v) => (v == null ? "—" : (Number(v) < 0 ? "" : "+") + (Number(v) * 100).toFixed(1) + "pp"),
  eloCI: (row) => {
    if (row.normalized_elo == null) return "—";
    const base = Math.round(Number(row.normalized_elo));
    if (row.elo_ci_low == null || row.elo_ci_high == null) return String(base);
    return `${base} (${Math.round(Number(row.elo_ci_low))}–${Math.round(Number(row.elo_ci_high))})`;
  },
  params: (row) => {
    if (row.params_total_b == null) return "—";
    const t = row.params_total_b;
    if (row.params_active_b != null && row.params_active_b !== t) return `${t}B / ${row.params_active_b}B`;
    return `${t}B`;
  },
};

async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

function fail(mount, msg) {
  mount.replaceChildren(el("div", { class: "state err" }, msg));
}

/* ---- thermal ramp: cool slate (low) → ember (high) ---------------------- */
const H0 = [32, 38, 47], H1 = [122, 79, 38], H2 = [242, 166, 90];
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function warmth(t) {
  t = Math.max(0, Math.min(1, t));
  const [a, b, u] = t < 0.5 ? [H0, H1, t / 0.5] : [H1, H2, (t - 0.5) / 0.5];
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}
function heatText(rgb) {
  const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  return lum > 150 ? "#17110a" : "#f3f1ea";
}

/* ============================ LEADERBOARD ================================= */
const ABILITY = new Set(["normalized_elo", "win_rate", "eq_score", "humanlike_score", "voice_composite"]);
const COLS = [
  { key: "rank", label: "#", css: "txt" },
  { key: "model", label: "Model", css: "txt", type: "text" },
  { key: "params", label: "Params", type: "text" },
  { key: "quant", label: "Quant", type: "text" },
  { key: "backend", label: "Backend", type: "text" },
  { key: "normalized_elo", label: "Elo (95% CI)", type: "num", heat: true },
  { key: "win_rate", label: "Win rate", type: "num", heat: true },
  { key: "n_comparisons", label: "Comparisons", type: "num",
    title: "Weighted Bradley-Terry paired comparisons behind this Elo — one per unordered opponent × scenario × criterion, with both A/B orderings averaged. Not distinct matches played (each conversation contributes ~9 per-criterion comparisons), and not the Win-rate denominator." },
  { key: "eq_score", label: "EQ", type: "num", heat: true },
  { key: "humanlike_score", label: "Humanlike", type: "num", heat: true },
  { key: "voice_composite", label: "Voice", type: "num", heat: true },
  { key: "ttft_2k_ms", label: "TTFT 2k (ms)", type: "num" },
  { key: "tps_2k", label: "words/s 2k", type: "num" },
  { key: "judging_cost_usd", label: "Judge $", type: "num" },
];

function columnRange(models, key) {
  const vals = models.map((m) => m[key]).filter((v) => v != null).map(Number);
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

function renderLeaderboard(models) {
  const ranges = {};
  for (const c of COLS) if (c.heat) ranges[c.key] = columnRange(models, c.key);

  const modelPage = (window.OG && window.OG.modelPage) || "model.html";
  const thead = el("thead");
  const htr = el("tr");
  for (const c of COLS) {
    const th = el("th", { class: c.css === "txt" ? "txt" : "", "data-key": c.key, title: c.title },
      c.label, el("span", { class: "arrow", text: "" }));
    htr.appendChild(th);
  }
  thead.appendChild(htr);

  const tbody = el("tbody");
  function cell(c, row) {
    if (c.key === "rank") return el("td", { class: "rank" }, "");           // filled after sort
    if (c.key === "model") {
      return el("td", { class: "model" },
        el("a", { href: `${modelPage}?slug=${encodeURIComponent(row.slug)}`, text: row.display_name }),
        el("span", { class: "slug", text: row.slug }),
        el("span", { class: "cfg", text: [row.quant, row.backend].filter(Boolean).join(" · ") || "—" }));
    }
    if (c.key === "params") return el("td", { class: "dim" }, fmt.params(row));
    if (c.key === "quant") return el("td", {}, row.quant ? el("span", { class: "chip", text: row.quant }) : "—");
    if (c.key === "backend") return el("td", { class: "dim" }, row.backend || "—");

    const v = row[c.key];
    let disp;
    if (c.key === "ttft_2k_ms") disp = fmt.n1(v);
    else if (c.key === "judging_cost_usd") disp = fmt.usd(v);
    else if (c.key === "normalized_elo") disp = fmt.eloCI(row);
    else if (c.key === "win_rate") disp = fmt.pct(v);
    else if (c.key === "n_comparisons") disp = fmt.int(v);   // comparison count: n=0 reads as unranked
    else disp = fmt.n1(v);

    const td = el("td", {}, disp);
    if (c.heat) {
      const r = ranges[c.key];
      if (v == null || !r) { td.className = "heat empty"; }
      else {
        td.className = "heat";
        const t = r.max === r.min ? 0.62 : (Number(v) - r.min) / (r.max - r.min);
        const rgb = warmth(t);
        td.style.background = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        td.style.color = heatText(rgb);
      }
    } else if (c.key === "judging_cost_usd") td.className = "dim";
    return td;
  }

  function paint(rows) {
    tbody.replaceChildren();
    rows.forEach((row, i) => {
      const tr = el("tr");
      for (const c of COLS) tr.appendChild(cell(c, row));
      tr.firstChild.textContent = String(i + 1);   // rank = position in current order
      tbody.appendChild(tr);
    });
  }

  let sortKey = "normalized_elo", sortDir = -1;   // default: strongest on top
  function applySort() {
    const rows = [...models].sort((a, b) => {
      let x = a[sortKey], y = b[sortKey];
      if (sortKey === "model") { x = a.display_name; y = b.display_name; }
      if (sortKey === "params") { x = a.params_total_b; y = b.params_total_b; }
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
      else { sortKey = key; sortDir = (key === "model" || key === "ttft_2k_ms" || key === "judging_cost_usd") ? 1 : -1; }
      applySort();
    });
  });

  const table = el("table", { class: "lb" }, thead, tbody);
  applySort();
  return el("div", { class: "table-scroll row-in" }, table);
}

async function initLeaderboard() {
  const mount = $("#leaderboard");
  try {
    const data = await getJSON("data/leaderboard.json");
    const jg = data.judge_generation || {};
    const nameEls = document.querySelectorAll("[data-judge-model]");
    nameEls.forEach((n) => { n.textContent = jg.model || "—"; });
    const pw = document.querySelector("[data-pairwise-hash]");
    if (pw) pw.textContent = jg.pairwise_prompt_hash || "—";
    const rb = document.querySelector("[data-rubric-hash]");
    if (rb) rb.textContent = jg.rubric_prompt_hash || "—";
    const gen = document.querySelector("[data-generated-at]");
    if (gen && data.generated_at) gen.textContent = new Date(data.generated_at).toISOString().replace("T", " ").slice(0, 16) + " UTC";
    if (!data.models || !data.models.length) { fail(mount, "No models have completed a run yet."); return; }
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
  const grid = "#2c2c2a", muted = "#75808f";
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
          backgroundColor: "#1b212c", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1,
          titleColor: "#f3f1ea", bodyColor: "#a6afbd", padding: 10,
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
    perfChart(cTtft, curve, "ttft_ms_median", "#4aa8d8", "ms");
    perfChart(cTps, curve, "decode_tps_median", "#f2a65a", "words/s");

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
  return el("div", { class: "card", style: "margin-top:22px" },
    el("h3", { text: "Judge cross-check" }),
    el("p", { class: "sub", text: `Candidate judges replayed the same blinded pairs, with the same prompt, that ${jc.reference_judge} scored — the table shows how closely each reproduced its verdicts.` }),
    el("div", { class: "table-scroll" }, table));
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
    const scoring = el("div", { class: "body" },
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
      el("div", { class: "grid-2 row-in" },
        el("div", { class: "card" }, el("h3", { text: "Rubric criteria" }),
          el("p", { class: "sub", text: "Nine 0–20 axes — each scored once per conversation. The ember-marked ones feed the EQ composite." }), critList),
        el("div", { class: "card" }, el("h3", { text: "Bias mitigations" }),
          el("p", { class: "sub", text: "How the judge pass guards against ordering and length bias — plus how much each result is replicated." }), bmList,
          el("p", { class: "note", text: "The pairwise Elo ladder (the headline ranking) uses a single iteration — iteration 0 — per model per scenario, so the extra iterations add no replication to the ranking; they only reduce sampling noise in the rubric aggregates (EQ / Humanlike), which score every iteration." }))),
      el("div", { class: "card", style: "margin-top:22px" }, el("h3", { text: `How the Elo ladder is scored — ${sm.name || "Bradley-Terry"}` }),
        el("p", { class: "sub", text: "Weighted head-to-head comparisons, mean-anchored to 1500, with bootstrap confidence intervals." }), scoring),
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
    const verdict = w == null ? "tie" : `${name(w)} +${Number(v.overall.margin).toFixed(1)}`;
    const chips = el("div", { class: "crit-chips" });
    for (const c of (v.per_criterion || [])) {
      const cw = c.winner;
      chips.appendChild(el("span", { class: "chip" + (cw == null ? " tie" : ""),
        text: `${c.criterion.replace(/_/g, " ")}: ${cw == null ? "tie" : name(cw) + " +" + Number(c.margin).toFixed(1)}` }));
    }
    card.appendChild(el("div", { class: "verdict-row" },
      el("div", { class: "vh" }, el("span", { class: "scn", text: v.scenario_id }), el("span", { class: "vv", text: verdict })),
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
  const selA = mkSelect(models[0].slug);
  const selB = mkSelect(models[Math.min(1, models.length - 1)].slug);
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
    headline.appendChild(cmpMetricRow("Voice", ra.voice_composite, rb.voice_composite, fmt.n1, true));
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
