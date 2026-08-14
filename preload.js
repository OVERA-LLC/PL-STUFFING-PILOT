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
  onRemoteUpdate: (callback) => {
    ipcRenderer.on("cloud:remote-update", (event, update) => callback(update));
  },
  onRealtimeStatus: (callback) => {
    ipcRenderer.on("cloud:realtime-status", (event, info) => callback(info));
  },
  login: (email, password) => ipcRenderer.invoke("auth:login", { email, password }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getAuthStatus: () => ipcRenderer.invoke("auth:status"),
  getFacilityCode: () => ipcRenderer.invoke("facility:get"),
  setFacilityCode: (code) => ipcRenderer.invoke("facility:set", code),
  verifyDeveloperCode: (code) => ipcRenderer.invoke("facility:verifyDeveloperCode", code),
});
