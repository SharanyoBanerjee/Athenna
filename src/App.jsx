import { useEffect, useRef, useState } from "react";
import "./App.css";

// Snapshot monitoring settings
const SNAPSHOT_INTERVAL_MS = 30_000; // capture every 30 seconds
const PREVIEW_DURATION_MS = 3_000; // show each capture on screen for 3 seconds

// Exam backend server settings
const API_BASE = "http://localhost:3000";
const STUDENT = { userId: "student-101", name: "User" };

function App() {
  const videoRef = useRef(null);
  const previewTimeoutRef = useRef(null);

  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [snapshotPreview, setSnapshotPreview] = useState(null);

  // Exam state
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({}); // { [questionId]: selectedOptionIndex }
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [examError, setExamError] = useState(null);

  const submitExamRef = useRef(null);

  useEffect(() => {
    submitExamRef.current = submitExam;
  });

  // Countdown timer synced with Electron main process
  useEffect(() => {
    if (!started) return;

    const interval = setInterval(async () => {
      if (window.electronAPI?.getRemainingTime) {
        const remaining = await window.electronAPI.getRemainingTime();
        setTime(remaining);

        if (remaining <= 0) {
          submitExamRef.current?.();
        }
      } else {
        setTime((prev) => {
          if (prev <= 1000) {
            submitExamRef.current?.();
            return 0;
          }
          return prev - 1000;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [started]);

  // Periodic proctoring snapshot capture
  useEffect(() => {
    if (!started || !cameraReady) return;

    async function saveSnapshot() {
      try {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        if (window.electronAPI?.saveSnapshot) {
          await window.electronAPI.saveSnapshot(dataUrl);
        }

        // Display brief preview cue for transparency
        setSnapshotPreview(dataUrl);
        clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = setTimeout(
          () => setSnapshotPreview(null),
          PREVIEW_DURATION_MS
        );
      } catch (err) {
        console.error("Snapshot failed:", err);
      }
    }

    saveSnapshot(); // Initial snapshot on start
    const interval = setInterval(saveSnapshot, SNAPSHOT_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      clearTimeout(previewTimeoutRef.current);
    };
  }, [started, cameraReady]);

  async function getCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraReady(true);
    } catch (err) {
      console.error("Camera access failed:", err);
      setExamError("Could not access camera. Please allow camera permissions.");
    }
  }

  async function getFullscreen() {
    if (window.electronAPI?.setFullScreen) {
      await window.electronAPI.setFullScreen();
    }
  }

  async function startTest() {
    if (window.electronAPI?.showRules) {
      const res = await window.electronAPI.showRules();
      const response = typeof res === "object" ? res.response : res;
      if (response !== 0) return; // Student declined exam instructions
    }

    setExamError(null);
    try {
      // 1. Initialize session on Express backend
      const startRes = await fetch(`${API_BASE}/exam/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(STUDENT),
      });

      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.message || "Failed to start exam");

      // 2. Fetch MCQ question list
      const questionsRes = await fetch(`${API_BASE}/exam/mcq`);
      if (!questionsRes.ok) throw new Error("Failed to load questions");
      const questionList = await questionsRes.json();

      // 3. Start timer in Electron Main
      let remaining = 60 * 60 * 1000;
      if (window.electronAPI?.startTest) {
        remaining = await window.electronAPI.startTest();
      }

      setSessionId(startData.sessionId);
      setQuestions(questionList);
      setTime(remaining);
      setStarted(true);
    } catch (err) {
      console.error("Failed to start exam:", err);
      setExamError("Could not connect to exam server. Is Backend/server.js running on port 3000?");
    }
  }

  async function handleSelect(optionIndex) {
    const question = questions[current];
    if (!question || submitting || result) return;
    if (answers[question.id] !== undefined) return; // Answer already recorded

    try {
      const res = await fetch(`${API_BASE}/exam/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          questionId: question.id,
          selectedAnswer: optionIndex,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Answer rejected:", data.message);
        return;
      }

      setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }));
      setCurrent((c) => Math.min(c + 1, questions.length - 1));
    } catch (err) {
      console.error("Failed to record answer:", err);
    }
  }

  async function submitExam() {
    if (!sessionId || submitting || result) return;
    setSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/exam/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult(data.result);
      } else {
        console.error("Submission failed:", data.message);
      }
    } catch (err) {
      console.error("Failed to submit exam:", err);
    } finally {
      setSubmitting(false);
    }
  }

  function formatTimeLeft(ms) {
    const clamped = Math.max(0, ms);
    const seconds = Math.floor((clamped / 1000) % 60)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor((clamped / (1000 * 60)) % 60)
      .toString()
      .padStart(2, "0");
    const hours = Math.floor(clamped / (1000 * 60 * 60))
      .toString()
      .padStart(2, "0");

    return `${hours}:${minutes}:${seconds}`;
  }

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cameraReady && !started ? "video-preview" : "hidden-video"}
      />

      {/* Visual cue that camera monitoring is active */}
      {started && cameraReady && (
        <div className="monitoring-indicator">
          <span className="rec-dot" />
          Camera monitored
        </div>
      )}

      {snapshotPreview && (
        <div className="snapshot-flash">
          <img src={snapshotPreview} alt="Camera snapshot" />
          <span>Snapshot saved</span>
        </div>
      )}

      {started ? (
        <div className="exam-page">
          <div className="exam-container">
            {result ? (
              <div className="question-card">
                <h2>Exam Submitted Successfully</h2>
                <p>
                  Attempted: {result.attempted} · Correct: {result.correct} · Wrong: {result.wrong}
                </p>
              </div>
            ) : questions.length === 0 ? (
              <div className="question-card">
                <h2>Exam Status</h2>
                <p>{examError || "Loading exam questions…"}</p>
              </div>
            ) : (
              <>
                <div className="exam-header">
                  <h3>
                    Question {current + 1} of {questions.length} — Time Left: {formatTimeLeft(time)}
                  </h3>
                  <button
                    className="end-test-btn"
                    onClick={submitExam}
                    disabled={submitting}
                  >
                    End Test
                  </button>
                </div>

                <div className="question-card">
                  <h2>Question {current + 1}</h2>
                  <p>{questions[current].question}</p>

                  {questions[current].options.map((option, optionIndex) => (
                    <label
                      key={optionIndex}
                      className="option-row"
                      onClick={() => handleSelect(optionIndex)}
                    >
                      <input
                        type="radio"
                        name={`question-${questions[current].id}`}
                        checked={answers[questions[current].id] === optionIndex}
                        readOnly
                      />
                      <span>{option}</span>
                    </label>
                  ))}

                  <div className="navigation-buttons">
                    <button
                      onClick={() => setCurrent((c) => c - 1)}
                      disabled={current === 0}
                    >
                      Previous
                    </button>
                    {current === questions.length - 1 ? (
                      <button onClick={submitExam} disabled={submitting}>
                        Submit Exam
                      </button>
                    ) : (
                      <button onClick={() => setCurrent((c) => c + 1)}>
                        Next
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="page-container">
          <div className="header-section">
            <h1>Hi User!</h1>
            <p>Kindly Allow the following Permissions to Start the test:</p>
          </div>

          <div className="card-container">
            <div className="permission-item">
              <div className="permission-icon">↗</div>
              <div className="permission-content">
                <h3>Configure Camera</h3>
                <p>Kindly configure Camera to attempt quiz/contests.</p>
                <div className="action-row">
                  <button onClick={getCamera} className="btn btn-dark">
                    {cameraReady ? "Camera Connected" : "Get Camera Access"}
                  </button>
                </div>
              </div>
            </div>

            <div className="divider" />

            <div className="permission-item">
              <div className="permission-icon">⛶</div>
              <div className="permission-content">
                <h3>Switch to full screen</h3>
                <p>Kindly close all tabs and switch to full screen.</p>
                <button onClick={getFullscreen} className="btn btn-light-blue">
                  Give Full Screen Permissions
                </button>
              </div>
            </div>
          </div>

          <div className="bottom-actions">
            <button
              onClick={startTest}
              className="btn btn-light-blue"
              disabled={!cameraReady}
            >
              Go To Test
            </button>
            <button className="btn btn-outline">Need Help?</button>
          </div>

          {examError && <p className="error-text">{examError}</p>}
          <p className="timer-preview">Time Left : {formatTimeLeft(time)}</p>
        </div>
      )}
    </>
  );
}

export default App;
