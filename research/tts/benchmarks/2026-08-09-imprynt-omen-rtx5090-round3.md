# RTX 5090 TTS bake-off — expansion round

Status: performance runs complete; blind owner ratings pending. Three same-Brent arms completed, and two candidates produced explicit scope/runtime failure receipts.

## Fixed comparison contract

- Host: `imprynt-omen`, NVIDIA GeForce RTX 5090.
- Voice: the same Brent WAV and exact transcript used by the earlier Higgs deployment.
- Baseline: the unchanged `statements.jsonl`, two warm-ups and two measured repeats.
- Feature round: two semantic-emotion clips, three best-documented control clips, one whole connected turn, and one four-clause planner condition. Clause audio is concatenated without inserted silence.
- No new model in this round exposes documented persistent prior-audio/request state, so none is labelled stateful.
- Each implementation gets an isolated environment. Checkpoint, source revision, packages, rendered inputs, output hashes, GPU telemetry, RTF and failures are retained.

## Pinned arms and controls

| Arm | Checkpoint revision | Source revision | Best documented control used |
|---|---|---|---|
| Fish Audio S2 Pro | `1de9996b6be38b745688de084d87a5633f714e4e` | `e5e292632cb11e7a27b2b7487f58f612bc101e13` | Official API, reference WAV + transcript, free-form inline emotion tags, temperature `0.8`, top-p `0.8`, repetition penalty `1.1` |
| IndexTTS2 | `740dcaff396282ffb241903d150ac011cd4b1ede` | `90ca4d608209584bad3a5bd5becc0b80c146e60f` | Speaker-audio prompt plus official emotion-text control; CUDA kernel disabled. FP16 segfaulted after autoregressive generation on this host, so the official FP32 fallback is used. |
| Chatterbox 500M | `5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18` | `5de7a54aa4e5e2baadb0182dde554908b48b85c2` | Official defaults: exaggeration `0.5`, CFG `0.5`, temperature `0.8`; documented expressive condition: exaggeration `0.7`, CFG `0.3` |
| Fun-CosyVoice3 0.5B | `29e01c4e8d000f4bcd70751be16fa94bf3d85a18` | `074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc` | `CosyVoice3.inference_instruct2`, Brent prompt WAV, natural-language instruction ending in `<|endofprompt|>`, FP16 |
| Orpheus TTS 3B pretrained | `bf0cce99761b2f5857b3d85829691f696bf20cb0` | `e64661fe6d02c414fc77c53578c9d64082614861` | **Scope blocked:** the official package exposes preset voice IDs but no reference-audio cloning API. A stock voice is not a same-Brent benchmark and will not enter the blind bundle. |

The executable definitions are in `tools/tts_bakeoff/models.json`; feature inputs and per-model controls are in `tools/tts_bakeoff/round3_feature_statements.jsonl`. The official source repositories are [Fish Speech](https://github.com/fishaudio/fish-speech), [IndexTTS2](https://github.com/index-tts/index-tts), [Chatterbox](https://github.com/resemble-ai/chatterbox), [CosyVoice](https://github.com/QwenAudio/CosyVoice), and [Orpheus TTS](https://github.com/canopyai/Orpheus-TTS).

## Interpretation rule

Semantic, native-control, whole-turn and clause-planned clips answer different questions. Their listening scores remain separate. In particular, a strong clause-planned clip demonstrates the combination of an explicit planner and renderer; it is not evidence that the renderer autonomously remembered prior speech.

## Completed runs

| Arm | Baseline run | Baseline clips | p50 RTF | Peak VRAM | Feature run | Feature clips |
|---|---|---:|---:|---:|---|---:|
| Chatterbox 500M | `20260809T191938Z-chatterbox_original` | 13 | 0.234 | 6,813 MiB | `20260809T192022Z-chatterbox_original` | 14 |
| Fun-CosyVoice3 0.5B | `20260809T192145Z-cosyvoice3` | 13 | 0.449 | 6,671 MiB | `20260809T192326Z-cosyvoice3` | 14 |
| Fish Audio S2 Pro | `20260809T192622Z-fish_s2_pro` | 13 | 2.882 | 25,231 MiB | `20260809T193213Z-fish_s2_pro` | 7 |

Fish's feature arm uses one measured repeat; the other two use two. The blind set uses repeat 1 for every arm, so no listener sees unequal numbers of candidates. CosyVoice's upstream ONNX Runtime 1.18 CUDA provider expected CUDA 11 (`libcublasLt.so.11`) and fell back to CPU for its frontend; the neural synthesis path remained on CUDA. This compatibility condition is retained in the logs and must accompany its speed figures.

Machine-readable aggregates: `2026-08-09-imprynt-omen-rtx5090-round3-baseline-results.json` and `2026-08-09-imprynt-omen-rtx5090-round3-feature-results.json`.

## Exclusions with receipts

- **IndexTTS2:** official source and checkpoint installed successfully. Both FP16 and the documented FP32 fallback segfaulted after the autoregressive progress completed (`REMOTE_EXIT:139`); failed run IDs include `20260809T191522Z-indextts2`. It is excluded rather than presenting a partial or non-reproducible clip.
- **Orpheus TTS 3B:** official inference exposes preset voice IDs but no reference-audio cloning API, so it cannot satisfy the fixed same-Brent contract. No stock voice was substituted.

## Blind bundle

`listening-round3-20260809` contains 42 verified WAVs: 14 statements/conditions × 3 anonymous model samples, with no missing audio. It combines the unchanged seven-statement baseline and the seven feature/continuity conditions. The active Tailscale listener points to this bundle; the key remains sealed until ratings are complete.
