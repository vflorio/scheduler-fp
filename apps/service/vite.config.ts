import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "node22",
    outDir: "dist",
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [/^node:/],
    },
    minify: false,
    sourcemap: true,
  },
  resolve: {
    conditions: ["import", "module", "default"],
  },
});
