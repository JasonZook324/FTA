import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default async function () {
  const plugins = [
    react(),
    runtimeErrorOverlay(),
  ];

  if (process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined) {
    try {
      const cartographerModule: any = await import("@replit/vite-plugin-cartographer");
      const cartographer: any = cartographerModule?.default ?? cartographerModule;
      if (typeof cartographer === 'function') {
        plugins.push(cartographer());
      }
    } catch (e: any) {
      console.warn('Cartographer plugin not available:', e?.message ?? e);
    }
  }

  return defineConfig({
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    root: path.resolve(import.meta.dirname, "client"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
      proxy: {
        "/api": {
          target: "http://localhost:5000",
          changeOrigin: true,
        },
      },
    },
  });
}
