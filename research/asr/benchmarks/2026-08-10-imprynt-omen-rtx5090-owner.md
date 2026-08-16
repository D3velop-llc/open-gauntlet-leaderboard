# Imprynt Omen RTX 5090 owner-microphone ASR run — 2026-08-10

## Decision

The completed run measured **14 unique systems** and selected **Qwen3-ASR 1.7B** as the
native-streaming accuracy winner on this owner recording. The initial seven-model screen
advanced Qwen, Nemotron Speech Streaming 0.6B, and Voxtral Mini 4B Realtime to a stateful
streaming replay; the owner then approved the corrected reference used for final scoring.
This is a local production-candidate result, not a population leaderboard.

Qwen3-ASR was the reference-free transcript center and preserved difficult names best.
Nemotron was nearly as central while using much less VRAM and inference time, making it the
strongest efficiency challenger. Voxtral was also complete and central, but was about 9.1x
slower than Qwen by median RTF and used almost twice its peak VRAM in this harness.

MOSS-Transcribe-Diarize remains the long-form feature reference. On the full 15:39 file it
identified the correct count of two anonymous speakers across 232 timestamped segments, but
on shorter matched clips it over-segmented two people into three labels on 3 of 7
two-speaker clips. It is not a named-speaker recognizer and is not a realtime contender.

## Physical input and scope

- Host: `imprynt-omen`, NVIDIA GeForce RTX 5090 32 GB
- Microphone: Jabra Speak2 75 Mono, direct USB
- Capture: server-side PipeWire, 48 kHz mono PCM retained; normalized 16 kHz mono PCM used
- Full recording: 939.072 seconds; Scotty and Krista
- Input SHA-256: `a05588ee7d2e41ef1d289321903c833963c99bc8873c2de704a1a7ec1971d0ab`
- Full-file measured level: mean -27.6 dBFS, peak -1.4 dBFS
- Matched corpus: 8 clips, 465 seconds per model, covering scripted numbers/names/repair,
  short turns, long turns, emotional conversation, fast casual speech, and late-session speech
- Outputs: 56/56 expected rows, no OOM or inference crash
- MOSS TTS: stopped and disabled for the entire matched run

Audio inference remained local. SenseVoice contacted Hugging Face for revision metadata while
resolving its already cached model; no recording was uploaded.

## Initial reference-free comparison

At this initial screening stage there was no human-corrected transcript, so **WER, entity
accuracy, DER, and cpWER were not reported**. `peer disagreement` is mean normalized word edit distance to the other six
outputs on the same clips. It measures how central an output is among peers; it is not
accuracy and cannot substitute for WER. `Low coverage` flags outputs below 70% of the peer
median word count and exposes likely truncation/deletion.

| Model | Executed path | Peer disagreement ↓ | Low-coverage clips | RTF p50 ↓ | RTF p95 ↓ | Peak VRAM |
|---|---|---:|---:|---:|---:|---:|
| Qwen3-ASR 1.7B | official Transformers offline smoke | **0.229** | 0 | 0.0220 | 0.0377 | 4,500 MiB |
| Voxtral Mini 4B Realtime 2602 | official Transformers whole-utterance smoke | 0.243 | 0 | 0.1986 | 0.2085 | 8,806 MiB |
| Nemotron Speech Streaming 0.6B | offline smoke for streaming checkpoint | 0.246 | 0 | **0.0059** | 0.0197 | **1,582 MiB** |
| MOSS-Transcribe-Diarize 0.9B | native whole-utterance diarization; 2,048 max tokens; hotwords | 0.252 | 0 | 0.0492 | 0.0680 | 1,929 MiB |
| SenseVoiceSmall | offline; 60 s batch size; VAD merge off | 0.271 | 0 | 0.0009 | **0.0035** | 1,177 MiB |
| MOSS-Transcribe-preview-2B | whole utterance | 0.355 | 3 | 0.0145 | 0.0326 | 5,229 MiB |
| Fun-ASR Nano 2512 | official PyTorch offline smoke | 0.431 | 3 | 0.0202 | 0.0350 | 3,438 MiB |

RTF and VRAM cover inference after model load, not process startup. Lower RTF is faster.

## Transcript and feature findings

- All seven systems preserved the first scripted money amount and account number semantically:
  `$42.75` and `5083`, with formatting differences.
- Qwen and Voxtral were the only systems that clearly recovered both `Silas` and `Asher` in
  the haircut clip. Qwen had complete coverage on every clip and the lowest peer disagreement.
- Nemotron also had complete coverage and closely tracked Qwen/Voxtral at substantially lower
  inference cost. Its current result is not true-streaming evidence despite the checkpoint name.
- Fun-ASR truncated `krista_idea_exchange`, `haircut_story`, and `closing_read_aloud`.
  MOSS Transcribe Preview had low coverage on `early_two_speaker`, `krista_idea_exchange`,
  and `haircut_story`. Neither advances from this operating point.
- SenseVoice returned `<|EMO_UNKNOWN|><|Speech|>` on all eight clips, including the emotional
  exchange. This run therefore provides no evidence that its native emotion/event tags add
  useful discrimination for this production audio.
- MOSS Diarize's full-file output contained 179 S01 segments (432.8 voiced seconds) and 53 S02
  segments (142.8 voiced seconds). The labels are anonymous and were not mapped to Scotty or
  Krista. The correct two-speaker count is encouraging, but no manual speaker timeline exists,
  so DER/cpWER cannot be claimed.

## Production streaming finalist result

The production gate was completed on the same 8 clips and 465 seconds per model. The owner
listened to every clip and approved a corrected consensus transcript. Scoring uses Unicode
NFKC, lowercase text, punctuation-to-space normalization, and retains lexical digit forms.
The reference is owner-adjudicated from model-derived consensus rather than an independent
from-scratch transcription, so small adjudication bias remains possible.

| Model | Micro WER | Macro WER | Word-count ratio | First partial p50 | Finalize p50 | Cadence RTF p50 | Peak VRAM | Failures |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Qwen3-ASR 1.7B | **6.02%** | **6.83%** | 100.8% | **1.032 s** | 91 ms | 1.0017 | 25,262 MiB | 0/8 |
| Voxtral Mini 4B Realtime 2602 | 13.70% | 13.55% | 90.8% | 3.092 s | 177 ms | 1.0029 | 29,894 MiB | 0/8 |
| Nemotron Speech Streaming 0.6B | 17.36% | 18.45% | 89.8% | 3.322 s | **0 ms** | **0.9963** | **2,906 MiB** | 0/8 |

First-partial time is measured from clip start and includes leading silence, so it is not a
speech-onset latency comparison. All arms were fed the saved PCM at wall-clock cadence. Qwen's
measured compute RTF p50 was 0.0747; the WebSocket/generator arms run concurrently with the
cadence clock and therefore do not report a separate compute-only RTF.

Qwen is the final-transcript accuracy winner, with 51 errors over 847 reference words versus
116 for Voxtral and 147 for Nemotron. Its advantage is not sufficient by itself for an
unfiltered production stream: Qwen produced 233 rollback events affecting 641 characters. On
5 of 8 clips its first hypothesis appeared 0.4-0.8 seconds before energy-based speech onset,
usually as `Okay.` and once as `Oh.`, then revised away. Nemotron and Voxtral emitted
append-only deltas and had no transcript revisions. A production Qwen adapter must therefore
VAD-gate output and expose only a tested stable prefix; raw hypotheses must not trigger the
brain or tools.

The original Qwen vLLM setting reserved 80% of GPU memory. A bounded production smoke reduced
`gpu_memory_utilization` to 0.45 and `max_model_len` to 8,192. On the 40-second scripted clip,
peak VRAM fell from 25,262 to 13,978 MiB while transcript output remained byte-identical,
first partial remained 1.026 seconds, finalization improved from 91 to 83 ms, and compute RTF
changed from 0.0760 to 0.0712. This is promising but does not replace an actual simultaneous
MOSS-TTS co-residency run. The same low-memory configuration also reproduced the
byte-identical full transcript on the longest 80-second clip at 13,978 MiB peak, 0.0804
compute RTF, and 98 ms finalization, confirming that the 8,192-token cap covers this corpus.

### Exact native streaming settings

- Qwen3-ASR 1.7B: official `qwen-asr` stateful vLLM helper; English forced; 1.0-second
  chunks; `unfixed_chunk_num=4`; `unfixed_token_num=5`; temperature 0; 32 new tokens;
  production candidate `gpu_memory_utilization=0.45`, `max_model_len=8192`; one source-audio
  chunk warmed before measurement.
- Nemotron Streaming 0.6B: official Transformers cache-aware RNNT generator; BF16;
  6 lookahead tokens; documented 560 ms streaming latency; 9,360 samples per audio chunk.
- Voxtral Mini 4B Realtime 2602: vLLM 0.26 Realtime WebSocket API; model delay 480 ms;
  PCM16 mono 16 kHz sent in 40 ms chunks; temperature 0; PIECEWISE CUDA graphs;
  `max_model_len=32768`; `gpu_memory_utilization=0.85`.

### Decision and remaining promotion gates

- **Accuracy winner:** Qwen3-ASR 1.7B native streaming.
- **Resource fallback:** Nemotron, but its 99 deletions and 89.8% word-count ratio are too
  incomplete for an unconditional default on this conversation set.
- **Voxtral:** not preferred on the Omen operating point; it is less accurate and uses more
  VRAM than Qwen, although its append-only partials are operationally simpler.
- **Production status:** experiment required. Promote the low-memory Qwen arm only after
  the VAD/stable-prefix adapter eliminates pre-speech commits and a separate co-residency run
  proves Qwen plus MOSS-TTS latency, VRAM, interruption handling, and recovery under load.

## Popular-model baseline expansion

The local baseline now contains **14 unique ASR systems**. Seven additional candidates were
selected from the live Hugging Face Open ASR Leaderboard plus the widely deployed Whisper
control, then run through the same eight owner-approved clips. External leaderboard rank was
used for discovery only: its H200 corpus and scores are not mixed with this RTX 5090/Jabra
result.

| Added model | Owner micro WER | RTF p50 | Peak VRAM | Executed path |
|---|---:|---:|---:|---|
| Granite Speech 4.1 2B | **13.93%** | 0.0208 | 4,634 MiB | official Transformers whole utterance |
| Parakeet TDT 0.6B v3 | 14.29% | **0.0045** | **1,459 MiB** | official Transformers pipeline |
| ARK-ASR 3B | 19.13% | 0.0209 | 7,426 MiB | official 28 s windows, 2 s overlap |
| Higgs Audio v3 STT | 24.09% | 0.0294 | 6,422 MiB | official whole utterance |
| Whisper Large v3 Turbo | 24.44% | 0.0145 | 1,687 MiB | native sequential long-form generation |
| Canary-Qwen 2.5B | 24.91% | 0.0230 | 5,182 MiB | official NeMo ASR prompt |
| Hojo-ASR V1 | 42.27% | 0.0275 | 14,479 MiB | official whole utterance |

All seven added arms returned 8/8 rows with no inference failure. This real conversational
recording reverses parts of the external short-form leaderboard order: model-card excellence
did not prevent deletions on long or two-speaker clips. Granite and Parakeet are therefore
the meaningful added local baselines, while Qwen remains the best measured native-streaming
arm at 6.02% WER.

The earlier Parakeet environment failure is repaired: Parakeet TDT v3 ran through its pinned
official Transformers implementation. Fun-ASR also completed all eight original matched
clips, so it is retained at 44.39% WER rather than recorded as a crash; its three severe
coverage failures are a quality failure at that operating point. The unmatched one-row MOSS
full-file diarization artifact is excluded, while its complete eight-row matched output is
used.

### Pinned expansion settings

| Model | Revision | Material settings |
|---|---|---|
| Granite Speech 4.1 2B | `de575db64086f84fdc79da4932d1076e965bc546` | BF16, greedy, 768 tokens, punctuation/capitalization prompt |
| Parakeet TDT 0.6B v3 | `541d1f99c6b0c3cd0b11a95167540bb8edefd82b` | BF16, batch 1, no timestamps |
| ARK-ASR 3B | `1e28271b79edc97635783bea65abc89195a09ed3` | BF16 SDPA, greedy, 28 s windows, 2 s overlap |
| Higgs Audio v3 STT | `2ffd1aa39f5a1266931e405cba12e404a9f994b2` | BF16, eager attention, greedy, 1,024 tokens |
| Whisper Large v3 Turbo | `41f01f3fe87f28c78e2fbf8b568835947dd65ed9` | BF16 SDPA, English, sequential long-form timestamps, previous-token conditioning, documented fallback thresholds |
| Canary-Qwen 2.5B | `b1469e1bba1cfe140205529c79c434ca47180960` | BF16, official ASR prompt, 512 tokens |
| Hojo-ASR V1 | `a22c381896ce5f4b70038982bfb888fe9969ed99` | official package, batch 1, CUDA |

The machine-readable expanded receipt contains per-clip errors, exact decode settings,
wall time, RTF, VRAM, and the lane boundary for all 14 systems.

## Reproduction

The reusable harness is under `tools/asr_bakeoff`. On the Omen, the immutable run directory is:

```text
~/asr-bakeoff/results/owner-20260810-jabra-usb
```

Key artifacts are `matched-manifest.jsonl`, seven original per-model JSONL files,
`accuracy-expansion/` with seven added per-model JSONL files, `moss-diarize-full.jsonl`,
`matched-events.jsonl`, the corrected reference, and the scoring receipts. Regenerate the
reference-free diagnostic with `analyze_consensus.py`; its JSON includes an explicit warning
that peer disagreement is not WER or accuracy. The publishable combined receipt is
`2026-08-10-imprynt-omen-rtx5090-expanded-receipt.json`.
