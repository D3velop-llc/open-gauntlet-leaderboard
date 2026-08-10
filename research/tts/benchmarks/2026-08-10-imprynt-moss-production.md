# MOSS-TTS-Realtime production profile — Imprynt RTX 5090

Status: deployed candidate. The service and controller adapter are implemented and
machine-verified. Promotion to Imprynt's default spoken mouth still requires an owner-listening
sitting through the physical Jabra path; this receipt does not substitute lab PCM for that gate.

## Selected recipe

| Component | Exact setting |
|---|---|
| Host | `imprynt-omen`, NVIDIA GeForce RTX 5090, 32,607 MiB |
| Upstream source | OpenMOSS `58b20a0d5fcc6766658d50967a90a9d890009a46` |
| Model | `OpenMOSS-Team/MOSS-TTS-Realtime` at `75682787d8e2fcc73faca37ba2931453ca9c4022` |
| Codec | `OpenMOSS-Team/MOSS-Audio-Tokenizer` at `3cd226ba2947efa357ef453bcad111b6eafba782` |
| Runtime | Python 3.12.13, PyTorch 2.9.1+cu128, Transformers 5.0.0 |
| Precision | talker BF16; codec FP32 |
| Attention | PyTorch SDPA |
| Compilation | local transformer `torch.compile` enabled; startup warm-up required |
| Streaming | 6 decode frames, 0 overlap frames, 0.96 s codec chunk, 0 s buffer threshold |
| Sampling | temperature 0.8, top-p 0.6, top-k 30, repetition penalty 1.1/window 50, seed 42 |
| Voice | consented Brent reference, 28.35 s, 24 kHz mono |
| Service | `moss-tts-realtime.service`, port 8083, `Restart=on-failure` |
| Imprynt path | one MOSS turn per response; exact controller clauses pushed incrementally |

The wrapper changes no model math. It makes the recipe explicit, loads reference audio through
SoundFile, exposes its executed config, and adds a cancellation endpoint that acknowledges only
after the generation worker settles. The SoundFile substitution is required on this host:
unchanged upstream returned HTTP 200 with zero PCM because its `torchaudio.load` path reached a
TorchCodec native-library failure. The benchmark rejects empty PCM so this cannot pass silently.

## Final same-harness measurements

Each condition had two unrecorded warm-ups and five measured incremental runs. TTFA is measured
from the first accepted text push to the first PCM bytes at a real HTTP client. RTF is full
synthesis wall time divided by output audio duration. It is not a device-onset measurement.

| Connected-text condition | n | TTFA p50 | TTFA p95 | RTF p50 | Peak VRAM | Peak power |
|---|---:|---:|---:|---:|---:|---:|
| Short response | 5 | 69.58 ms | 81.31 ms | 0.328 | 13,940 MiB | 263.91 W |
| Emotional conversation, 4 clauses | 5 | 215.45 ms | 216.04 ms | 0.292 | 14,234 MiB | 273.44 W |
| Connected humorous story, 4 clauses | 5 | 126.91 ms | 128.02 ms | 0.289 | 14,394 MiB | 272.10 W |

All 15 WAVs had zero clipped or non-finite samples. With seed 42, every repeat within a condition
was bit-identical. This is valuable for receipt replay, but the earlier listening result remains
the quality evidence: MOSS won the human-conversation round at 4.10/5, including a 5/5 stateful
best-native arc.

Cancellation was exercised five times after first PCM. All five backend workers settled; server
settlement was 6.903 ms p50 and 7.566 ms maximum, with client round trips below 10 ms. A full
three-condition synthesis run immediately afterward passed, so cancellation did not poison the
next turn.

## Arms rejected

| Arm | Finding | Decision |
|---|---|---|
| SDPA, compile, 3 frames / 0.24 s | Similar onset; RTF 0.379 / 0.346 / 0.343 | Reject: 18–22% slower than the six-frame arm without an onset win |
| SDPA, eager, 6 frames / 0.96 s | RTF 0.561 / 0.521 / 0.520; short p95 TTFA 1.794 s | Reject: materially slower and worse tail |
| FlashAttention 2.8.3.post1 | no matching cu128 + torch 2.9 + CPython 3.12 wheel; source build rejected CUDA 13.2 toolkit vs PyTorch cu128 | Reject: do not add a second CUDA toolkit for an unmeasured benefit |
| Unchanged upstream FastAPI | HTTP success but zero PCM on the TorchCodec prompt-loader path | Reject on this host; SoundFile loader is required and receipt-visible |
| Generic vLLM-Omni route | separate Imprynt transport proof found response buffering until close | Keep as a future concurrency arm, not the byte-exact incremental production path |

The first unseen shapes after a fresh compile cache took roughly 25 seconds to compile. The
systemd unit therefore runs three discarded real generations before becoming active. The
Imprynt provider also performs a discarded real-generation preflight and repeats it after 60
seconds idle.

## Why response-scoped clause streaming

Imprynt still authorizes speech at clause boundaries, preserving cancellation and revision
points. MOSS receives those exact strings inside one persistent synthesis turn, allowing its
native state to condition later clauses on earlier audio. No emotion tag or text rewrite is
inserted. Since MOSS exposes no trustworthy text/audio alignment, no clause text enters canon
until the full response audio is device-confirmed.

This choice is consistent with the governed literature snapshot. MOSS-Voice (arXiv:2603.06444,
pp. 1 and 4) reports that too little streaming text context damages prosody and intelligibility,
while unbounded context can collapse; its chunk ablation stabilizes once moderate context is
available. That supports a connected response with bounded controller clauses, not independent
per-clause generations or arbitrary character deltas. It remains paper evidence, not a substitute
for the deployed measurements above.

## Reproduction artifacts

- Final manifest: `2026-08-10-moss-production-manifest.json`
- Per-run measurements: `2026-08-10-moss-production-measurements.jsonl`
- Cancellation runs: `2026-08-10-moss-production-cancellation.json`
- Live Imprynt LAN/provider probe: `2026-08-10-moss-imprynt-transport.json`
- Service wrapper and harness: `tools/tts_bakeoff/moss_production_server.py` and
  `tools/tts_bakeoff/benchmark_moss_service.py`
- Persistent unit: `tools/tts_bakeoff/systemd/moss-tts-realtime.service`

## Remaining promotion gate

Run one current Imprynt sitting on the physical Jabra and retain the receipt. It must prove exact
brain-response bytes equal submitted MOSS text, PCM reaches the device, interruption produces a
settled cancellation fact, no audio follows cancellation, and the owner prefers the resulting
voice. Until that sitting passes, the accurate label is **deployed production candidate**, not
production winner.
