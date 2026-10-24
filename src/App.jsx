import { useEffect, useRef, useState } from "react";
import "./App.css";

// Snapshot monitoring settings
const SNAPSHOT_INTERVAL_MS = 30_000; // capture every 30 seconds
const PREVIEW_DURATION_MS = 3_000; // show each capture on screen for 3 seconds

function App() {
  const videoRef = useRef(null);
  const previewTimeoutRef = useRef(null);

  const [started, setStarted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [snapshotPreview, setSnapshotPreview] = useState(null);

  // Periodically capture a camera snapshot and save it to disk
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

        // Show the captured frame briefly so the user knows it was taken
        setSnapshotPreview(dataUrl);
        clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = setTimeout(
          () => setSnapshotPreview(null),
          PREVIEW_DURATION_MS
        );
      } catch (err) {
        console.error("Snapshot capture failed:", err);
      }
    }

    saveSnapshot(); // Capture initial snapshot
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
    }
  }

  async function getFullscreen() {
    if (window.electronAPI?.setFullScreen) {
      await window.electronAPI.setFullScreen();
    }
  }

  async function startProctoring() {
    if (window.electronAPI?.showRules) {
      const res = await window.electronAPI.showRules();
      const response = typeof res === "object" ? res.response : res;
      if (response !== 0) return; // User declined
    }
    setStarted(true);
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

      <div className="page-container">
        <div className="header-section">
          <h1>Athena Proctor Setup</h1>
          <p>Configure device permissions before beginning the assessment</p>
        </div>

        <div className="card-container">
          <div className="permission-item">
            <div className="permission-icon">↗</div>
            <div className="permission-content">
              <h3>Configure Camera</h3>
              <p>Webcam verification is required for automated proctoring snapshots.</p>
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
              <h3>Switch to Full Screen</h3>
              <p>Lock window into full-screen kiosk mode for secure testing.</p>
              <button onClick={getFullscreen} className="btn btn-light-blue">
                Give Full Screen Permissions
              </button>
            </div>
          </div>
        </div>

        <div className="bottom-actions">
          <button
            onClick={startProctoring}
            className="btn btn-light-blue"
            disabled={!cameraReady}
          >
            Start Session
          </button>
        </div>
      </div>
    </>
  );
}

export default App;
