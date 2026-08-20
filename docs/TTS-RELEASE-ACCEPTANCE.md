# TTS release acceptance matrix

This file is the release gate for user-visible TTS changes. A version must not be tagged until every relevant row has evidence.

## Supported contract

| Platform | Provider | Voice scope | Preview | Reading |
|---|---|---|---|---|
| macOS / Windows | System voice | Chinese and English only | Uses selected system voice and matching sample language | Supported |
| macOS / Windows | Edge CLI | Curated Chinese (台灣／大陸／香港) then English | Uses Edge CLI, not Web Speech | Supported when `edge-tts` is installed and online |
| macOS / Windows / iPhone / iPad | Azure Speech API | Curated Chinese (台灣／大陸／香港) then English | Uses the user's Key, Region and selected Azure voice | Supported with a valid Azure Speech resource |
| iPhone / iPad | System voice | Chinese and English only | Uses selected system voice and matching sample language | Supported |
| iPhone / iPad | Edge CLI | Not available | Falls back to system voice | Falls back to system voice |
| Android | System voice | N/A | Existing actionable unsupported message | Existing actionable unsupported message |

## Invariants

1. System-voice dropdown exposes Chinese and English only. Legacy preferences for other languages fall back to the recommended Chinese voice.
2. Selecting any provider's voice immediately previews it. Edge and Azure use dropdowns, never free-text voice input.
3. The selected provider owns both preview and reading. A preview must never silently use a different provider.
4. Preview controls are the first settings block and include adjacent, labelled play and stop buttons.
5. Edge-only controls appear only when Edge CLI is the effective desktop provider. Azure Key／Region／Voice controls appear only in Azure mode, and the Key input is masked.
6. Cloud voice controls put all listed Chinese voices (台灣／大陸／香港) before English; dialect, cartoon and character voices are excluded.
7. Stop must cancel local Web Speech and release any Edge/Azure preview audio.
8. Edge’s no-Key / local CLI limitation and Azure’s Key/Region, local-storage and billing boundary remain documented.
9. Support diagnostics contain only plugin／Obsidian version, platform, provider, voice, rate, pitch, stage, stable error code and an app-generated safe summary. They must never include note text, Azure Key, Vault name, complete private paths or raw stderr.
10. Environment checks exercise the selected provider without changing or persisting provider, voice, rate or pitch. FAQ content remains collapsed until the user opens a question.

## Release evidence

- `npm test`, `npm run lint`, `npm run build`, and `git diff --check` pass with no warnings or errors.
- Real Edge CLI generates non-empty Chinese and English MP3 files.
- Azure API contract test verifies its official endpoint, Key header, SSML escaping and that the Key is never inserted into SSML or logs. A real Azure synthesis test requires the user's own Key and is recorded separately without exposing it.
- Desktop Obsidian manual smoke test: system Chinese preview, system English preview, stop, Edge preview, Edge stop, and one full note playback.
- Support smoke test: local readiness, Edge synthesis plus audio start, Azure missing-credential failure, selectable safe diagnostic handoff without programmatic clipboard access, both declarative and legacy settings rendering, and no runtime errors.
- iPhone/iPad smoke test: system preview and reading; Edge selection remains safely on system voice.
- GitHub Actions release succeeds, and all release assets return HTTP 200.
