# Imprynt Omen RTX 5090 ASR deployment smoke — 2026-08-10

Status: **measured synthetic smoke; not eligible for production promotion**

Host: `imprynt-omen` · NVIDIA GeForce RTX 5090 32 GB · driver 595.84

This run answers one question: can the selected ASR stacks load and produce useful output
on the Omen using documented settings? It does not select Imprynt's ASR. All inputs were
MOSS-TTS-Realtime renders with known text, not owner speech captured through Imprynt's
physical microphone and transport.

## Deployed arms

| System | Lane | Executed path | Standalone peak VRAM | Raw smoke WER | Silence |
|---|---|---|---:|---:|---:|
| Qwen3-ASR 1.7B | realtime candidate | official Transformers smoke; vLLM required for streaming | 4,039 MiB | 7.17% | hallucinated 1/1 |
| Voxtral Mini 4B Realtime 2602 | realtime candidate | official Transformers smoke; production target is vLLM WebSocket, 480 ms, temp 0 | 8,682 MiB | 7.17% | clean 1/1 |
| Fun-ASR Nano 2512 | realtime candidate | official PyTorch smoke; production target is vLLM streaming at 720 ms chunks | 3,227 MiB | 9.81% | clean 1/1 |
| Nemotron Speech Streaming EN 0.6B | realtime candidate | official whole-file smoke of streaming checkpoint; target is 6 look-ahead tokens | 1,273 MiB | 13.96% | clean 1/1 |
| MOSS-Transcribe-preview-2B | accuracy reference | whole utterance, greedy, Transformers 4.57.3 | 4,768 MiB | 18.87% | hallucinated 1/1 |
| SenseVoiceSmall | feature arm | whole utterance; native language/emotion/event tags | 972 MiB | 16.60%* | hallucinated 1/1 |
| MOSS-Transcribe-Diarize 0.9B | feature arm | whole utterance; native timestamps/anonymous speakers/events | 1,792 MiB | 8.68% | clean 1/1 |

\* SenseVoice's raw string includes control tags, so its WER is not a fair transcription
score until the tags are parsed out. All WER values above are case- and punctuation-sensitive
`jiwer` smoke values on ten synthetic speech clips, not Open ASR Leaderboard WER and not a
production comparison. Latencies are warm whole-file inference, not streaming latency.

The most useful installation finding was negative: MOSS preview's published inference path
failed under Transformers 5.14.1 with an audio-mask length mismatch. The same pinned model
revision executed successfully in an isolated Transformers 4.57.3 environment. SenseVoice
also defaulted to ModelScope despite locally cached HF weights; explicitly setting `hub="hf"`
fixed it.

## Exact deployed revisions

| System | Hugging Face revision |
|---|---|
| Voxtral Mini 4B Realtime 2602 | `2769294da9567371363522aac9bbcfdd19447add` |
| MOSS-Transcribe-preview-2B | `c98175cb20e48bd9be4e95f6c85f2af18899f780` |
| MOSS-Transcribe-Diarize | `e8681d68e7042738ffca8ac8212bc8fcb1131ab8` |
| Fun-ASR-Nano-2512 | `272c57b82523ada6fd87095e955f8e29100979ab` |
| SenseVoiceSmall | `3847d57b6bdf2dd8875cb1508d2af43d80a16bf7` |
| Nemotron Speech Streaming EN 0.6B | `ebe59e5a817142986528bbbee5dba8db7b38ed50` |
| Parakeet Unified EN 0.6B | `fe53cd885760c96b6a5f51a0bfd362cb4584a98b` (downloaded, not runnable) |
| Qwen3-ASR 1.7B | `7278e1e70fe206f11671096ffdd38061171dd6e5` |

Source checkouts: Fun-ASR `53a56d80667320b44a7dd779f5bf8c024b6c30a8`;
MOSS-Transcribe-Diarize `0e3d1403fd8f1f1c674e883ece96b9f630794ebe`.
Exact package freezes and the complete production TTS unit were captured on the Omen under
`~/asr-bakeoff/setup-receipts` and
`~/asr-bakeoff/results/current/deployment-receipt.json`.

## Morning promotion run

The same physical owner-microphone recording must be sent to every arm. It needs ordinary
conversation, repairs, jokes, names, numbers, fast speech, quiet speech, a noise gap, a
silence trial, and a second speaker. Keep these lanes separate:

1. True streaming: first partial, finalization delay, partial revisions, longest wrong-lived
   partial, WER/entity accuracy, silence hallucination, RTF, VRAM and power.
2. Feature recognition: emotion/event precision and recall, diarization DER/cpWER, and speaker
   confusion. Do not average these with ASR WER.
3. Named speaker verification: enroll a consented Brent reference and score false accepts and
   false rejects with TitaNet-Large or WeSpeaker. Anonymous diarization labels are not identity.
4. Co-residency: repeat the best two true-streaming arms while production MOSS TTS holds its
   normal 12.7 GB. Record tail latency for both ASR and TTS and reject any OOM or interference.

Recommended operating points for the first physical run:

- Voxtral: vLLM Realtime WebSocket, 480 ms and 960 ms, temperature 0.
- Qwen3-ASR: official `qwen-asr` vLLM stateful streaming path.
- Fun-ASR Nano: `FunASRNanoStreamingVLLM`, 720 ms chunks.
- Nemotron: Transformers/NeMo true chunk generator with 6 look-ahead tokens.
- SenseVoice: native emotion/event tags plus a separately scored CAM++ speaker pipeline.
- MOSS Transcribe Diarize: offline feature reference, not a realtime contender.

Parakeet Unified weights are present, but its NeMo installation resolved an obsolete
`llvmlite` constraint that rejects Python 3.12. It remains **downloaded, not runnable** and
must not appear as measured until moved to a compatible NeMo container/environment.
