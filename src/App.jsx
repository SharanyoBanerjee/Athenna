import { useEffect, useRef, useState } from "react";
import "./App.css";

// Snapshot monitoring settings
const SNAPSHOT_INTERVAL_MS = 30_000; // capture every 30 seconds
const PREVIEW_DURATION_MS = 3_000; // show each capture on screen for 3 seconds
const EXAM_DURATION_MS = 90 * 60 * 1000; // 1 hour 30 mins

// Fallback questions if backend is starting or offline
const SAMPLE_QUESTIONS = [
  {
    id: 1,
    question: "Which Electron process is responsible for creating BrowserWindow?",
    options: ["Renderer Process", "Main Process", "React Process", "Preload Process"],
  },
  {
    id: 2,
    question: "Which Electron API is commonly used in the renderer to invoke a handler in the main process?",
    options: ["ipcRenderer.invoke", "BrowserWindow.loadURL", "fs.writeFileSync", "dialog.showMessageBox"],
  },
  {
    id: 3,
    question: "Why is a preload script commonly used in Electron?",
    options: ["To style the React application", "To expose controlled APIs safely to the renderer", "To create the Express server", "To replace the main process"],
  },
  {
    id: 4,
    question: "Which HTTP method is normally used to fetch exam questions?",
    options: ["GET", "DELETE", "PATCH", "CONNECT"],
  },
  {
    id: 5,
    question: "What does fs.writeFileSync() do?",
    options: ["Reads camera frames", "Writes data to a file and waits until it finishes", "Starts the Electron renderer", "Sends an IPC event"],
  },
];

// Exam backend server settings
const API_BASE = "http://localhost:3000";
const STUDENT = { userId: "student-101", name: "User" };

function App() {
  const videoRef = useRef(null);
  const previewTimeoutRef = useRef(null);

  // Setup permissions state
  const [cameraReady, setCameraReady] = useState(false);
  const [fullscreenReady, setFullscreenReady] = useState(false);

  // Modals state
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [closeCountdown, setCloseCountdown] = useState(5);

  // Exam state
  const [time, setTime] = useState(EXAM_DURATION_MS);
  const [started, setStarted] = useState(false);
  const [snapshotPreview, setSnapshotPreview] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [questions, setQuestions] = useState(SAMPLE_QUESTIONS);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({}); // { [questionId]: selectedOptionIndex }
  const [visited, setVisited] = useState(new Set()); // Set of question IDs
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [examError, setExamError] = useState(null);

  const submitExamRef = useRef(null);

  useEffect(() => {
    submitExamRef.current = handleFinishTest;
  });

  // Automatically mark current question as visited
  useEffect(() => {
    if (started && questions.length > 0) {
      const activeId = questions[current]?.id;
      if (activeId !== undefined) {
        setVisited((prev) => {
          if (prev.has(activeId)) return prev;
          const next = new Set(prev);
          next.add(activeId);
          return next;
        });
      }
    }
  }, [started, current, questions]);

  // Countdown timer synced with Electron main process
  useEffect(() => {
    if (!started || showFinishModal) return;

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
  }, [started, showFinishModal]);

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

  // Handle countdown & app closure after finishing exam
  useEffect(() => {
    if (!showFinishModal) return;

    const countdownTimer = setInterval(() => {
      setCloseCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownTimer);
          if (window.electronAPI?.closeApp) {
            window.electronAPI.closeApp();
          } else {
            window.close();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownTimer);
  }, [showFinishModal]);

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
    try {
      if (window.electronAPI?.setFullScreen) {
        await window.electronAPI.setFullScreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setFullscreenReady(true);
    } catch (err) {
      console.error("Fullscreen failed:", err);
    }
  }

  function handleOpenTerms() {
    if (!cameraReady || !fullscreenReady) return;
    setShowTermsModal(true);
  }

  async function confirmStartExam() {
    setShowTermsModal(false);
    setExamError(null);

    try {
      // 1. Initialize session on Express backend
      let activeSessionId = null;
      try {
        const startRes = await fetch(`${API_BASE}/exam/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(STUDENT),
        });
        const startData = await startRes.json();
        if (startRes.ok && startData.sessionId) {
          activeSessionId = startData.sessionId;
          setSessionId(startData.sessionId);
        }
      } catch (err) {
        console.warn("Backend start session unreachable, using offline mode", err);
      }

      // 2. Fetch MCQ question list
      try {
        const questionsRes = await fetch(`${API_BASE}/exam/mcq`);
        if (questionsRes.ok) {
          const questionList = await questionsRes.json();
          if (Array.isArray(questionList) && questionList.length > 0) {
            setQuestions(questionList);
          }
        }
      } catch (err) {
        console.warn("Backend questions fetch unreachable, using sample questions", err);
      }

      // 3. Start timer in Electron Main (1 hour 30 mins = 90 mins)
      let remaining = EXAM_DURATION_MS;
      if (window.electronAPI?.startTest) {
        remaining = await window.electronAPI.startTest();
      }

      setTime(remaining);
      setStarted(true);

      // Initialize visited with the first question
      setVisited(new Set([1]));
    } catch (err) {
      console.error("Failed to start exam:", err);
      setExamError("Failed to initialize exam session.");
    }
  }

  async function handleSelect(optionIndex) {
    const question = questions[current];
    if (!question || submitting || result || showFinishModal) return;
    if (answers[question.id] !== undefined) return; // Answer already recorded

    setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }));

    // Send answer to backend if connected
    if (sessionId) {
      try {
        await fetch(`${API_BASE}/exam/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            questionId: question.id,
            selectedAnswer: optionIndex,
          }),
        });
      } catch (err) {
        console.error("Failed to record answer on backend:", err);
      }
    }

    if (current < questions.length - 1) {
      setCurrent((c) => c + 1);
    }
  }

  async function handleFinishTest() {
    if (submitting || showFinishModal) return;
    setSubmitting(true);

    try {
      if (sessionId) {
        const res = await fetch(`${API_BASE}/exam/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json();
        if (res.ok && data.result) {
          setResult(data.result);
        }
      }
    } catch (err) {
      console.error("Failed to submit exam:", err);
    } finally {
      setSubmitting(false);
      setShowFinishModal(true);
      setCloseCountdown(5);
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

  const allQuestionsVisited =
    questions.length > 0 && questions.every((q) => visited.has(q.id));

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

      {/* Terms and Conditions Modal */}
      {showTermsModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <span className="modal-icon">📜</span>
              <h2>Examination Terms & Conditions</h2>
            </div>
            <p className="modal-subtitle">
              Please carefully review the exam guidelines before starting.
            </p>

            <div className="terms-list">
              <div className="term-item">
                <span className="term-number">1</span>
                <div>
                  <strong>Continuous Camera Monitoring:</strong> Your webcam will periodically capture verification snapshots throughout the session.
                </div>
              </div>
              <div className="term-item">
                <span className="term-number">2</span>
                <div>
                  <strong>Fullscreen Lock:</strong> Leaving fullscreen mode or switching tabs is strictly monitored and flagged as an irregularity.
                </div>
              </div>
              <div className="term-item">
                <span className="term-number">3</span>
                <div>
                  <strong>Question Completion:</strong> All 5 questions must be visited before the Finish Test option becomes accessible.
                </div>
              </div>
              <div className="term-item">
                <span className="term-number">4</span>
                <div>
                  <strong>Time Limit:</strong> You will have 1 hour 30 minutes (90 minutes) to complete the test.
                </div>
              </div>
              <div className="term-item">
                <span className="term-number">5</span>
                <div>
                  <strong>Auto Submission:</strong> When time expires or when you click Finish Test, your examination will conclude.
                </div>
              </div>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
              />
              <span>I have read, understood, and accept all examination terms and conditions.</span>
            </label>

            <div className="modal-actions">
              <button
                className="btn btn-outline"
                onClick={() => setShowTermsModal(false)}
              >
                Decline & Back
              </button>
              <button
                className="btn btn-dark"
                disabled={!acceptedTerms}
                onClick={confirmStartExam}
              >
                Accept & Start Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finish Test Modal */}
      {showFinishModal && (
        <div className="modal-overlay">
          <div className="modal-card finish-modal-card">
            <div className="finish-icon-wrap">✓</div>
            <h2 className="finish-title">Exam finished</h2>
            <p className="finish-desc">
              Your examination has been completed and recorded successfully.
            </p>
            {result && (
              <div className="finish-stats">
                <span>Attempted: {result.attempted}</span>
                <span>Correct: {result.correct}</span>
                <span>Wrong: {result.wrong}</span>
              </div>
            )}
            <div className="countdown-badge">
              app closes after {closeCountdown} seconds
            </div>
          </div>
        </div>
      )}

      {started ? (
        <div className="exam-page">
          <div className="exam-container">
            <div className="exam-header">
              <div className="exam-title-meta">
                <h3>
                  Question {current + 1} of {questions.length}
                </h3>
                <span className="timer-badge">
                  ⏱ Time Left: {formatTimeLeft(time)}
                </span>
              </div>

              <div className="finish-btn-wrapper">
                <button
                  className="end-test-btn"
                  onClick={handleFinishTest}
                  disabled={!allQuestionsVisited || submitting}
                  title={
                    !allQuestionsVisited
                      ? "Visit all questions to unlock Finish Test"
                      : "Finish and submit exam"
                  }
                >
                  Finish Test
                </button>
                {!allQuestionsVisited && (
                  <span className="visited-hint">
                    Visited: {visited.size}/{questions.length}
                  </span>
                )}
              </div>
            </div>

            {/* Question Navigator Palette */}
            <div className="question-nav-palette">
              <span className="palette-label">Question Palette:</span>
              <div className="palette-pills">
                {questions.map((q, idx) => {
                  const isCurrent = current === idx;
                  const isVisited = visited.has(q.id);
                  const isAnswered = answers[q.id] !== undefined;

                  let statusClass = "unvisited";
                  if (isCurrent) statusClass = "active";
                  else if (isAnswered) statusClass = "answered";
                  else if (isVisited) statusClass = "visited";

                  return (
                    <button
                      key={q.id}
                      className={`palette-pill ${statusClass}`}
                      onClick={() => setCurrent(idx)}
                    >
                      {idx + 1}
                      {isAnswered && <span className="pill-check">✓</span>}
                    </button>
                  );
                })}
              </div>
              <div className="palette-legend">
                <span className="legend-item"><span className="legend-dot active" /> Current</span>
                <span className="legend-item"><span className="legend-dot visited" /> Visited</span>
                <span className="legend-item"><span className="legend-dot answered" /> Answered</span>
              </div>
            </div>

            <div className="question-card">
              <h2>Question {current + 1} of {questions.length}</h2>
              <p>{questions[current]?.question}</p>

              {questions[current]?.options.map((option, optionIndex) => (
                <label
                  key={optionIndex}
                  className={`option-row ${
                    answers[questions[current].id] === optionIndex ? "selected" : ""
                  }`}
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
                  <button
                    onClick={handleFinishTest}
                    disabled={!allQuestionsVisited || submitting}
                    className="btn-accent-finish"
                  >
                    Finish Test
                  </button>
                ) : (
                  <button onClick={() => setCurrent((c) => c + 1)}>
                    Next
                  </button>
                )}
              </div>
            </div>
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
                  <button
                    onClick={getCamera}
                    className={`btn ${cameraReady ? "btn-success" : "btn-dark"}`}
                  >
                    {cameraReady ? "✓ Camera Connected" : "Get Camera Access"}
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
                <button
                  onClick={getFullscreen}
                  className={`btn ${fullscreenReady ? "btn-success" : "btn-light-blue"}`}
                >
                  {fullscreenReady ? "✓ Full Screen Enabled" : "Give Full Screen Permissions"}
                </button>
              </div>
            </div>
          </div>

          <div className="bottom-actions">
            <button
              onClick={handleOpenTerms}
              className="btn btn-light-blue start-test-btn"
              disabled={!cameraReady || !fullscreenReady}
            >
              Start Test
            </button>
            <button className="btn btn-outline">Need Help?</button>
          </div>

          {(!cameraReady || !fullscreenReady) && (
            <p className="permission-hint">
              * Please enable both Camera and Full Screen permissions to unlock the Start Test button.
            </p>
          )}

          {examError && <p className="error-text">{examError}</p>}
          <p className="timer-preview">Initial Test Duration: {formatTimeLeft(time)}</p>
        </div>
      )}
    </>
  );
}

export default App;
