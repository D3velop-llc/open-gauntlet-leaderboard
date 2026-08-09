# RTX 5090 TTS bake-off — five-way ZONOS2 round

Status: complete. All 70 samples received a blind owner rating; identity was
revealed only after the completion timestamp was recorded.

## Blind comparison

The active bundle is `listening-round5-20260809-v2`: 14 statements and five
anonymous samples per statement, for 70 verified WAV files with no missing
audio. Each arm uses the same Brent reference WAV and transcript. The baseline
contains the seven unchanged pronunciation, conversational and long-form
statements. The feature half separately tests semantic emotion, native control,
whole-turn continuity, and stateless clause-planned rendering.

| Blind arm | Role | Baseline run | Feature run |
|---|---|---|---|
| Chatterbox 500M | new candidate | `20260809T191938Z-chatterbox_original` | `20260809T192022Z-chatterbox_original` |
| Fun-CosyVoice3 0.5B | new candidate | `20260809T192145Z-cosyvoice3` | `20260809T192326Z-cosyvoice3` |
| Fish Audio S2 Pro | new candidate | `20260809T192622Z-fish_s2_pro` | `20260809T193213Z-fish_s2_pro` |
| ZONOS2 | new candidate | `20260809T211802Z-zonos2` | `20260809T211851Z-zonos2` |
| Higgs Audio v3 4B | calibrated anchor | `20260809T161003Z-higgs_v3` | `results/v2/20260809T173502Z-higgs_v3` |

Higgs is intentionally included as the fifth arm because the prior owner
listening round gave its clause-planned condition the only 5/5 score. It is an
anchor, not an unmeasured new candidate. Identity remained sealed until the
round was complete.

## Blind listening results

No clip scored 5/5, so this round produced no new “amazing” result under the
owner's established threshold. There were no explicit winner selections; means
below summarize the complete 70 individual 1–5 ratings.

| Model | Overall mean | Baseline mean | Feature mean | Brent-like flags | Main limiting signal |
|---|---:|---:|---:|---:|---|
| Higgs Audio v3 4B | **2.857** | **3.143** | **2.571** | 11/14 | uneven controlled transition; trailing silence on paragraph |
| Fish Audio S2 Pro | 2.571 | 2.571 | **2.571** | **13/14** | bad pacing 6/14; emotion mismatch 5/14; RTF 2.882 |
| Chatterbox 500M | 2.286 | 2.429 | 2.143 | 7/14 | bad pacing 5/14; weaker native emotion control |
| ZONOS2 | 2.071 | 2.429 | 1.714 | 3/14 | voice drift 6/14, including all three native-control clips |
| Fun-CosyVoice3 0.5B | 1.071 | 1.000 | 1.143 | 0/14 | robotic 13/14; control/instruction spoken 10/14 |

“Baseline” is the seven neutral statements. “Feature” is the unweighted mean of
the seven semantic-emotion, native-control, and continuity conditions. They are
reported separately because mixing them would hide control-path failures.

### Condition findings

- **Stateless clause-planned continuity:** Chatterbox and Higgs scored 4/5,
  Fish 3/5, and ZONOS2 and CosyVoice 1/5. Chatterbox was marked natural,
  Brent-like, emotionally matched, and smoothly transitioned. ZONOS2 was marked
  for artifacts and multiple voice changes.
- **Whole connected turn:** Chatterbox, Fish, and ZONOS2 scored 3/5; CosyVoice
  and Higgs scored 2/5. This round therefore does not establish a strong
  autonomous connected-turn winner.
- **Native emotion controls:** Fish led at 2.667 mean, Higgs followed at 2.333,
  Chatterbox scored 1.667, and ZONOS2 and CosyVoice each scored 1.000. ZONOS2's
  expressive controls changed the perceived voice in every native-control test.
- **Semantic emotion without explicit controls:** Higgs and ZONOS2 tied at
  2.5, Fish scored 2.0, Chatterbox 1.5, and CosyVoice 1.0. No amusement clip
  exceeded 2/5, so convincing emotional adaptation remains unresolved.
- **Long paragraph:** Chatterbox and ZONOS2 both scored 4/5 for natural delivery
  and good pacing. This is ZONOS2's clearest positive result.

The practical outcome is to retain Higgs as the current general Brent anchor,
keep Chatterbox 500M as the lighter clause-planning challenger, and reject the
current CosyVoice configuration. ZONOS2 remains experiment-required: its neutral
long-form result is promising, but its native emotion settings need calibration
that preserves identity before promotion.

Machine-readable reveal: `2026-08-09-imprynt-omen-rtx5090-round5-listening-results.json`.
Raw anonymous ratings: `2026-08-09-imprynt-omen-rtx5090-round5-ratings.csv`.

## ZONOS2 setup and measurements

- Official source: [Zyphra/ZONOS2](https://github.com/Zyphra/ZONOS2), pinned at
  `194c0a3ab67b90383a67646289f28d4ecb1c1f64`.
- Checkpoint: [Zyphra/ZONOS2](https://huggingface.co/Zyphra/ZONOS2), pinned at
  `65f1e80f94b599d474bb6af9094a803dc52f60bd`.
- Installation: upstream `uv sync`; official Mini-SGLang server on Linux x86-64.
  The Omen required NVIDIA's CUDA 13.2 compiler toolkit and `ninja-build` for
  first-start JIT kernels; the installed display driver was not changed.
- Server: localhost port 8820, memory ratio `0.7`, official emotion-direction
  directory, 44.1 kHz float PCM response.
- Cloning: per-request Brent reference audio embedding; language `en_us`.
- Baseline generation: accurate mode, temperature `1.15`, top-k `106`, min-p
  `0.18`, repetition window `50`, penalty `1.2`, eight repetition codebooks.
- Feature generation: official expressive mode and documented emotion controls
  (directions/sliders, valence/arousal, emotion CFG `1.5`) selected per target.

| ZONOS2 set | clips | p50 elapsed | p95 elapsed | p50 RTF | p95 RTF | peak VRAM | peak GPU power |
|---|---:|---:|---:|---:|---:|---:|---:|
| baseline | 13 | 2.883 s | 7.500 s | 0.374 | 0.526 | 24,543 MiB | 279.30 W |
| feature | 14 | 3.040 s | 10.962 s | 0.462 | 0.606 | 24,543 MiB | 277.89 W |

These are full-response timings, not time-to-first-audio measurements. The
machine-readable receipts are
`2026-08-09-imprynt-omen-rtx5090-round5-zonos-baseline.json` and
`2026-08-09-imprynt-omen-rtx5090-round5-zonos-feature.json`.

## IndexTTS2 audit and exclusion

The earlier IndexTTS2 run did not use the project's currently documented setup,
so it was repeated from a fresh checkout at
`90ca4d608209584bad3a5bd5becc0b80c146e60f`. Upstream explicitly supports `uv`
and warns that pip or conda installs can produce random bugs. The recommended
`uv sync --all-extras` could not resolve on Linux because the upstream lock
includes `triton-windows==3.1.0.post17`; the supported base `uv sync` completed
with its exact lock, including PyTorch `2.8.0+cu128` and Transformers `4.52.1`.

The official base inference path was then used: FP32, CUDA kernel disabled,
DeepSpeed disabled, speaker-audio cloning, and emotion text at the documented
`emo_alpha=0.6`. Run `20260809T211215Z-indextts2` again completed the
autoregressive progress and then segfaulted (`REMOTE_EXIT:139`) before producing
a valid harness clip. IndexTTS2 is therefore excluded from the blind round as a
confirmed host/runtime failure, not judged for voice quality.

## Interpretation

Native emotion controls are evaluated in their own lane and must not be averaged
silently with neutral baseline speech. Likewise, `continuity_whole` measures one
connected generation, while `continuity_stateless` measures four independently
planned clauses concatenated without inserted silence. A strong clause result
proves the planner-plus-renderer combination; it does not prove autonomous model
memory of prior audio or prior turns.
