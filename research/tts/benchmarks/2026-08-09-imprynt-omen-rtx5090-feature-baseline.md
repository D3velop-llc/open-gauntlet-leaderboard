# Imprynt Omen TTS feature and continuity baseline

Status: **blind listening complete; single-rater experiment, not promotion proof**
Run date: 2026-08-09
Host: `imprynt-omen`, NVIDIA RTX 5090
Harness: `tools/tts_bakeoff/`
Remote evidence root: `~/tts-bakeoff/results/v2`

This second set corrects the main limitation of the initial component run: it
tests semantic emotion, documented model controls, whole-turn generation,
stateless clause splitting, and real prior-context state. The clean expected
speech remains visible to the listener; control markup is withheld with model
identity until the blind review is complete.

## Fixed comparison contract

- Brent reference WAV and transcript are identical to the first run.
- Feature statement SHA-256:
  `faeeff916a541f05abf0cc84ffb9f5024b00837b3c499df8e6a947fe9a0ef7e4`.
- Two unscored warm-ups and two measured repeats; repeat 1 supplies the blind
  bundle.
- Seven scenarios contain all five models. The native-stateful scenario
  contains only MOSS-TTS-Realtime and VoxCPM2, for 37 anonymous clips total.
- Stateless splits concatenate the four independently generated clause WAVs
  without inserted silence.
- A model is not labeled stateful unless its documented runtime actually
  carries prior generation state.
- Native sample rates and measured WAVs are retained without loudness
  normalization.

## Feature lanes and exact mechanisms

| Lane | Higgs v3 | Qwen3-TTS Base | VoxCPM2 | MOSS Realtime | Chatterbox Turbo |
|---|---|---|---|---|---|
| Semantic emotion | Text semantics | Text semantics | Ultimate-clone text semantics | Text semantics | Text semantics |
| Calm / enthusiasm | Inline emotion and prosody tokens | Semantic fallback | Parenthetical controllable-clone instruction | Semantic fallback | Semantic fallback |
| Emotion transition | Clause-level inline tokens | Semantic fallback | Transition instruction | Semantic fallback | Semantic fallback |
| Whole turn | One controlled request | One clone request | One controllable-clone request | One non-streaming request | One clone request |
| Stateless split | Four controlled requests, no state | Four clone requests | Four controllable-clone requests, no merged cache | Four non-streaming requests | Four clone requests |
| Stateful split | Not claimed | Not claimed | Reference prompt cache merged with each generated clause's text and acoustic features | One streaming session with live KV and attention state | Not claimed |

The exact per-scenario rendered strings, targets, support labels, and mechanisms
are machine-readable in `tools/tts_bakeoff/feature_statements.jsonl`. Important
interpretation limits:

- The pinned Qwen checkpoint is the Base clone model, not the separate
  CustomVoice or VoiceDesign checkpoint, so it has no instruction-control arm.
- Chatterbox Turbo supports paralinguistic tags, but the selected emotional
  scenarios do not have matching documented emotion instructions; CFG and
  exaggeration controls are ignored by Turbo.
- MOSS's stateful arm uses its streaming session. The unscored feature warm-up
  compiles that path before measurement so compilation is not charged as
  steady-state synthesis.
- VoxCPM2's stateful arm extends its prompt cache with every generated clause.
- The listener includes a `Spoke control text` issue flag because inline or
  parenthetical controls must not leak into speech.

## Execution receipts

| Model | Complete run | Rows | RTF p50 | RTF p95 | GPU peak MiB |
|---|---|---:|---:|---:|---:|
| Chatterbox Turbo | `20260809T173110Z-chatterbox_turbo` | 14 | 0.115 | 0.126 | 4,947 |
| Higgs Audio v3 | `20260809T173502Z-higgs_v3` | 14 | 0.164 | 0.171 | 28,841 |
| VoxCPM2 | `20260809T173136Z-voxcpm2` | 16 | 0.188 | 0.194 | 8,909 |
| MOSS-TTS-Realtime | `20260809T173234Z-moss_realtime` | 16 | 0.458 | 0.468 | 13,137 |
| Qwen3-TTS Base | `20260809T172955Z-qwen3_tts` | 14 | 0.540 | 0.547 | 6,367 |

Aggregate receipts are
`20260809T173502Z-feature-comparison.json` and its CSV sibling. The failed
readiness attempt `20260809T173435Z-higgs_v3` is intentionally retained as
`FAILED`, has no measurements, and is excluded from the aggregate.

## Listening gate

The active anonymous bundle is
`~/tts-bakeoff/results/listening-features-20260809`. It contains 8
comparisons and 37 WAVs. Ratings begin at 0/37 and autosave atomically to that
bundle's `listening-ratings.json`. The completed first-round ratings remain in
`listening-20260809` and were not modified.

Do not use the component timing table as a quality ranking. Promotion requires
blind judgments of target-emotion match, Brent identity, naturalness, pacing,
emotion transitions, clause continuity, seams, drift, omissions, repetitions,
artifacts, and any spoken control markup. Only then should the withheld key be
joined to ratings.

## Blind listening results

The session was completed at `2026-08-09T18:13:14.521Z` with 37 scored clips out of 37, no explicit
best-sample selections, and no written notes. Ratings SHA-256 is
`3b798140a0995b1008db790c0b8a4480f7450b658fa5721c07b41641f62eed0f`.

**Headline owner-listening result:** only one of the 37 clips was judged
amazing (5/5). It was Higgs Audio v3 in `continuity_stateless`: four clauses
generated as independent requests with clause-specific emotion/prosody tokens,
then concatenated without inserted silence. The listener marked emotion match,
expression, pacing, naturalness, smooth transition, and Brent identity as
positive. No other clip received 5/5. This arm used an explicitly prescribed
clause-by-clause emotional trajectory; Higgs did not infer or retain prior
clause state. It is evidence for a prosody-planner-plus-renderer architecture,
not evidence of autonomous prior-context adaptation.

| Model | Overall mean | Semantic emotion | Native-control lane | Continuity lane |
|---|---:|---:|---:|---:|
| Chatterbox Turbo | 3.286 (7/7) | 3.5 | 3.0 | 3.5 |
| VoxCPM2 | 3.25 (8/8) | 3.0 | 3.333 | 3.333 |
| Higgs Audio v3 | 2.857 (7/7) | 3.0 | 2.333 | 3.5 |
| Qwen3-TTS Base | 2.857 (7/7) | 3.0 | 2.667 | 3.0 |
| MOSS-TTS-Realtime | 2.5 (8/8) | 2.0 | 2.0 | 3.333 |

These cross-lane averages are descriptive only. Chatterbox, Qwen, and MOSS use
semantic fallbacks in the control lane; they are not demonstrations of native
instruction control.

### Continuity contrast

| Model | Whole turn | Stateless four-clause split | Native-stateful split |
|---|---:|---:|---:|
| Chatterbox Turbo | 4 | 3 | not supported |
| Higgs Audio v3 | 2 | 5 | not supported |
| MOSS-TTS-Realtime | 3 | 4 | 3 |
| Qwen3-TTS Base | 2 | 4 | not supported |
| VoxCPM2 | 4 | 3 | 3 |

This run does **not** demonstrate a stateful-context listening benefit. MOSS's
stateful score equals its whole-turn score and trails its stateless split;
VoxCPM2's stateful score equals its stateless split and trails its whole turn.
Both stateful samples still sounded natural and like Brent, but VoxCPM2's was
also flagged `control_spoken` and `robotic`. VoxCPM2's stateless sample was
flagged with an audible boundary seam.

Higgs's stateless controlled split was the single amazing sample (5/5 with
emotion, expression, pacing, naturalness, transition, and identity all marked
positively), while its controlled whole turn scored 2/5 with an emotion
mismatch. That large within-model reversal requires replication; it is not
evidence that splitting is universally better, but it is the configuration to
reproduce first.

### Decision

- **No model is promoted yet.** This is one listener, one generated repeat per
  condition, and one connected script, despite all 37 clips being scored.
- **Lead configuration:** Higgs v3 with independently generated, explicitly
  controlled clauses and zero-silence concatenation. It is the only observed
  configuration that crossed the owner's amazing threshold. Treat the upstream
  clause/prosody planner as part of the configuration.
- Chatterbox has the highest and most consistent descriptive result in this feature set,
  scoring 3 or 4 on every clip, but it did not expose native emotional
  instruction control for these scenarios.
- VoxCPM2 shows the strongest observed native-control scores on calm and
  enthusiasm; its transition scored 3/5 and was flagged robotic, while its
  stateful arm leaked control text.
- Higgs shows the highest upside and largest instability: 5/5 on the controlled
  stateless split, 4/5 on calm, but 1/5 on controlled transition and 2/5 on
  enthusiasm and whole-turn continuity.
- Qwen is strong on amusement, enthusiasm, and stateless splitting (4/5 each),
  but its Base checkpoint lacks native instruction control and collected four
  bad-pacing flags overall.
- MOSS preserves identity and is operationally stateful, but this sample gives
  no subjective stateful uplift and its emotion lanes are the weakest (2.0).

Status: `experiment required`. The next promotion-quality round should repeat
each continuity condition with multiple seeds and at least three connected
scripts, add more than one blinded listener, repair VoxCPM2 control leakage,
and include a true prior-turn condition in which the current clause cannot be
performed correctly from its text alone.
