# OpenGauntlet — local AI, measured

[OpenGauntlet](https://opengauntlet.com/) is a public benchmark and research
site for people building locally hosted conversational and voice AI. It grew
out of roughly a year of research and testing while building
[Imprynt](https://imprynt.ai/).

The project answers three practical questions:

- **Words:** Which local LLM feels the most human to talk to?
- **Voices:** Which text-to-speech system fits a particular product, license,
  language, and hardware target?
- **Listening:** Which speech-to-text system fits the required accuracy,
  latency, deployment model, and platform?

## Directly measured LLM results

The conversational leaderboard currently contains 32 locally hostable LLMs.
Thirty-one include direct performance measurements from an
**NVIDIA DGX Spark (GB10 Grace-Blackwell, aarch64, 128 GB unified memory)**,
with additional measurements from RTX 5090 and RTX 5080 hardware where
available.

Each model is evaluated across 25 multi-turn, emotionally demanding scenarios
for conversational realism, emotional reasoning, persona consistency, memory,
boundaries, and suitability for spoken interaction. The published results
include:

- Bradley-Terry Elo rankings and bootstrap confidence intervals
- rubric scores and head-to-head win rates
- time to first token and decode speed at multiple context sizes
- hardware, model, quantization, backend, judge, and prompt provenance
- full methodology and reproducibility receipts

[Explore the leaderboard](https://opengauntlet.com/) ·
[Read the methodology](https://opengauntlet.com/methodology.html)

## TTS and STT research catalogs

OpenGauntlet also publishes the research catalogs assembled while evaluating
voice stacks:

- [168 text-to-speech systems](https://opengauntlet.com/tts.html)
- [106 speech-to-text systems](https://opengauntlet.com/asr.html)

These directories compare local and hosted systems, licenses, hardware
requirements, languages, capabilities, lifecycle status, source material, and
published benchmark results where available.

**Important:** the LLM leaderboard contains direct OpenGauntlet benchmark
results. The TTS and STT directories are sourced research catalogs; they do
not claim that all 274 speech systems were benchmarked by OpenGauntlet.

## About this repository

This repository contains the generated static site deployed at
[opengauntlet.com](https://opengauntlet.com/). The benchmark harness and its
source database remain private, while the published site exposes the results,
methodology, provenance, and research data needed to understand each entry.

Found a missing model or incorrect entry?
[Request a model](https://github.com/D3velop-llc/open-gauntlet-leaderboard/issues/new?title=Model%20request%3A%20)
or
[report a correction](https://github.com/D3velop-llc/open-gauntlet-leaderboard/issues/new?title=Correction%3A%20).

Research shared publicly by [D3velop](https://d3velop.com/).
