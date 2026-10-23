const { BrowserWindow, app, ipcMain, dialog } = require("electron");
const path = require("path");

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

let end_time = null;

ipcMain.handle("start-test", () => {
  // Set 1-hour countdown limit
  end_time = Date.now() + 60 * 60 * 1000;
  return end_time - Date.now();
});

ipcMain.handle("get-time", () => {
  return end_time ? Math.max(0, end_time - Date.now()) : 0;
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

app.whenReady().then(createWindow);
