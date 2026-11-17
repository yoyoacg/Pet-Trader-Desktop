import { createServer } from "vite";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

// Electron 主进程直接使用 CJS，开发启动不依赖尚未生成的 dist-electron。
const require = createRequire(import.meta.url);
const server = await createServer();
await server.listen();
const child = spawn(require("electron"), ["."], {
  env: {
    ...process.env,
    // 使用 Vite 实际监听的地址，端口只需在 Vite 配置中维护。
    MY_LIFE_DEV_URL: new URL(server.resolvedUrls.local[0]).origin,
    ELECTRON_RUN_AS_NODE: undefined,
  },
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (error) => {
  throw error;
});
child.on("exit", async (code) => {
  await server.close();
  process.exit(code);
});
