# Codex Blanche

**English** | [日本語](README.md)

## Legal

- **Source code license**: [MIT License](LICENSE) (copyright **Belleval office**; permissive—retain the copyright and permission notices when redistributing)
- **Redistribution**: In addition to the MIT requirements, **keep clear credit that the software originates from Belleval office and this repository**. Do not strip attribution or imply, in public statements or branding, that you are the sole original author of this project (“passing off”).
- [Terms of Service (Markdown)](docs/TERMS_OF_SERVICE.en.md) · [日本語](docs/TERMS_OF_SERVICE.md)
- [Privacy Policy (Markdown)](docs/PRIVACY_POLICY.en.md) · [日本語](docs/PRIVACY_POLICY.md)
- **Deployed pages**: [Terms](https://tamari-log.github.io/Codex-Blanche/terms.html) · [Privacy](https://tamari-log.github.io/Codex-Blanche/privacy.html)

| | Repository |
|---|------------|
| **Web app (this repo)** | [Tamari-log/Codex-Blanche](https://github.com/Tamari-log/Codex-Blanche) |
| **Android app** | [Tamari-log/Codex-Blanche-App](https://github.com/Tamari-log/Codex-Blanche-App) |

---

A serverless AI chat app that runs entirely in the browser.  
It is built for personal use, but anyone can use it.

- Live: https://tamari-log.github.io/Codex-Blanche/

---

## What You Can Do

### 1) Chat with AI

- Switch between Gemini and OpenAI
- Choose models per provider
- Streaming output (for supported providers)
- Stop generation while running
- Regenerate from any message point

### 2) Control Output Behavior

- System prompt configuration
- Temperature control
- Max tokens (context length) control
- Thinking level selection (low / medium / high)
  - Used with OpenAI reasoning models

### 3) Manage Presets and Conversations

- Create, edit, and delete custom presets
- Per-conversation setting editor (ellipsis menu)
- Rename / delete / pin conversations
- Carry preset settings into conversation overrides
  - model / search flags / temperature / tokens / thinking level / signature

### 4) Attach, Import, and Export

- Image attachments
- File attachments (text extraction before sending)
  - txt / md / json / csv / source code / pdf / docx, etc.
- History import (`.js` / `.json`)
- Developer JSON extraction tools
  - extract conversation JSON by world setting
  - extract conversation-history-only JSON

### 5) Storage and Sync

- Fully client-side (no backend required)
- Local persistence for chats, settings, and presets
- Optional Google Drive sync
  - sync after login
  - timestamp-based conflict handling

### 6) UI / UX

- Mobile-friendly layout
- Dark / light theme
- Adjustable text render speed
- Scroll-to-bottom shortcut button
- Sidebar panel with history search

### 7) Developer Utilities

- In-app log viewer
- Visible API error feedback
- Modular structure (UI / API / Sync / State / DOM)

---

## Quick Start

1. Open the app  
2. Enter your API key in settings (Gemini or OpenAI)  
3. Choose provider and model  
4. Optionally configure system prompt, temperature, tokens, and thinking level  
5. Send your first message  

If you want Drive sync, set Google Client ID and connect Google in settings.

---

## Where to Configure Things

- `Settings > Custom Preset Creation > Model Settings`
  - provider / model / thinking level
- `Settings > Custom Preset Creation > Behavior`
  - system prompt / temperature
- `Settings > Custom Preset Creation > Context / Signature`
  - max tokens / signature
- `Settings > New Conversation Model Settings`
  - default model for new conversations
- `Preset Panel > Ellipsis Menu`
  - edit conversation settings / edit preset / pin / delete

---

## Data and Security

- API keys are stored in `sessionStorage` (or `localStorage` if enabled)
- Input text and attachment data are sent to the selected AI API during generation
- The app is not designed to store your chat data on a developer backend
- If sync is enabled, data is stored in your own Google Drive
- You are responsible for your own security operations

### About Safety Settings

- This app sends Gemini requests with `safetySettings` disabled
- Use only with clear understanding of your policy and operational responsibility

---

## Tech Stack

- Vanilla JavaScript
- Tailwind CSS
- Gemini API
- OpenAI API
- Google Drive API

---

---

## Disclaimer

See the Terms of Service under **Legal** above. Full text: [Terms (Markdown)](docs/TERMS_OF_SERVICE.en.md) and [terms.html](https://tamari-log.github.io/Codex-Blanche/terms.html).

