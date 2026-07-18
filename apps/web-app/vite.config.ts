import react from "@vitejs/plugin-react";
import vike from "vike/plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vike(), react()],
  server: {
    proxy: {
      "/api/trpc": {
        target: "http://localhost:3001",
        rewrite: (path) => path.replace(/^\/api\/trpc/, "/trpc"),
      },
    },
  },
});
