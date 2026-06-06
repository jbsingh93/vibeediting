# `generate/` — ElevenLabs audio generation + video thumbnails

Brand-voice TTS + BGM + SFX (ElevenLabs) + gpt-image-2 thumbnails.

| File | Purpose | Model (models.json) |
|---|---|---|
| `elevenlabs-tts.ts` ✅ | VO in YOUR brand voice (brand/brand.json → voice.elevenlabsVoiceId). | `eleven_multilingual_v2`, `eleven_v3` (`--v3`) |
| `elevenlabs-music.ts` ✅ | Instrumental BGM. | `music_v1` |
| `elevenlabs-sfx.ts` ✅ | Text-to-sound-effects. | `eleven_text_to_sound_v2` |
| `thumbnail.ts` ✅ | Video frame + prompt → thumbnail in the video's aspect, written next to the video as `<video_name> thumbnail.png`. | `image.thumbnail` → `gpt-image-2-2026-04-21` (env `OPENAI_IMAGE_MODEL`) — **reads the registry, not hardcoded** |

**I/O contract (audio):** prompt/text → audio file in `out/work/<project>/generate/` (or `public/<project>/…`
per the asset convention); loudnorm the final mix at delivery, not here. Voice cloning (IVC) needs
ElevenLabs Starter tier+. Key `ELEVENLABS_API_KEY` in `.env`.

**I/O contract (thumbnail):** finished video + creative direction → `<video_name> thumbnail.png` (+ `.jpg`
sibling if PNG >2 MB) **beside the video**, exact video aspect; frame + plan land in
`out/work/<project>/thumbnail/`. Key `OPENAI_API_KEY` in `.env`. NEVER send `input_fidelity` (gpt-image-2
removed it). Non-ASCII headline text (æ/ø/å …) → overlay in Remotion, not in-model. Prompting + CTR craft rules:
[`THUMBNAIL-GUIDE.md`](THUMBNAIL-GUIDE.md).
