# Codex Blanche

A serverless AI client built for personal use.

This repository exists mainly to host the app.
If you want to use it, feel free.

---

## Live

👉 https://YOUR_USERNAME.github.io/YOUR_REPO/

---

## Features

* Fully client-side (no backend)
* API keys stored locally (sessionStorage)
* Google Drive sync for settings and chat history
* Supports both Gemini and OpenAI models
* Fine control over system prompt, temperature, and context
* Built-in developer logs

---

## Philosophy

* The app is just a framework
* Your data belongs to you
* No lock-in, no backend dependency

This is **not** a beginner-friendly product.

---

## Setup

1. Prepare your API key

   * Gemini or OpenAI

2. Open the app

3. Configure in settings

   * API key
   * Model
   * (Optional) Google Client ID

4. (Optional) Enable Google Drive sync

---

## Features

### Core

- AI Chat (Gemini / OpenAI)
  - Switch between providers
  - Select models per provider
  - Unified chat interface

- System Prompt Control
  - Custom system instructions
  - Preset system personas
  - Save and reuse configurations

- Generation Settings
  - Temperature control
  - Max token (context length) control

---

### Data & Persistence

- Local State Management
  - Chat sessions stored in browser storage
  - Personas and settings persisted locally

- Google Drive Sync
  - Sync sessions and settings across devices
  - Automatic push / pull on login
  - Conflict handling using timestamps

- Session-Based API Key Storage
  - API keys stored in sessionStorage
  - Cleared when browser session ends

---

### Chat Experience

- Editable Messages
  - Inline editing of past messages
  - Changes are persisted automatically

- Regenerate Responses
  - Retry AI responses from any point

- Session Management
  - Multiple chat sessions
  - Rename, delete, pin sessions

---

### UI / UX

- Minimal, Focused Interface
  - Chat-first layout
  - Mobile-friendly design

- Dark / Light Mode
  - Toggleable theme

- Persona Panel
  - Sidebar for switching presets and sessions
  - Search within chat history

---

### Developer Features

- Built-in Log Viewer
  - Captures console logs (log / warn / error)
  - Accessible via advanced settings

- Error Handling
  - API error messages surfaced in UI
  - Abortable requests (cancel generation)

- Modular Structure
  - Separated UI / API / Sync logic
  - Dependency-injected sync module

---

### Architecture

- Fully Client-Side
  - No backend required

- User-Owned Data
  - No server-side storage
  - Optional cloud sync via user’s Google Drive

- Simple Sync Model
  - Timestamp-based conflict resolution
  - Tombstone-based deletion handling

---

## Notes

* API keys are stored in browser session storage
* Security is your responsibility
* Sync is intentionally simple and may not handle complex conflicts

---

## Tech Stack

* Vanilla JavaScript
* Google Drive API
* Gemini API / OpenAI API
* TailwindCSS

---

## Disclaimer

Use at your own risk.
No guarantees, no responsibilities.

---

## Contributing

Feel free to fork, modify, or translate.

---

## Why this exists

Because I needed it.
