import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vitejs.dev/config/
export default defineConfig((config) => {
  const env = loadEnv(config.mode, process.cwd(), "");

  // configs
  const serverHost = env.VITE_SERVER_HOST ?? "localhost";
  const serverPort = env.VITE_SERVER_POST ?? "3001";
  const target = `http://${serverHost}:${serverPort}`;

  return {
    plugins: [react()],
    build: {
      /** Output to common "dist" directory */
      outDir: "../../dist/client",
    },

    server: {
      proxy: {
        /** Make a proxy to API server */
        "/api/": {
          target,
          changeOrigin: true,
        },
      },
    },
  };
});
