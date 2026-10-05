import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5173 },
  build: {
    sourcemap: false,
    // Firebase SDK (~180 kB gzip, messaging sobat) ekach cached chunk — warning apekshit.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Firebase SDK vegla chunk — browser cache madhe rahto, app update la parat download nahi.
        // Recharts mudam vegla nahi: to fakt Dashboard chunk sobat lazy yeto.
        manualChunks(id) {
          if (id.includes("node_modules/firebase") || id.includes("node_modules/@firebase")) return "firebase";
        },
      },
    },
  },
});
