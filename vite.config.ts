import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: "my-life-development-csp",
      transformIndexHtml(html) {
        // React 开发预加载脚本需要 nonce；正式产物不放宽内联脚本策略。
        return html.replace(
          "__DEVELOPMENT_NONCE__",
          command === "serve" ? "'nonce-my-life-development'" : "",
        );
      },
    },
  ],
  html: command === "serve" ? { cspNonce: "my-life-development" } : undefined,
  base: "./",
  // 与 Electron 使用相同的 IPv4 地址，避免 localhost 解析为 IPv6 后拒绝连接。
  server: { host: "127.0.0.1", port: 5179, strictPort: true },
}));
