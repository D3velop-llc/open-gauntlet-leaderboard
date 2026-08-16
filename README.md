# OpenGauntlet — local AI, measured and mapped

[OpenGauntlet](https://opengauntlet.com/) started as a benchmark for one
question — which local LLM feels the most human to talk to — built out of
roughly a year of research and testing while building [Imprynt](https://imprynt.ai/).
It has since grown into a full directory for local and hosted conversational
AI: one directly measured LLM leaderboard, smaller disclosed ASR and TTS lab
experiments, plus nine sourced survey catalogs covering every other piece of
software a real voice or chat product needs — **more than 500 measured
configurations and surveyed systems.**

## Directly measured: the leaderboard and local labs

Words is the only section run through OpenGauntlet's full conversational judge
pipeline. It currently
covers **37 locally hostable LLMs**, 31 with direct performance
measurements from an **NVIDIA DGX Spark (GB10 Grace-Blackwell, aarch64,
128 GB unified memory)**, plus additional measurements from RTX 5090 and
RTX 5080 hardware where available.

Each model runs 30 multi-turn, emotionally demanding scenarios judged for
conversational realism, emotional reasoning, persona consistency, memory,
boundaries, and suitability for spoken interaction. Published results
include:

- Bradley-Terry Elo rankings and bootstrap confidence intervals
- rubric scores and head-to-head win rates
- time to first token and decode speed at multiple context sizes
- hardware, model, quantization, backend, judge, and prompt provenance
- full methodology and reproducibility receipts

[Explore the leaderboard](https://opengauntlet.com/) ·
[Read the methodology](https://opengauntlet.com/methodology.html) ·
[Compare two models head to head](https://opengauntlet.com/compare.html)

Listening and Voices also publish smaller, explicitly scoped local experiments
on separate Measured pages. Their disclosed recordings, listeners, hardware,
methods, limitations, and receipts are kept separate from the much larger
Surveyed market catalogs.

## Sourced survey catalogs: everything around the model

A real voice or chat product is many pieces of software, and the model is
only one of them. These nine catalogs cover the rest — every system
checked against a primary source (docs, source repo, or a live-fetched
claim), with licence terms, hardware floors, and the catch a buyer would
otherwise find out too late:

| Section | What it answers | Systems |
|---|---|---|
| [Listening](https://opengauntlet.com/asr-survey.html) | What it hears — speech-to-text accuracy, latency, languages, licensing, deployment | 106 |
| [Turns](https://opengauntlet.com/turns.html) | Whose turn it is — VAD, semantic turn detectors, and endpointing systems | 35 |
| [Voices](https://opengauntlet.com/tts-survey.html) | How it sounds — text-to-speech quality, cloning, languages, pricing, licensing | 168 |
| [Runtimes](https://opengauntlet.com/runtimes.html) | How it runs — LLM inference engines and serving runtimes, incl. a first-party vLLM vs. SGLang benchmark | 34 |
| [Memory](https://opengauntlet.com/memory.html) | What it remembers — vector databases, agent-memory frameworks, graph memory | 25 |
| [Hardware Reference](https://opengauntlet.com/hardware.html) | What fits where — VRAM budgets and real memory bandwidth across GPUs | 12 |
| [Quantization](https://opengauntlet.com/quantization.html) | How models get compressed — the tools and algorithms, not the serving side | 23 |
| [Orchestrators](https://opengauntlet.com/orchestrators.html) | Wiring it together — voice-agent orchestration frameworks and hosted platforms | 29 |
| [Utilities](https://opengauntlet.com/utilities.html) | The parts around the edges — speaker verification, wake word, speech enhancement | 34 |

**Important:** only the LLM leaderboard contains direct conversational-judge
results. The Listening and Voices lab results are smaller local experiments,
not market-wide rankings. Every Surveyed catalog above is a **sourced research
survey, not a benchmark** — each page states this on load, and no claim ships
without a source. They do not claim that all 466 cataloged systems were run
through OpenGauntlet's judge pipeline; they exist so a builder can compare
licences, hardware requirements, and capabilities in one place instead of
across two hundred vendor pages.

## About this repository

This repository contains the generated static site deployed at
[opengauntlet.com](https://opengauntlet.com/). The benchmark harness and its
source database remain private, while the published site exposes the
results, methodology, provenance, and research data needed to understand
each entry.

Found a missing model or an incorrect entry?
[Request a model](https://github.com/D3velop-llc/open-gauntlet-leaderboard/issues/new?title=Model%20request%3A%20)
or
[report a correction](https://github.com/D3velop-llc/open-gauntlet-leaderboard/issues/new?title=Correction%3A%20).

Research shared publicly by [D3velop](https://d3velop.com/).

## Publishing and SEO validation

The private benchmark generator remains the source of the result data and
base static pages. After refreshing those files, run the public post-build
step before publishing:

```powershell
node scripts/seo-build.mjs
node scripts/validate-seo.mjs
```

The post-build is idempotent. It creates canonical static model-detail URLs,
paired Measured and Surveyed Listening/Voices pages, the shared evidence-mode
navigation, focused utility landing pages, page-specific metadata and structured
data, the trust and data-license pages, and the sitemap. The validator then checks
canonical uniqueness, metadata, headings, JSON-LD, internal links, model-page
coverage, sitemap coverage, and the published dataset licence.
