"use strict";
// Polls /api/state (~1.5s) and tails /api/events from a cursor. Polling is deliberate:
// phases last tens of minutes, so WebSockets would add a dependency to buy latency that
// nothing here can perceive.
const $ = (id) => document.getElementById(id);
let cursor = 0;
let built = false;

async function api(path, body) {
  const opt = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {};
  const r = await fetch(path, opt);
  return r.json();
}

function chip(labelText, attrs) {
  const l = document.createElement("label");
  l.className = "chip";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  Object.assign(cb, attrs);
  l.append(cb, document.createTextNode(" " + labelText));
  return l;
}

function buildPickers(state) {
  if (built) return;              // build once; rebuilding would clear the user's selection
  for (const m of state.models) {
    $("model-list").appendChild(chip(m.slug, { value: m.slug }));
  }
  for (const p of state.phases) {
    const c = chip(p, { checked: true });
    c.querySelector("input").dataset.phase = p;
    $("phase-list").appendChild(c);
  }
  built = true;
}

function renderRunning(state) {
  const r = state.running;
  $("running-body").textContent = r
    ? `${r.slug} — job #${r.id}, started ${r.started_at ? r.started_at.slice(11, 19) : "?"}`
    : "nothing running";
  $("stop-graceful").disabled = !r;
  $("stop-force").disabled = !r;
  const w = $("worker");
  w.textContent = `worker: ${state.worker_running ? "running" : "idle"}`;
  w.className = "pill " + (state.worker_running ? "on" : "off");
  if (state.stop_requested) {
    $("running-body").textContent += `  (${state.stop_requested} stop requested)`;
  }
}

// Everything below builds DOM nodes and sets textContent. Never innerHTML: job errors carry
// judge-API and exception strings, i.e. externally-derived text, and interpolating that into
// markup is an XSS vector even on a single-user localhost tool. Cheaper to not have the class.
function td(text, className) {
  const cell = document.createElement("td");
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function renderQueue(state) {
  const tb = $("queue-table").querySelector("tbody");
  tb.replaceChildren();
  const rows = state.jobs.slice().reverse();
  $("queue-empty").style.display = rows.length ? "none" : "";
  for (const j of rows) {
    const tr = document.createElement("tr");
    tr.append(
      td(`#${j.id}`),
      td(j.slug),
      td(j.status, `st-${j.status}`),
      td(j.phases.join(" → "), "dim"),
      td(j.error ? j.error.slice(0, 70) : "", "lvl-error"),
    );
    const action = document.createElement("td");
    if (j.status === "queued") {
      const b = document.createElement("button");
      b.textContent = "cancel";
      b.addEventListener("click", async () => {
        await api("/api/cancel", { job_id: j.id });
        tick();
      });
      action.appendChild(b);
    }
    tr.appendChild(action);
    tb.appendChild(tr);
  }
}

async function tailLog() {
  const { events } = await api(`/api/events?since=${cursor}`);
  if (!events || !events.length) return;
  const body = $("log-body");
  // Don't yank the view if the user has scrolled back to read something.
  const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 24;
  for (const e of events) {
    cursor = Math.max(cursor, e.id);
    const line = document.createElement("div");
    line.className = "lvl-" + e.level;
    line.textContent = `${e.ts.slice(11, 19)}  ${(e.phase || "").padEnd(8)} ${e.message}`;
    body.appendChild(line);
  }
  if (atBottom) body.scrollTop = body.scrollHeight;
}

async function renderDoctor() {
  const { findings } = await api("/api/doctor");
  const bad = (findings || []).filter((f) => f.level !== "OK");
  const body = $("doctor-body");
  body.replaceChildren();
  if (!bad.length) {
    const ok = document.createElement("span");
    ok.className = "st-done";
    ok.textContent = "all checks pass";
    body.appendChild(ok);
  }
  for (const f of bad) {
    const line = document.createElement("div");
    line.className = "lvl-" + f.level.toLowerCase();
    line.textContent = `${f.level} — ${f.check}: ${f.detail}`;
    body.appendChild(line);
  }
  $("publish-btn").disabled = (findings || []).some((f) => f.level === "FAIL");
}

async function tick() {
  const state = await api("/api/state");
  buildPickers(state);
  renderRunning(state);
  renderQueue(state);
  await tailLog();
}

$("enqueue").addEventListener("click", async () => {
  const slugs = [...document.querySelectorAll("#model-list input:checked")].map((i) => i.value);
  const phases = [...document.querySelectorAll("#phase-list input:checked")]
    .map((i) => i.dataset.phase);
  const out = await api("/api/enqueue", { slugs, phases });
  $("enqueue-hint").textContent = out.error ? out.error : `queued ${out.enqueued}`;
  document.querySelectorAll("#model-list input:checked").forEach((i) => { i.checked = false; });
  tick();
});

$("stop-graceful").addEventListener("click", () =>
  api("/api/stop", { mode: "graceful" }).then(tick));

$("stop-force").addEventListener("click", () => {
  if (confirm("Force stop now?\n\nThe current model keeps whatever judging was already paid "
            + "for and will publish as provisional until its coverage is complete.")) {
    api("/api/stop", { mode: "force" }).then(tick);
  }
});

$("publish-btn").addEventListener("click", async () => {
  const out = await api("/api/publish", { confirm: $("publish-confirm").value.trim() });
  $("doctor-body").textContent = out.published ? "Published." : `Not published — ${out.reason}`;
  if (out.published) $("publish-confirm").value = "";
  setTimeout(renderDoctor, 1500);
});

tick();
renderDoctor();
setInterval(tick, 1500);
setInterval(renderDoctor, 30000);
