// Electron 主进程：桌面壳。
// 关键决策——页面不从 file:// 加载，而是由主进程内置一个静态服务器托管 vite 构建产物：
// 1) TanStack Router 的 history 路由在 file:// 下无法匹配路径；
// 2) http://127.0.0.1:固定端口 的源稳定，跨启动数据源才唯一。
// 端口固定 34567 + 单实例锁：双开应用会因端口冲突/源漂移丢数据，锁掉即可保证源唯一。
// 本地数据契约：桌面版所有数据分类存放于用户目录 ~/.tuole/
// （tasks/settings/ui/backups.json + backups/ 快照镜像），localStorage 仅作首启迁移来源。
const { app, BrowserWindow, shell, dialog, ipcMain, Notification, screen, powerMonitor } = require("electron");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { createDesktopReminderEngine, reminderPopupPosition } = require("./reminder.cjs");

const FIXED_PORT = 34567;
const DIST_DIR = path.join(__dirname, "..", "dist");
// 开发模式：desktop:dev 注入 vite dev server 地址，直连热更新（此时不启内置服务器）
const DEV_URL = process.env.ELECTRON_START_URL;

// 正式应用固定写入 ~/.tuole；开发联调可用专属测试目录，避免触碰用户真实任务。
const DATA_DIR = DEV_URL && process.env.TUOLE_TEST_DATA_DIR
  ? path.resolve(process.env.TUOLE_TEST_DATA_DIR)
  : path.join(os.homedir(), ".tuole");
if (DEV_URL && process.env.TUOLE_TEST_DATA_DIR) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const testUserData = path.join(DATA_DIR, "electron-user-data");
  fs.mkdirSync(testUserData, { recursive: true });
  app.setPath("userData", testUserData);
}
// 存储文件白名单：渲染进程只能读写这几个名字，IPC 不会被当成任意文件读写器
const STORAGE_FILES = new Set(["tasks.json", "settings.json", "ui.json", "backups.json"]);
// 单文件载荷上限（任务数据远小于此；超限视为异常请求直接拒绝）
const MAX_STORAGE_TEXT_LENGTH = 20 * 1024 * 1024;

function dataDirectory() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

// 启动时清理崩溃残留的临时文件：原子写中途退出会留下 *.tmp-<pid>，pid 每次启动都变，
// 不清会随时间慢慢堆积占盘（正常路径 tmp 都会被 rename 掉，只有异常退出才会留下）
function sweepStaleTempFiles() {
  for (const directory of [DATA_DIR, backupDirectory()]) {
    try {
      for (const entry of fs.readdirSync(directory)) {
        if (/\.tmp-\d+$/.test(entry)) {
          fs.unlinkSync(path.join(directory, entry));
        }
      }
    } catch {
      /* 目录不存在（首启）等情况直接忽略 */
    }
  }
}

function backupDirectory() {
  return path.join(DATA_DIR, "backups");
}

function ensureBackupDirectory() {
  const directory = backupDirectory();
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

// 快照镜像文件名按创建时间命名（本地时区 YYYYMMDD-HHmm）：手工翻目录恢复时可直接定位到时间点；
// createdAt 解析失败才回退到 id 兜底（保持文件名只含安全字符）
function backupFileName(backup) {
  const created = new Date(backup.createdAt);
  if (Number.isNaN(created.getTime())) {
    const safeId = String(backup.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    return `tuole-backup-${safeId}.json`;
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `tuole-backup-${created.getFullYear()}${pad(created.getMonth() + 1)}${pad(created.getDate())}-${pad(created.getHours())}${pad(created.getMinutes())}.json`;
}

function isBackupRecord(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      typeof value.createdAt === "string" &&
      Array.isArray(value.tasks),
  );
}

/** 将渲染进程的滚动快照镜像为桌面应用数据目录里的 JSON 文件。 */
ipcMain.handle("tuole:backup:sync", (_event, backups) => {
  if (!Array.isArray(backups)) throw new Error("Invalid backup list");
  const directory = ensureBackupDirectory();
  const validBackups = backups.filter(isBackupRecord).slice(0, 10);
  const activeNames = new Set();

  for (const backup of validBackups) {
    let fileName = backupFileName(backup);
    if (activeNames.has(fileName)) {
      // 同一分钟内的多份快照依次加 -2/-3 后缀防覆盖；列表顺序稳定，命名也随之稳定
      const base = fileName.replace(/\.json$/, "");
      let serial = 2;
      while (activeNames.has(`${base}-${serial}.json`)) serial += 1;
      fileName = `${base}-${serial}.json`;
    }
    const target = path.join(directory, fileName);
    const temporary = `${target}.tmp-${process.pid}`;
    activeNames.add(fileName);
    fs.writeFileSync(
      temporary,
      JSON.stringify({ version: 1, ...backup }, null, 2),
      "utf8",
    );
    fs.renameSync(temporary, target);
  }

  // 只清理本功能生成的文件（日期命名与历史 bk- 命名都认，升级后旧命名文件随滚动自然退场），
  // 不碰用户手动放进目录的其它文件。
  for (const entry of fs.readdirSync(directory)) {
    if (/^tuole-backup-(?:\d{8}-\d{4}(?:-\d+)?|bk-[0-9]+)\.json$/.test(entry) && !activeNames.has(entry)) {
      fs.unlinkSync(path.join(directory, entry));
    }
  }

  return { ok: true, path: directory };
});

ipcMain.handle("tuole:backup:open-directory", async () => {
  const directory = ensureBackupDirectory();
  const error = await shell.openPath(directory);
  return error ? { ok: false, path: directory, error } : { ok: true, path: directory };
});

// ── 桌面到期提醒 ──────────────────────────────────────────────────────────────
// 计时、任务判定、每日去重都在主进程；视觉提示由独立浮层窗口承载。
// macOS 通知中心仅做补充，关闭通知权限也不会让提醒整体静默。
const REMINDER_LEDGER = "reminder-ledger.json";
let reminderWindow = null;
let reminderDismissTimer = null;
let mainWindow = null;

function readReminderJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf8"));
  } catch {
    return fallback;
  }
}

function writeReminderLedger(ledger) {
  dataDirectory();
  const target = path.join(DATA_DIR, REMINDER_LEDGER);
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, JSON.stringify(ledger), "utf8");
  fs.renameSync(temporary, target);
}

function escapeReminderHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function closeReminderWindow() {
  if (reminderDismissTimer) clearTimeout(reminderDismissTimer);
  reminderDismissTimer = null;
  if (reminderWindow && !reminderWindow.isDestroyed()) reminderWindow.close();
  reminderWindow = null;
}

function reminderDisplayAndPosition(popupWidth, popupHeight) {
  const bounds = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null;
  const display = bounds ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay();
  return reminderPopupPosition(bounds, display.workArea, popupWidth, popupHeight);
}

function followMainWindow() {
  if (!reminderWindow || reminderWindow.isDestroyed()) return;
  const { width, height } = reminderWindow.getBounds();
  const { x, y } = reminderDisplayAndPosition(width, height);
  reminderWindow.setPosition(x, y);
}

function playReminderSound() {
  // macOS 媒体音量与「提醒音量」是两条通道。优先播放系统自带音效，
  // 避免用户关闭系统提示音后 shell.beep() 也完全听不见。
  const sound = "/System/Library/Sounds/Glass.aiff";
  if (process.platform === "darwin" && fs.existsSync(sound)) {
    try {
      const player = spawn("/usr/bin/afplay", [sound], { stdio: "ignore" });
      let settled = false;
      const fallback = () => {
        if (settled) return;
        settled = true;
        try { shell.beep(); } catch (error) { console.error("[reminder] sound failed", error); }
      };
      player.once("error", fallback);
      player.once("close", (code) => { if (code !== 0) fallback(); });
      return;
    } catch (error) {
      console.error("[reminder] audio player failed", error);
    }
  }
  try { shell.beep(); } catch (error) { console.error("[reminder] sound failed", error); }
}

async function showDesktopReminder({ title, body = "" }) {
  const safeTitle = String(title).slice(0, 160);
  const safeBody = String(body).slice(0, 320);
  closeReminderWindow();

  let visible = false;
  try {
    const popupWidth = 380;
    const popupHeight = 138;
    const { x, y } = reminderDisplayAndPosition(popupWidth, popupHeight);
    const zh = readReminderJson("settings.json", {}).language !== "en-US";
    const popup = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x,
      y,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      alwaysOnTop: true,
      focusable: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "reminder-preload.cjs"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    reminderWindow = popup;
    const html = `<!doctype html><html lang="${zh ? "zh" : "en"}"><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent}
      body{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif;color:#182331}
      .card{position:relative;width:100%;height:100%;border:1px solid #d8e3ee;border-radius:15px;background:#fff;padding:19px 52px 16px 20px;overflow:hidden}
      .brand{color:#2375d1;font-size:11px;font-weight:700;letter-spacing:.03em;margin-bottom:8px}
      .title{font-size:15px;font-weight:700;line-height:1.3;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .body{font-size:12px;line-height:1.45;color:#526173;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .close{position:absolute;top:11px;right:11px;width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:#6b7788;cursor:pointer}
      .close:hover{background:#eef3f8;color:#182331}.close:focus-visible{outline:2px solid #2375d1;outline-offset:1px}
    </style><div class="card" role="alert"><button class="close" type="button" aria-label="${zh ? "关闭提醒" : "Close reminder"}" id="close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button><div class="brand">妥了 · ToDone</div><div class="title">${escapeReminderHtml(safeTitle)}</div><div class="body">${escapeReminderHtml(safeBody)}</div></div><script>document.getElementById("close").addEventListener("click",()=>window.tuoleReminder.close())</script></html>`;
    await popup.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    if (!popup.isDestroyed()) {
      popup.showInactive();
      visible = popup.isVisible();
      reminderDismissTimer = setTimeout(closeReminderWindow, 12_000);
    }
  } catch (error) {
    console.error("[reminder] popup failed", error);
    closeReminderWindow();
  }

  playReminderSound();
  try {
    if (Notification.isSupported()) new Notification({ title: safeTitle, body: safeBody, silent: true }).show();
  } catch (error) {
    console.error("[reminder] system notification failed", error);
  }
  return visible;
}

ipcMain.on("tuole:reminder:close", (event) => {
  if (reminderWindow && !reminderWindow.isDestroyed() && event.sender === reminderWindow.webContents) {
    closeReminderWindow();
  }
});

const desktopReminder = createDesktopReminderEngine({
  readSettings: () => readReminderJson("settings.json", {}),
  readTasks: () => readReminderJson("tasks.json", []),
  readLedger: () => readReminderJson(REMINDER_LEDGER, {}),
  writeLedger: writeReminderLedger,
  deliver: showDesktopReminder,
});

// ── ~/.tuole 分类存储 IPC ──────────────────────────────────────────────────────
// 同步读（sendSync）：渲染层 store 初始化在模块加载期（如 useUiStore 的初始 view），
// 必须同步拿到首帧数据；文件不存在/名字非法一律返回 null，由渲染层回落迁移逻辑。
ipcMain.on("tuole:storage:read", (event, name) => {
  let text = null;
  try {
    if (typeof name === "string" && STORAGE_FILES.has(name)) {
      text = fs.readFileSync(path.join(DATA_DIR, name), "utf8");
    }
  } catch {
    text = null;
  }
  event.returnValue = text;
});

// 异步写队列：同名文件串行落盘、只刷最新内容（连点操作合并为一次磁盘写）
const writeQueues = new Map(); // name -> { pending: string | null, draining: Promise | null }

async function atomicWrite(name, text) {
  dataDirectory();
  const target = path.join(DATA_DIR, name);
  const temporary = `${target}.tmp-${process.pid}`;
  await fsPromises.writeFile(temporary, text, "utf8");
  await fsPromises.rename(temporary, target); // 原子替换：崩溃时只会留下旧文件或新文件，不会写坏
}

ipcMain.handle("tuole:storage:write", (_event, name, text) => {
  if (typeof name !== "string" || !STORAGE_FILES.has(name)) return Promise.reject(new Error("Invalid storage name"));
  if (typeof text !== "string" || text.length > MAX_STORAGE_TEXT_LENGTH)
    return Promise.reject(new Error("Invalid storage payload"));

  let queue = writeQueues.get(name);
  if (!queue) {
    queue = { pending: null, draining: null };
    writeQueues.set(name, queue);
  }
  queue.pending = text; // 覆盖排队中的旧内容
  if (!queue.draining) {
    queue.draining = (async () => {
      while (queue.pending !== null) {
        const current = queue.pending;
        queue.pending = null;
        await atomicWrite(name, current);
        if (name === "settings.json" || name === "tasks.json") void desktopReminder.check();
      }
    })()
      // 落盘失败静默降级：与 localStorage 写满即忽略的语义一致，存储层写是尽力而为
      .catch(() => undefined)
      .finally(() => {
        queue.draining = null;
      });
  }
  return queue.draining;
});

// ── 原生文件面板 IPC ──────────────────────────────────────────────────────────
// Excel/JSON 导入导出不再经过隐藏 input 或 Chromium 下载器：先由主进程打开原生面板，
// 用户确认路径后再异步读写文件，避免渲染层在唤起面板的同一帧同步生成/解析大文件。
function normalizeDialogFilters(filters) {
  if (!Array.isArray(filters)) return [];
  return filters
    .filter((filter) => filter && typeof filter.name === "string" && Array.isArray(filter.extensions))
    .map((filter) => ({
      name: filter.name.slice(0, 80),
      extensions: filter.extensions
        .filter((extension) => typeof extension === "string")
        .map((extension) => extension.replace(/^\./, "").slice(0, 20))
        .filter(Boolean),
    }))
    .filter((filter) => filter.extensions.length > 0);
}

function dialogWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

ipcMain.handle("tuole:file:open", async (event, options = {}) => {
  const result = await dialog.showOpenDialog(dialogWindow(event), {
    title: typeof options.title === "string" ? options.title.slice(0, 120) : undefined,
    properties: ["openFile"],
    filters: normalizeDialogFilters(options.filters),
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };

  // ArrayBuffer 比 Buffer 更适合跨 contextBridge 结构化克隆，避免渲染层收到 Node 专属对象。
  const bytes = await fsPromises.readFile(result.filePaths[0]);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { canceled: false, data };
});

ipcMain.handle("tuole:file:save-dialog", async (event, options = {}) => {
  const result = await dialog.showSaveDialog(dialogWindow(event), {
    title: typeof options.title === "string" ? options.title.slice(0, 120) : undefined,
    defaultPath: typeof options.defaultPath === "string" ? options.defaultPath.slice(0, 240) : undefined,
    filters: normalizeDialogFilters(options.filters),
  });
  return result.canceled || !result.filePath
    ? { canceled: true }
    : { canceled: false, filePath: result.filePath };
});

ipcMain.handle("tuole:file:write", async (_event, filePath, data) => {
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.length > 4096) {
    throw new Error("Invalid file path");
  }
  let bytes;
  if (data instanceof ArrayBuffer) {
    bytes = Buffer.from(new Uint8Array(data));
  } else if (ArrayBuffer.isView(data)) {
    bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else {
    throw new Error("Invalid file data");
  }
  await fsPromises.writeFile(filePath, bytes);
});

// ── Excel 专用事务 IPC ───────────────────────────────────────────────────────
// 导出必须在用户确认保存路径之后才加载 SheetJS 并序列化，避免渲染层在系统面板
// 出现前同步计算；导入则由主进程打开面板并读取原始字节，一次 invoke 完成整条链路。
const { buildExcelBuffer } = require("./excel.cjs");

ipcMain.handle("tuole:excel:export", async (event, payload = {}) => {
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  if (tasks.length === 0) throw new Error("No tasks to export");
  const result = await dialog.showSaveDialog(dialogWindow(event), {
    title: typeof payload.title === "string" ? payload.title.slice(0, 120) : undefined,
    defaultPath: typeof payload.defaultPath === "string" ? payload.defaultPath.slice(0, 240) : undefined,
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await fsPromises.writeFile(result.filePath, buildExcelBuffer(tasks));
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle("tuole:excel:import", async (event, payload = {}) => {
  const result = await dialog.showOpenDialog(dialogWindow(event), {
    title: typeof payload.title === "string" ? payload.title.slice(0, 120) : undefined,
    properties: ["openFile"],
    filters: [{ name: "Excel / CSV", extensions: ["xlsx", "xls", "csv"] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const bytes = await fsPromises.readFile(result.filePaths[0]);
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { canceled: false, data };
});

// 单实例锁：防止第二个实例占用/漂移数据源
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
  };

  /** 内置静态服务器：只服务 dist 目录，路径一律 normalize 后校验不越界（防目录穿越） */
  function startStaticServer() {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
        // SPA 单路由：任何路径都回落 index.html（当前只有 "/"，未来加路由也免改）
        let filePath = path.normalize(path.join(DIST_DIR, urlPath));
        if (!filePath.startsWith(DIST_DIR)) {
          res.writeHead(403).end("Forbidden");
          return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          filePath = path.join(DIST_DIR, "index.html");
        }
        res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
        fs.createReadStream(filePath).pipe(res);
      });
      server.on("error", reject);
      server.listen(FIXED_PORT, "127.0.0.1", () => resolve(server));
    });
  }

  async function createWindow() {
    const win = new BrowserWindow({
      width: 1280,
      height: 860,
      minWidth: 960,
      minHeight: 640,
      title: "妥了 · ToDone",
      // macOS：隐藏原生标题栏文字，让网页 TopBar 成为唯一顶部栏；
      // 红黄绿窗口按钮仍保留，并与 68px 高的网页 TopBar 垂直居中。
      ...(process.platform === "darwin"
        ? {
            titleBarStyle: "hiddenInset",
            trafficLightPosition: { x: 16, y: 26 },
          }
        : {}),
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
      autoHideMenuBar: true,
    });
    mainWindow = win;
    win.on("move", followMainWindow);
    win.on("resize", followMainWindow);
    win.on("closed", () => { if (mainWindow === win) mainWindow = null; });
    win.once("ready-to-show", () => win.show());
    // 外链交给系统浏览器打开，应用内不跳走
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });

    if (DEV_URL) {
      await win.loadURL(DEV_URL);
      win.webContents.openDevTools({ mode: "detach" });
    } else {
      await startStaticServer();
      await win.loadURL(`http://127.0.0.1:${FIXED_PORT}/`);
    }
  }

  app.whenReady().then(() => {
    sweepStaleTempFiles(); // 清掉上次异常退出可能留下的 *.tmp-<pid> 残片
    screen.on("display-metrics-changed", followMainWindow);
    screen.on("display-removed", followMainWindow);
    createWindow().then(() => desktopReminder.start()).catch((error) => {
      console.error("[app] window failed", error);
    });
    powerMonitor.on("resume", () => { void desktopReminder.check(); });
    powerMonitor.on("unlock-screen", () => { void desktopReminder.check(); });
  });

  app.on("before-quit", () => {
    desktopReminder.stop();
    closeReminderWindow();
  });

  app.on("window-all-closed", () => {
    // 单用途工具应用：窗口关即退出（含 macOS，避免常驻进程占着固定端口）
    app.quit();
  });
}
