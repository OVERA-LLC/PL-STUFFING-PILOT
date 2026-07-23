const { contextBridge, ipcRenderer } = require("electron");

// renderer（index.html）から window.electronAPI.〇〇 という形で安全に呼び出せるようにする
contextBridge.exposeInMainWorld("electronAPI", {
  saveData: (jsonState) => ipcRenderer.invoke("data:save", jsonState),
  loadData: () => ipcRenderer.invoke("data:load"),
  pushCloud: (jsonState) => ipcRenderer.invoke("cloud:push", jsonState),
  pullCloud: () => ipcRenderer.invoke("cloud:pull"),
  onUpdateStatus: (callback) => {
    ipcRenderer.on("update:status", (event, message) => callback(message));
  },
});
