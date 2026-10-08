const { contextBridge, ipcRenderer } = require("electron");

// 只暴露窄接口，渲染进程不会获得 node 或任意 IPC 能力：
// - 存储读写（~/.tuole 分类 JSON；read 同步供模块加载期取首帧数据，write 异步不阻塞 UI）
// - 备份镜像与「打开备份目录」
// - Excel/JSON 原生文件面板（先选路径，后异步读写）
contextBridge.exposeInMainWorld("tuoleDesktop", {
  isDesktop: true,
  readStorage: (name) => ipcRenderer.sendSync("tuole:storage:read", name),
  writeStorage: (name, text) => ipcRenderer.invoke("tuole:storage:write", name, text),
  openFile: (options) => ipcRenderer.invoke("tuole:file:open", options),
  saveFileDialog: (options) => ipcRenderer.invoke("tuole:file:save-dialog", options),
  writeFile: (filePath, data) => ipcRenderer.invoke("tuole:file:write", filePath, data),
  exportExcel: (tasks, options) => ipcRenderer.invoke("tuole:excel:export", { tasks, ...options }),
  importExcel: (options) => ipcRenderer.invoke("tuole:excel:import", options),
  syncBackups: (backups) => ipcRenderer.invoke("tuole:backup:sync", backups),
  openBackupDirectory: () => ipcRenderer.invoke("tuole:backup:open-directory"),
});
