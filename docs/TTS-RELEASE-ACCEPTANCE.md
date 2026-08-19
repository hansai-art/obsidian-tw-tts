# TTS release acceptance matrix

This file is the release gate for user-visible TTS changes. A version must not be tagged until every relevant row has evidence.

## Supported contract

| Platform | Provider | Voice scope | Preview | Reading |
|---|---|---|---|---|
| macOS / Windows | System voice | Chinese and English only | Uses selected system voice and matching sample language | Supported |
| macOS / Windows | Edge CLI | User-selected Edge voice; Chinese and English are documented defaults | Uses Edge CLI, not Web Speech | Supported when `edge-tts` is installed and online |
| iPhone / iPad | System voice | Chinese and English only | Uses selected system voice and matching sample language | Supported |
| iPhone / iPad | Edge CLI | Not available | Falls back to system voice | Falls back to system voice |
| Android | System voice | N/A | Existing actionable unsupported message | Existing actionable unsupported message |

## Invariants

1. System-voice dropdown exposes Chinese and English only. Legacy preferences for other languages fall back to the recommended Chinese voice.
2. Selecting a system voice immediately previews it. Edge voice is free text, so it is previewed only from the explicit button, never once per typed character.
3. The selected provider owns both preview and reading. A preview must never silently use a different provider.
4. Preview controls are the first settings block and include adjacent, labelled play and stop buttons.
5. Edge-only controls appear only when Edge CLI is the effective desktop provider. System-voice controls appear only in system mode.
6. Stop must cancel local Web Speech and release any Edge preview audio.
7. Online Edge text transmission and its no-SLA status remain documented.

## Release evidence

- `npm test`, `npm run lint`, `npm run build`, and `git diff --check` pass with no warnings or errors.
- Real Edge CLI generates non-empty Chinese and English MP3 files.
- Desktop Obsidian manual smoke test: system Chinese preview, system English preview, stop, Edge preview, Edge stop, and one full note playback.
- iPhone/iPad smoke test: system preview and reading; Edge selection remains safely on system voice.
- GitHub Actions release succeeds, and all release assets return HTTP 200.
