# RTX 5090 TTS bake-off — human-conversation head-to-head

Status: complete. The owner-listener rated all 50 anonymous clips before the
identity key was joined. This is a same-harness result on `imprynt-omen`, not a
population leaderboard.

## Decision result

MOSS-TTS-Realtime is the clear winner for human conversation in this round. It
averaged **4.10/5** with a median of 4, and remained at 4.00 when the special
best-native continuity item was excluded. Every clip was marked natural, 9/10
were marked Brent-like, and 8/10 matched both the intended emotion and the
desired transition. It led or tied seven of ten scenarios and had no issue flags.

| Model | Mean | Median | Single-turn mean | 5/5 clips | Natural | Brent-like | Emotion match | Smooth transition | p50 RTF |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **MOSS-TTS-Realtime** | **4.10** | **4.0** | **4.00** | **3** | **10/10** | **9/10** | **8/10** | **8/10** | 0.459 |
| Higgs TTS 3 | 3.30 | 3.5 | 3.22 | 2 | 8/10 | 8/10 | 4/10 | 4/10 | **0.164** |
| Sesame CSM-1B | 3.00 | 3.5 | 2.89 | 0 | 6/10 | 7/10 | 5/10 | 6/10 | 0.734 |
| IndexTTS2 | 2.50 | 2.5 | 2.67 | 1 | 2/10 | 6/10 | 3/10 | 2/10 | 0.516 |
| MOSS-TTSD v1.0 | 2.50 | 2.0 | 2.22 | 1 | 6/10 | 3/10 | 5/10 | 5/10 | 0.265 |

The timing figures are full-response real-time factors, not time to first audio.

## What each model did well

- **MOSS-TTS-Realtime:** 5/5 on the sincere apology, playful skeptical question,
  and best-native emotional arc. It also led restrained excitement and tied the
  boundary, quiet-empathy, and story conditions.
- **Higgs TTS 3:** the strongest humor arm. It scored 5/5 on both the dry joke
  and playful tease, and 4/5 on the apology, suspense story, and best-native arc.
- **IndexTTS2:** the best embarrassed self-repair at 5/5. Its result confirms a
  valuable narrow strength, but five bad-pacing flags and two overacting flags
  pulled the full conversational mean below its earlier baseline result.
- **Sesame CSM-1B:** five 4/5 clips, including the gentle boundary, teasing,
  skeptical question, dry joke, and best-native arc. Artifacts, seams, and word
  errors limited consistency.
- **MOSS-TTSD v1.0:** 5/5 on the best-native emotional arc and 4/5 on the
  skeptical question, but voice drift on 6/10 clips makes it a poor general
  Brent clone in this configuration.

Quiet empathy remains unresolved: no model exceeded 3/5. Restrained excitement
also exposed failures in Higgs (omitted words and trailing silence) and Sesame
(artifact, seam, and drift), despite their stronger humor and boundary results.

## Best-native emotional arc

The clean expected speech was identical, but each model used its strongest
available mechanism:

- MOSS-TTS-Realtime retained generation state while four clauses were pushed
  through one streaming session: **5/5**.
- MOSS-TTSD generated one long-context continuation: **5/5**.
- Higgs used clause-level native emotion tags in one request: **4/5**.
- Sesame used one same-speaker context-conditioned generation: **4/5**.
- Index used four independently emotion-controlled clauses joined without
  inserted silence: **1/5**, with a seam, emotion mismatch, and overacting.

This condition supports MOSS-Realtime's stateful rendering path in the tested
within-turn scenario. It does not prove retained emotional state across separate
assistant turns in a live conversation.

## Method and setup

Ten entirely new prompts tested dry humor, playful teasing, awkward repair,
quiet empathy, a gentle boundary, restrained excitement, skeptical questioning,
sincere apology, conversational storytelling, and a changing emotional arc.
None reused baseline or round-7 text. Every arm used the same Brent reference
audio and transcript; one warmup and one measured generation were retained.

- IndexTTS2: source `90ca4d608209584bad3a5bd5becc0b80c146e60f`, checkpoint
  `740dcaff396282ffb241903d150ac011cd4b1ede`; FP32, randomness off, official
  emotion-text control at alpha 0.6.
  When its Qwen converter repeatedly returned a non-numeric label, the final
  successful run used the official spoken-text emotion derivation fallback and
  recorded that choice per clip.
- Sesame CSM-1B: source `daed31e6d42cf71873999075de204fa37d2acec3`,
  checkpoint `c92a71e1c419772e25be7dc14d952c2521a740ab`; native Transformers context
  path, BF16, temperature 0.9 and depth-decoder temperature 0.9.
- MOSS-TTSD: source `58b20a0d5fcc6766658d50967a90a9d890009a46`, checkpoint
  `c7cd852d87aff71cab5bd2b9b05509cedc0ef1ba`; BF16, official continuation,
  temperature 1.1, top-p 0.9, top-k 50 and repetition penalty 1.1.
- MOSS-TTS-Realtime: source `58b20a0d5fcc6766658d50967a90a9d890009a46`,
  checkpoint `75682787d8e2fcc73faca37ba2931453ca9c4022`, codec
  `3cd226ba2947efa357ef453bcad111b6eafba782`; BF16 SDPA, temperature 0.8,
  top-p 0.6, top-k 30,
  repetition penalty 1.1 and repetition window 50.
- Higgs TTS 3: source `5a15cde858ea09b77116212a39356f2fc51b8584`, checkpoint
  `7556c17e05201fccd9c8cc120bc216dcc7b5d561`; pinned SGLang-Omni container,
  temperature 0.8, top-k 50, 1024 maximum tokens, registered Brent reference
  and official inline controls.

All 50 WAVs passed structural and signal validation: durations 4.203–31.480
seconds, RMS levels -30.12 to -12.50 dBFS, with no missing, corrupt, silent, or
clipped files. Exact revisions and failed-run provenance are recorded in
`tools/tts_bakeoff/round8_setup_receipt.json`.

Machine-readable reveal and aggregates:
`2026-08-10-imprynt-omen-rtx5090-round8-listening-results.json`.
Raw anonymous ratings:
`2026-08-10-imprynt-omen-rtx5090-round8-ratings.json`.

## Recommendation and limitation

Promote MOSS-TTS-Realtime to the leading **experiment-required** candidate for
Imprynt's human-conversation voice path. Before production promotion, repeat the
human-conversation set with at least one additional listener and a second seed,
then test actual cross-turn conditioning through the live controller. Retain
Higgs as the humor/expressive challenger and Index as the awkward-repair
specialist. One owner-listener and one generated sample per item are not enough
to claim a population preference or universal model ranking.
