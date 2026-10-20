import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="page-container">
      <div className="header-section">
        <h1>Athena Exam Proctor</h1>
        <p>Secure Computer-Based Testing Environment</p>
      </div>
      <div className="card-container">
        <div className="permission-item">
          <div className="permission-content">
            <h3>Welcome to Athena</h3>
            <p>System initialization in progress. Please ensure webcam permissions are enabled.</p>
            <button className="btn btn-dark" onClick={() => setCount((c) => c + 1)}>
              Status Check ({count})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
