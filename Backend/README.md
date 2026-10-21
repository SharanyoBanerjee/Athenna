# Exam Backend

A lightweight Express REST API for the Athena examination and proctoring application.

It uses file-based JSON persistence (`Backend/data/`) for storing question banks and active/submitted student exam sessions.

## Folder Structure

```text
Backend/
├── data/
│   ├── questions.json
│   └── sessions.json
├── package.json
├── server.js
└── README.md
```

## Setup & Running

```bash
cd Backend
npm install
npm start
```

Default port: `http://localhost:3000`

## REST Endpoints

- `POST /exam/start` — Initializes a new exam session (`{ userId, name }`). Returns `sessionId`.
- `GET /exam/mcq` — Retrieves all questions with choices (omits `correctAnswer`).
- `GET /exam/mcq/:id` — Retrieves a single question.
- `POST /exam/answer` — Submits and verifies student answer (`{ sessionId, questionId, selectedAnswer }`).
- `GET /exam/session/:sessionId` — Queries progress and details of a session.
- `POST /exam/submit` — Finalizes and scores the entire exam session (`{ sessionId }`).
