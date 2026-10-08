// desktop:dev 启动器：先起 vite dev server，等端口就绪后再拉起 Electron 连上去。
// 不引额外依赖（wait-on/concurrently），轮询 + 子进程管理自己写，几十行闭环。
import { spawn } from "node:child_process";

const VITE_PORT = 3015;
const vite = spawn("pnpm", ["exec", "vite", "--port", String(VITE_PORT), "--host", "127.0.0.1", "--strictPort"], {
  stdio: "inherit",
  shell: true,
});

const waitFor = async (url, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
};

const ok = await waitFor(`http://127.0.0.1:${VITE_PORT}/`);
if (!ok) {
  console.error("[desktop:dev] vite dev server 启动超时");
  vite.kill();
  process.exit(1);
}

const electron = spawn("pnpm", ["exec", "electron", "."], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ELECTRON_START_URL: `http://127.0.0.1:${VITE_PORT}/` },
});

// 任一子进程退出都整体收尾，避免残留 vite 占用 3015 端口
electron.on("exit", (code) => {
  vite.kill();
  process.exit(code ?? 0);
});
