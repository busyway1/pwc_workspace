import os from "node:os";
import path from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import solid from "vite-plugin-solid";

const portValue = Number.parseInt(process.env.PORT ?? "", 10);
const devPort = Number.isFinite(portValue) && portValue > 0 ? portValue : 3000;
const allowedHosts = new Set<string>();
const envAllowedHosts = process.env.VITE_ALLOWED_HOSTS ?? "";

const addHost = (value?: string | null) => {
  const trimmed = value?.trim();
  if (!trimmed) return;
  allowedHosts.add(trimmed);
};

envAllowedHosts.split(",").forEach(addHost);
addHost(process.env.OPENWORK_PUBLIC_HOST ?? null);
const hostname = os.hostname();
addHost(hostname);
const shortHostname = hostname.split(".")[0];
if (shortHostname && shortHostname !== hostname) {
  addHost(shortHostname);
}

const tauriStub = path.resolve(__dirname, "src/stubs/tauri-noop.ts");

export default defineConfig({
  plugins: [tailwindcss(), solid()],
  resolve: {
    alias: {
      "@tauri-apps/api/core": tauriStub,
      "@tauri-apps/api/app": tauriStub,
      "@tauri-apps/api/event": tauriStub,
      "@tauri-apps/api/webview": tauriStub,
      "@tauri-apps/api/path": tauriStub,
      "@tauri-apps/plugin-deep-link": tauriStub,
      "@tauri-apps/plugin-dialog": tauriStub,
      "@tauri-apps/plugin-http": tauriStub,
      "@tauri-apps/plugin-opener": tauriStub,
      "@tauri-apps/plugin-process": tauriStub,
      "@tauri-apps/plugin-updater": tauriStub,
    },
  },
  server: {
    host: "0.0.0.0",
    port: devPort,
    strictPort: true,
    ...(allowedHosts.size > 0 ? { allowedHosts: Array.from(allowedHosts) } : {}),
  },
  build: {
    target: "esnext",
  },
});
