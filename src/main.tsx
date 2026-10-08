// 应用入口：样式在 ./styles.css（Tailwind v4 + design token），路由见 ./router.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { initRevealEngine } from "./lib/reveal-engine";
import { cleanupLegacyKeys } from "./lib/storage";
import { isDesktopApp } from "./lib/desktopBridge";
import "./styles.css";

// 桌面端（Electron）光标策略标记：html 挂 desktop-cursors 后，
// styles.css 会把全部手指（pointer）光标压成系统箭头（浏览器版不受影响）
if (isDesktopApp) {
  document.documentElement.classList.add("desktop-cursors");
}

// 全局滚动渐入引擎：业务元素只需加 class="reveal"（详见 lib/reveal-engine.ts），勿删
initRevealEngine();
// 清理已下线能力遗留的本地存储键（备份队列 / 标签库）
cleanupLegacyKeys();

const router = getRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
