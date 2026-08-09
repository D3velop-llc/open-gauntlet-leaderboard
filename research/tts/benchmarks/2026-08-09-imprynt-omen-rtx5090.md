# Imprynt Omen RTX 5090 TTS component bake-off

Status: **measured component run; listening review required before ranking**
Run date: 2026-08-09
Harness: `tools/tts_bakeoff/`
Remote evidence root: `/home/imprynt/tts-bakeoff/results`

This run compares five local TTS systems on the same RTX 5090, statements, and
Brent voice reference. It measures model-load and complete-waveform generation,
not physical speaker onset. The existing Higgs deployment was the incumbent;
the other four arms were installed in isolated environments.

## Comparison identity

- Host: `imprynt-OMEN-by-HP-45L-Gaming-Desktop-GT22-3xxx`
- OS: Ubuntu 26.04 LTS, kernel `7.0.0-29-generic`
- GPU: NVIDIA GeForce RTX 5090, 32,607 MiB reported
- Driver: 595.84
- Driver-reported CUDA capability: 13.2
- Reference WAV: 28.35 s, mono PCM16, 24 kHz
- Reference WAV SHA-256: `d9b12c040f284c251fae88813a0459391933519fdc191ccfec4ca731c1c31a65`
- Reference transcript SHA-256: `dc3f861b7e98e2d98f5e5eb582be4e38a98ca6e529b3bfa525ce7545a65c998e`
- Statement-set SHA-256: `dce124a3a5fbf89544f69b90ca145f2cf25ce25bf305e9165f75014849bd8055`
- Two warm-ups; two measured runs per short statement; one measured long-form
  run; 13 saved WAVs per model.

The Higgs container and user GNOME remote-desktop service were stopped for the
four direct-model arms. The remote-desktop service remained stopped for the
Higgs arm. GNOME display processes and a 36 MiB Claude Desktop GPU process were
left running, producing a pre-run baseline of approximately 485 MiB. The Higgs
container and remote-desktop service were restored and verified healthy after
the run.

## Exact arms

### Higgs Audio v3 4B

- Model: `bosonai/higgs-tts-3-4b`
- Checkpoint: `7556c17e05201fccd9c8cc120bc216dcc7b5d561`
- Backend: SGLang-Omni commit `5a15cde858ea09b77116212a39356f2fc51b8584`
- Image digest: `sha256:46235435997d1fa93fc81fb1c2d5b7fd8470d77395a5c348c0176094ffddf95e`
- Launch: host-network SGLang-Omni server, model bind-mounted read-only at
  `/models/higgs-v3`, Brent reference directory bind-mounted read-only at
  `/refs`, port 8800.
- Request: `/v1/audio/speech`, model `/models/higgs-v3`, registered voice
  `brent`, WAV response.

### Qwen3-TTS 12 Hz 1.7B Base

- Source commit: `022e286b98fbec7e1e916cb940cdf532cd9f488e`
- Checkpoint: `fd4b254389122332181a7c3db7f27e918eec64e3`
- Python 3.12.13; Torch 2.11.0+cu128; BF16; PyTorch SDPA.
- Zero-shot ICL clone using both the Brent WAV and exact transcript.
- Clone prompt computed once and reused across every statement.
- Language fixed to English; upstream generation defaults retained.
- FlashAttention 2 was attempted, but no compatible binary was available and
  the source build required a matching CUDA 12.8 `nvcc`. The documented SDPA
  fallback was used rather than changing the host CUDA toolkit.

### VoxCPM2

- Source commit: `616d3d3e630a9c96c2853250eef91b0f39dcd5fa`
- Checkpoint: `bffb3df5a29440629464e5e839f4d214c8714c3d`
- Python 3.12.13; Torch 2.11.0+cu128; model-reported BF16.
- `load_denoiser=False`; float32 matmul precision `high`.
- Official "ultimate cloning": the Brent WAV supplied as both prompt and
  reference, with the exact transcript as `prompt_text`.
- CFG 2.0; 10 inference steps; seeds 42 and 43.
- Nano-vLLM-VoxCPM commit `0cc522ca22971213f5fda5d4b2c4457f294aab85`
  was inspected. It supports the required reference/prompt conditioning but
  hard-requires FlashAttention, so it was not used under the same CUDA-toolkit
  constraint noted above.

### MOSS-TTS-Realtime

- Source commit: `58b20a0d5fcc6766658d50967a90a9d890009a46`
- Model checkpoint: `75682787d8e2fcc73faca37ba2931453ca9c4022`
- MOSS Audio Tokenizer checkpoint: `3cd226ba2947efa357ef453bcad111b6eafba782`
- Python 3.12.13; official `torch-runtime` extra: Torch/Torchaudio
  2.9.1+cu128, TorchCodec 0.8.1, Transformers 5.0.0.
- BF16, SDPA, max length 5,000; codec at 24 kHz with 8-second chunks.
- Temperature 0.8; top-p 0.6; top-k 30; repetition penalty 1.1; repetition
  window 50.
- TorchCodec could not load its shared library on this host. The canonical
  Brent WAV was read with SoundFile instead; it was already the required mono
  24 kHz PCM. Model inference and codec generation were unchanged.
- The official non-streaming reference path was measured. Although vendor
  latency results mention `torch.compile`, that reference path exposes no
  non-streaming compile switch, so this run does not claim compiled MOSS.

### Chatterbox Turbo

- Source commit: `5de7a54aa4e5e2baadb0182dde554908b48b85c2`
- Checkpoint: `749d1c1a46eb10492095d68fbcf55691ccf137cd`
- Python 3.12.13; Torch/Torchaudio 2.11.0+cu128.
- Turbo 350M, single-step decoder, CUDA, Brent audio prompt, upstream
  generation defaults, and the upstream Perth watermark path enabled.
- Compatibility override: upstream pins Torch 2.6 for Python below 3.14,
  which is not the selected Blackwell/cu128 runtime. Torch cu128 was installed
  first, all other declared dependencies were installed unchanged, and the
  source package was then installed without allowing the Torch pin to
  downgrade it. The attempted Python 3.14 branch also failed because its
  resolved `llvmlite` explicitly rejected Python 3.14.

## Component results

RTF is generation wall time divided by generated audio duration. Lower is
faster. GPU memory includes the approximately 485 MiB desktop baseline. Load
time is process-local model initialization; Higgs was already served, so its
near-zero client load is not comparable to direct model load.

| Model | Load s | RTF p50 | RTF p95 | RTF max | GPU peak MiB | Power peak W | Native Hz |
|---|---:|---:|---:|---:|---:|---:|---:|
| Chatterbox Turbo | 3.948 | 0.112 | 0.127 | 0.127 | 5,671 | 233.42 | 24,000 |
| Higgs Audio v3 4B | served | 0.162 | 0.188 | 0.193 | 29,443 | 456.26 | 24,000 |
| VoxCPM2 | 34.296 | 0.188 | 0.201 | 0.203 | 8,683 | 409.46 | 48,000 |
| MOSS-TTS-Realtime | 1.845 | 0.454 | 0.468 | 0.473 | 13,133 | 232.74 | 24,000 |
| Qwen3-TTS 1.7B Base | 1.724 | 0.560 | 0.564 | 0.565 | 6,809 | 175.73 | 24,000 |

The systems produced materially different total durations from identical text:
Qwen 102.32 s, Chatterbox 106.40 s, VoxCPM2 123.84 s, MOSS 126.56 s, and Higgs
164.40 s. This may reflect pacing, pauses, truncation, repetition, or other
content behavior. It must be resolved by transcript checks and human listening;
RTF alone cannot identify the cause.

## Promotion limits and next gate

- These are component-generation results, not time-to-first-audio or physical
  playback latency.
- No model is a quality winner until the saved WAVs receive blinded listening
  review for Brent identity, naturalness, prosody, pronunciation, artifacts,
  omissions/repetitions, and long-form drift.
- Automated WER, speaker embeddings, and predicted MOS may be added as
  diagnostics, but must not replace listening.
- The exact machine-readable settings are in `tools/tts_bakeoff/models.json`.
- Full manifests, package freezes, GPU telemetry, per-sample measurements,
  checkpoint file hashes, and WAVs remain under the remote evidence root.
- A deterministic blinded first-repeat bundle is ready at
  `/home/imprynt/tts-bakeoff/results/listening-20260809`; complete
  `ratings.csv` before opening `DO_NOT_OPEN_UNTIL_RATED-key.json`.

Primary setup sources: [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS),
[VoxCPM2](https://github.com/OpenBMB/VoxCPM),
[MOSS-TTS](https://github.com/OpenMOSS/MOSS-TTS),
[Chatterbox](https://github.com/resemble-ai/chatterbox), and
[SGLang-Omni](https://github.com/sgl-project/sglang-omni).
