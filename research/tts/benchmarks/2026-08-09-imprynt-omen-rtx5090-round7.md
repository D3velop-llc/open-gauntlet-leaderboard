# RTX 5090 TTS bake-off — seven-way clone and feature round

Status: complete. All 84 samples received a blind owner rating; identity was
revealed only after the completion timestamp was recorded.

## Blind comparison

The bundle `listening-round7-20260809` contains 12 statements and seven
anonymous samples per statement. Every arm used the same Brent reference WAV
and exact reference transcript. Seven unchanged baseline statements cover
conversation, pronunciation, punctuation, emotion and long-form speech. Five
feature statements separately test semantic empathy, model-native expressive
controls, a connected whole turn, and four stateless clause-planned renders
joined without inserted silence.

| Model | Overall mean | Median | Baseline mean | Feature mean | p50 RTF | Peak VRAM | Main limiting signal |
|---|---:|---:|---:|---:|---:|---:|---|
| **IndexTTS2** | **3.833** | **4** | **3.857** | **3.800** | 0.378 | 14,112 MiB | one mispronunciation; connected whole turn 3/5 |
| Sesame CSM-1B | 2.500 | 2 | 2.571 | 2.400 | 0.739 | 5,440 MiB | omitted words 3/12; inconsistent despite one 5/5 |
| Step-Audio-EditX | 2.500 | 3 | 2.571 | 2.400 | 2.730 | 21,860 MiB | bad pacing 4/12; slower than real time |
| MOSS-TTSD v1.0 | 2.417 | 2 | 2.857 | 1.800 | **0.273** | 26,366 MiB | voice drift 8/12; split continuity 1/5 |
| Audio8 TTS Preview 0.6B | 2.250 | 2 | 2.000 | 2.600 | 0.565 | 6,318 MiB | bad pacing 5/12; robotic 4/12 |
| KaniTTS-2 English | 1.750 | 2 | 1.571 | 2.000 | 0.366 | 5,962 MiB | voice drift 8/12 |
| Orpheus TTS 3B Pretrained | 1.417 | 1 | 1.429 | 1.400 | 0.622 | 9,164 MiB | voice drift 11/12; mispronunciation 5/12 |

These timings are full-response latency, not time to first audio. Peak GPU
power ranged from 162.90 W for Sesame to 573.16 W for IndexTTS2. Baseline and
feature means remain separate because averaging them silently would hide
control-path and continuity failures.

IndexTTS2 is the clear round winner: every clip was marked natural, 11/12 were
marked Brent-like, 9/12 matched the intended emotion, and 7/12 had a smooth
transition. It is now the strongest experiment-required promotion candidate in
this harness. This result does not prove autonomous memory of prior speech.

## Condition findings

- **5/5 clips:** IndexTTS2 on the awkward-clause sentence, Sesame CSM on the
  emotional baseline, and MOSS-TTSD on the short reply. These are the three
  clips that met the owner's established “amazing” threshold.
- **Stateless clause-planned continuity:** IndexTTS2 scored 4/5; Audio8,
  Sesame and Step scored 3/5; Kani and Orpheus scored 2/5; MOSS-TTSD scored
  1/5.
- **Whole connected turn:** IndexTTS2 and Audio8 scored 3/5; Kani, MOSS,
  Sesame and Step scored 2/5; Orpheus scored 1/5. No arm demonstrated a strong
  autonomous connected-turn result.
- **Controlled enthusiasm:** IndexTTS2 led at 4/5 and Audio8 followed at 3/5.
  **Controlled transition:** IndexTTS2 led at 4/5; MOSS, Sesame and Step scored
  3/5.
- **Semantic empathy:** IndexTTS2 scored 4/5; Audio8, Kani, Sesame and Step
  scored 2/5; MOSS and Orpheus scored 1/5.
- **Other baseline wins:** MOSS-TTSD's short reply and Sesame's emotional clip
  each scored 5/5. IndexTTS2 scored 4/5 on the question and number/date tests,
  and 3/5 on names/acronyms and the long paragraph.

The split condition outscored the connected whole-turn condition for most
systems. That favors a controlled planner-plus-renderer path, but it does not
establish stateful prosody: the four clauses deliberately shared no generated
audio or hidden state. MOSS-TTSD is also distinct from MOSS-TTS-Realtime; this
round provides no evidence that TTSD retains prior-turn state.

Machine-readable reveal and aggregate results:
`2026-08-09-imprynt-omen-rtx5090-round7-listening-results.json`.
Raw anonymous ratings:
`2026-08-09-imprynt-omen-rtx5090-round7-ratings.json`.

## Reproducible setup

All seven systems ran sequentially in isolated environments. Each process
exited before the next model loaded, so VRAM did not overlap. The harness used
one warmup and one measured generation per statement. The exact Brent reference
hash was `d9b12c040f284c251fae88813a0459391933519fdc191ccfec4ca731c1c31a65`;
its transcript hash was
`dc3f861b7e98e2d98f5e5eb582be4e38a98ca6e529b3bfa525ce7545a65c998e`.

- **MOSS-TTSD v1.0:** [official source](https://github.com/OpenMOSS/MOSS-TTS)
  at `58b20a0d5fcc6766658d50967a90a9d890009a46`; checkpoint
  `c7cd852d87aff71cab5bd2b9b05509cedc0ef1ba`. BF16, official continuation
  with reference audio plus exact transcript, audio temperature 1.1, top-p
  0.9, top-k 50 and repetition penalty 1.1.
- **Step-Audio-EditX:** [official source](https://github.com/stepfun-ai/Step-Audio-EditX)
  at `a652e87052c109e26f616d60971376ff47a829d4`; model
  `5fe2f8a05c2353301ad47d3c1747b262115da138`; tokenizer
  `af7e5a3ec06175a7facae9d4100073d6e4dbb36c`. Official zero-shot clone,
  BF16, 0.5 GPU-memory utilization, model length 3072, eager execution and one
  sequence. Its documented emotion edit was used where applicable.
- **Sesame CSM-1B:** [official source](https://github.com/SesameAILabs/csm) at
  `daed31e6d42cf71873999075de204fa37d2acec3`; checkpoint
  `c92a71e1c419772e25be7dc14d952c2521a740ab`. Official native Transformers
  path, BF16, temperature 0.9, depth-decoder temperature 0.9, with Brent audio
  and transcript as same-speaker conversational context.
- **KaniTTS-2 English:** [official source](https://github.com/nineninesix-ai/kani-tts-2)
  at `14a9caef4a6b90df95edd6afc482bf1161a43e84`; checkpoint
  `733435d9229fb6d5d2cdf23a44399a155ca2ab78`; WavLM speaker embedder
  `419c1dba057b2f92aba4259a101d785cf8ef213d`. Official speaker embedding,
  official defaults, and the required `en_us` language tag.
- **Audio8 TTS Preview 0.6B:** [official model](https://huggingface.co/Audio8/Audio8-TTS-Preview-0.6b)
  at `f9612f13a0ab40facf3d050fc908b9e6db05c2be`. BF16, Brent audio plus exact
  transcript, temperature 0.8, top-p 0.95, top-k 50, sampling enabled and 2048
  maximum new tokens.
- **IndexTTS2:** [official source](https://github.com/index-tts/index-tts) at
  `90ca4d608209584bad3a5bd5becc0b80c146e60f`; checkpoint
  `740dcaff396282ffb241903d150ac011cd4b1ede`. Fresh official checkout and base
  `uv sync`, FP32, CUDA kernel off, speaker-audio prompt, and official emotion
  text at alpha 0.6. A SoundFile exact-int16 PCM compatibility writer replaced
  the upstream torchaudio 2.8 SoX writer, which segfaulted after synthesis on
  this host.
- **Orpheus TTS 3B Pretrained:** [official source](https://github.com/canopyai/Orpheus-TTS)
  at `e64661fe6d02c414fc77c53578c9d64082614861`; checkpoint
  `bf0cce99761b2f5857b3d85829691f696bf20cb0`; SNAC codec
  `d73ad176a12188fcf4f360ba3bf2c2fbbe8f58ec`. Official pretrained Colab
  conditioning format with the Brent text/audio pair, temperature 0.5, top-p
  0.9, repetition penalty 1.1 and 1400 maximum new tokens. Inline official
  expressive tags were used in feature conditions.

## Repair and validity note

Before final rating, the listener identified two unfair samples on page 2.
KaniTTS-2 had been invoked without its required `en_us` language tag. IndexTTS2
returned already-scaled int16 samples, but the initial compatibility writer
converted them through a floating-point path and clipped nearly the entire
waveform. All 12 clips for each affected model were regenerated after fixing
those causes and replaced in their existing blind slots. Only four ratings
already attached to the superseded clips were cleared. The final result above
contains 84 ratings of the repaired audio; the blind labels were preserved.

The two samples that sounded alike on page 2 were separately verified as
different models with different file hashes. No duplicate audio was found.
