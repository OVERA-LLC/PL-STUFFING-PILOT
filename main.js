const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { fork } = require("child_process");
const { autoUpdater } = require("electron-updater");
const { getData, saveData } = require("./src/db");
const cloud = require("./src/cloud");

let mainWindow;
let bridgeServerProcess = null;

/* ===================== innto連携ローカルサーバーの自動起動 ===================== */
function startBridgeServer() {
  const serverPath = path.join(__dirname, "local_server.js");
  try {
    bridgeServerProcess = fork(serverPath, [], {
      stdio: "ignore",
      env: {
        ...process.env,
        // パッケージ化されたアプリの中でも書き込めるよう、専用の保存場所を渡す
        INNTO_BRIDGE_DATA_DIR: path.join(app.getPath("userData"), "innto_bridge_data"),
      },
    });
    bridgeServerProcess.on("error", (err) => {
      console.error("innto連携サーバーの起動に失敗しました:", err);
    });
    bridgeServerProcess.on("exit", (code) => {
      bridgeServerProcess = null;
    });
  } catch (e) {
    console.error("innto連携サーバーの起動に失敗しました:", e);
  }
}

function stopBridgeServer() {
  if (bridgeServerProcess) {
    bridgeServerProcess.kill();
    bridgeServerProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  // 起動時に一度だけ、GitHubに新しいバージョンがないか確認する
  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(() => {
  createWindow();
  startBridgeServer();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopBridgeServer();
});

/* ===================== データの保存・読み込み（SQLite） ===================== */
// アプリ側（renderer/index.html）から「保存」「読み込み」ボタンが押されたときに呼ばれる
ipcMain.handle("data:save", async (event, jsonState) => {
  saveData(jsonState);
  return { ok: true };
});

ipcMain.handle("data:load", async () => {
  return getData();
});

/* ===================== クラウド同期（Supabase・手動ボタン方式） ===================== */
ipcMain.handle("cloud:push", async (event, jsonState) => {
  try {
    await cloud.pushState(jsonState);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("cloud:pull", async () => {
  try {
    const row = await cloud.pullState();
    return { ok: true, row };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/* ===================== 自動アップデート関連の通知 ===================== */
autoUpdater.on("update-available", () => {
  if (mainWindow) mainWindow.webContents.send("update:status", "新しいバージョンが見つかりました。ダウンロード中です…");
});

autoUpdater.on("update-not-available", () => {
  if (mainWindow) mainWindow.webContents.send("update:status", "最新バージョンです。");
});

autoUpdater.on("download-progress", (progress) => {
  if (mainWindow) {
    mainWindow.webContents.send("update:status", `更新をダウンロード中… ${Math.round(progress.percent)}%`);
  }
});

autoUpdater.on("update-downloaded", () => {
  if (!mainWindow) return;
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      buttons: ["今すぐ再起動して更新", "あとで"],
      title: "アップデートの準備ができました",
      message: "新しいバージョンの準備ができました。再起動すると更新が適用されます。",
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
});

autoUpdater.on("error", (err) => {
  if (mainWindow) mainWindow.webContents.send("update:status", "アップデート確認でエラーが発生しました: " + err.message);
});
