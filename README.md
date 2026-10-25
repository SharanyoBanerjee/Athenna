# Athena — Secure Exam Proctoring Desktop Application

Athena is a desktop-based examination and proctoring application built with **Electron**, **React (Vite)**, and an **Express (Node.js)** backend. It provides secure computer-based testing features including automated webcam snapshots, full-screen kiosk lock, native OS rule dialogs, and real-time exam session tracking.

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                       ELECTRON                              │
│                                                             │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │     Main Process      │       │    Preload Script     │  │
│  │  (electron/main.cjs)  │◄─────►│ (electron/preload.cjs)│  │
│  │   - Kiosk Window      │  IPC  │   - contextBridge     │  │
│  │   - Native Dialogs    │       │   - window.electronAPI│  │
│  │   - Snapshot Disk I/O │       └───────────┬───────────┘  │
│  └───────────────────────┘                   │              │
│                                              ▼              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │             Renderer Process (React + Vite)           │  │
│  │                  (http://localhost:5173)              │  │
│  │   - Webcam video feed & ImageCapture proctoring       │  │
│  │   - MCQ Navigation & Question Card UI                 │  │
│  │   - Timer Countdown synced with Electron              │  │
│  └───────────────────────────┬───────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────┘
                               │ HTTP REST
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXPRESS BACKEND                          │
│                 (http://localhost:3000)                     │
│   - Session tracking (Backend/data/sessions.json)           │
│   - Question Bank without answers (Backend/data/questions)  │
│   - Answer verification & scoring                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```text
Athenna/
├── Backend/
│   ├── data/
│   │   ├── questions.json     # Question bank (includes correctAnswer)
│   │   └── sessions.json      # Active and submitted student sessions
│   ├── package.json           # Express backend dependencies
│   ├── README.md              # Backend API documentation
│   └── server.js              # Express REST API server (Port 3000)
├── electron/
│   ├── main.cjs               # Electron Main process (Window, IPC, Disk I/O)
│   └── preload.cjs            # Secure contextBridge API exposed to React
├── public/                    # Static frontend assets
├── src/
│   ├── assets/
│   ├── App.css                # Application styles (split-pane, kiosk UI)
│   ├── App.jsx                # Core exam UI, timer, camera capture loop
│   ├── index.css              # Global styles & resets
│   └── main.jsx               # React entry point
├── eslint.config.js           # ESLint configuration
├── index.html                 # Vite HTML entry
├── package.json               # Frontend & Electron dependencies/scripts
├── vite.config.js             # Vite configuration with React plugin
└── README.md                  # This documentation
```

---

## Quick Start (Running the Application)

The application requires three services running concurrently:
1. **Express Backend** (`http://localhost:3000`)
2. **Vite Dev Server** (`http://localhost:5173`)
3. **Electron Desktop App**

### Single Command (Recommended)

```bash
npm run app
```

This concurrently boots:
- Express Backend on `http://localhost:3000`
- Vite React Dev Server on `http://localhost:5173`
- Electron Kiosk Window (waiting for Vite dev server ready signal via `wait-on`)

---

## Electron IPC API Reference

| Channel (`invoke`) | Sender | Purpose | Return Value |
|---|---|---|---|
| `full-screen` | Renderer | Sets Electron window to kiosk lock mode | `void` |
| `start-test` | Renderer | Initializes countdown timer timestamp in Main | `number` (remaining ms) |
| `get-time` | Renderer | Queries remaining exam time | `number` (remaining ms) |
| `show-rules` | Renderer | Displays native OS dialog with rules | `number` (0: Accept, 1: Decline) |
| `save-snapshot` | Renderer | Writes base64 JPEG snapshot to disk | `boolean` (success/failure) |

---

## Backend REST API Reference

| Endpoint | Method | Payload | Description |
|---|---|---|---|
| `/exam/start` | `POST` | `{ userId, name }` | Creates a new session and returns `sessionId` |
| `/exam/mcq` | `GET` | _None_ | Retrieves questions without `correctAnswer` |
| `/exam/mcq/:id` | `GET` | _None_ | Retrieves a single question |
| `/exam/answer` | `POST` | `{ sessionId, questionId, selectedAnswer }` | Records answer and updates score |
| `/exam/session/:id` | `GET` | _None_ | Returns current session state |
| `/exam/submit` | `POST` | `{ sessionId }` | Marks exam session as submitted and returns result |

---

## Troubleshooting

1. **`ERR_CONNECTION_REFUSED (http://localhost:5173/)`**:
   - Cause: Electron started before the Vite dev server was listening.
   - Solution: Use `npm run app` (configured with `wait-on http://localhost:5173`) or ensure `npm run dev` has output `Local: http://localhost:5173/` before launching Electron.

2. **Webcam not activating**:
   - Make sure your terminal or Electron has camera permissions in macOS System Settings (`Privacy & Security > Camera`).

3. **Exiting Kiosk Mode during development**:
   - DevTools window is detached by default. Use `Cmd + Q` (macOS) or `Alt + F4` (Windows/Linux) to exit kiosk mode.
