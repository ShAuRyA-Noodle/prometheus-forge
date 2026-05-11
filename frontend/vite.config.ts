import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_BACKEND_URL ?? "http://localhost:8080";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
        },
        "/sse": {
          target: backendUrl,
          changeOrigin: true,
          secure: false,
          ws: false,
          configure(proxy) {
            proxy.on("proxyReq", (req) => {
              req.setHeader("Cache-Control", "no-cache");
              req.setHeader("Connection", "keep-alive");
              req.setHeader("Accept", "text/event-stream");
            });
          },
        },
      },
    },
    build: {
      target: "es2022",
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-tiptap": [
              "@tiptap/react",
              "@tiptap/starter-kit",
              "@tiptap/extension-placeholder",
              "@tiptap/extension-image",
              "@tiptap/extension-link",
            ],
            "vendor-firebase": ["firebase/app", "firebase/auth", "firebase/firestore"],
            "vendor-charts": ["recharts"],
          },
        },
      },
    },
  };
});
