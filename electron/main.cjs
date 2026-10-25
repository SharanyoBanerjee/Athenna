const {
  BrowserWindow,
  app,
  ipcMain,
  dialog,
} = require("electron");
const fs = require("fs/promises");
const path = require("path");

// Folder where periodic camera snapshots are stored
const SNAPSHOT_DIR = path.join(app.getPath("userData"), "snapshots");

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadURL("http://localhost:5173/");
  win.webContents.openDevTools({ mode: "detach" });
}

ipcMain.handle("full-screen", () => {
  if (win) {
    win.kiosk = true;
  }
  return true;
});

let end_time = null;

ipcMain.handle("start-test", () => {
  console.log("IPC: start-test called (exam started)");
  end_time = Date.now() + 90 * 60 * 1000;
  return end_time - Date.now();
});

ipcMain.handle("get-time", () => {
  return end_time ? Math.max(0, end_time - Date.now()) : 0;
});

ipcMain.handle("close-app", () => {
  app.quit();
});

ipcMain.handle("show-rules", async () => {
  const res = await dialog.showMessageBox(win, {
    type: "info",
    title: "Exam rules",
    message: "Please follow these instructions:",
    detail: "1. Do not open any new tabs or windows.\n2. Cheating will result in zero marks.",
    buttons: ["Accept", "Decline"],
  });
  return res.response; // 0 = Accept, 1 = Decline
});

ipcMain.handle("save-snapshot", async (_event, dataUrl) => {
  try {
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });

    const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    await fs.writeFile(
      path.join(SNAPSHOT_DIR, `snapshot-${stamp}.jpg`),
      base64,
      "base64"
    );
    return true;
  } catch (err) {
    console.error("Failed to save snapshot:", err);
    return false;
  }
});

// Deletes snapshots left over from previous sessions (runs once at startup)
async function cleanupOldSnapshots() {
  try {
    const files = await fs.readdir(SNAPSHOT_DIR);

    await Promise.all(
      files
        .filter((file) => file.endsWith(".jpg"))
        .map((file) => fs.unlink(path.join(SNAPSHOT_DIR, file)))
    );
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("Snapshot cleanup failed:", err);
    }
  }
}

app.whenReady().then(() => {
  cleanupOldSnapshots();
  createWindow();
});
