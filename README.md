# Athena — Secure Exam Proctoring Desktop Application

Athena is a desktop-based examination and proctoring application built with **Electron**, **React (Vite)**, and an **Express (Node.js)** backend. It provides secure computer-based testing features including automated webcam snapshots, full-screen kiosk lock, in-app styled examination terms dialog, question visited status tracking, and a timed exam environment with automatic shutdown.

---

## Key Features

1. **Permissions Gating**:
   - The **Start Test** button remains disabled until both **Camera** access and **Full Screen** permissions are granted by the candidate.
2. **In-App Styled Terms & Conditions**:
   - Seamlessly integrated modal matching the application aesthetic. Displays examination guidelines and rules requiring candidate acceptance prior to starting.
3. **Timed 1h 30m Countdown**:
   - Countdown timer set to **1 hour 30 minutes** (90 minutes) synchronized with the Electron Main process via IPC.
4. **Question Visited Status & Navigation Palette**:
   - Presents 5 sample questions with options.
   - Interactive question palette tracks questions that are **Current**, **Visited**, or **Answered**.
   - Questions are automatically marked as visited when navigated or attempted.
5. **Locked Finish Test Flow**:
   - The **Finish Test** button is unlocked **only when all questions have been visited**.
6. **Graceful Completion & Auto-Close**:
   - On clicking Finish Test, displays an **"Exam finished"** dialog.
   - Shows the message **"app closes after 5 seconds"** with a live countdown before safely closing the Electron window.
7. **Proctoring Snapshots**:
   - Automated periodic webcam snapshots saved to disk in the user data directory with visual cues.

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
│  │   - 1h30m Exam Timer  │       │   - window.electronAPI│  │
│  │   - Snapshot Disk I/O │       └───────────┬───────────┘  │
│  │   - Close App Handler │                   │              │
│  └───────────────────────┘                   │              │
│                                              ▼              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │             Renderer Process (React + Vite)           │  │
│  │                  (http://localhost:5173)              │  │
│  │   - Permission Verification (Camera & Fullscreen)     │  │
│  │   - Styled Terms & Conditions Modal Dialog            │  │
│  │   - MCQ Question Navigation & Visited State Tracking  │  │
│  │   - Synchronized Timer & Proctoring Snapshots         │  │
│  │   - Exam Finished Modal & 5s Auto-Close Countdown     │  │
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
│   ├── main.cjs               # Electron Main process (Window, IPC, Disk I/O, Exit)
│   └── preload.cjs            # Secure contextBridge API exposed to React
├── public/                    # Static frontend assets
├── src/
│   ├── assets/
│   ├── App.css                # Application styles (Permissions, Modals, MCQ, Palette)
│   ├── App.jsx                # Core exam UI, timer, camera capture, visited logic
│   ├── index.css              # Global styles & resets
│   └── main.jsx               # React entry point
├── eslint.config.js           # ESLint configuration
├── index.html                 # Vite HTML entry
├── package.json               # Frontend & Electron dependencies/scripts
├── vite.config.js             # Vite configuration with React plugin
└── README.md                  # Comprehensive documentation
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
| `full-screen` | Renderer | Sets Electron window to kiosk lock mode | `boolean` |
| `start-test` | Renderer | Initializes 1h 30m countdown timer in Main | `number` (remaining ms) |
| `get-time` | Renderer | Queries remaining exam time | `number` (remaining ms) |
| `show-rules` | Renderer | Displays native OS dialog with rules (fallback) | `number` (0: Accept, 1: Decline) |
| `save-snapshot` | Renderer | Writes base64 JPEG snapshot to disk | `boolean` (success/failure) |
| `close-app` | Renderer | Gracefully quits the Electron desktop application | `void` |

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
