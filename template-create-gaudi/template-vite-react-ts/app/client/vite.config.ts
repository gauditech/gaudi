import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    /** Output to common "dist" folder */
    outDir: "../../dist/client",
  },

  server: {
    proxy: {
      /** Make a proxy to API server */
      "/api/": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
