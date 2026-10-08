const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tuoleReminder", {
  close: () => ipcRenderer.send("tuole:reminder:close"),
});
