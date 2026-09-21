import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

/**
 * Heavy, feature-specific bundles (3D scenes, charts, maps) are only reached
 * through lazy routes/components, yet Rollup emits `<link rel="modulepreload">`
 * hints for the biggest async chunks — which makes the browser download ~1 MB+
 * of JS on first paint that the landing page never needs. Strip those hints so
 * these chunks load only when a 3D view, chart, or map actually renders.
 */
function dropHeavyPreloads(): Plugin {
  const heavy = /\/assets\/(three|charts|leaflet|CartesianChart|leafletTiles|react-three)[^"']*\.js/;
  return {
    name: "drop-heavy-modulepreload",
    transformIndexHtml(html) {
      return html.replace(
        /<link[^>]+rel="modulepreload"[^>]*>/g,
        (tag) => (heavy.test(tag) ? "" : tag),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), dropHeavyPreloads()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Split the big third-party libraries into their own cacheable chunks so
    // they load in parallel and are cached across deploys, and so the heavy
    // ones (three.js, charts) don't sit in the initial app bundle.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          // 3D (three.js) is large; keep it in its own isolated, cacheable
          // chunk so it never lands in the shared "vendor" bundle.
          if (id.includes("/three") || id.includes("@react-three")) return "three";
          // Libraries used everywhere (eagerly) get stable, cacheable chunks.
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("react-dom") || id.includes("react-router") || id.includes("/scheduler/")) return "react";
          // Charts (recharts + d3) and maps (leaflet) are only reached through
          // lazy routes/components. Returning undefined lets Rollup emit them as
          // on-demand async chunks so they are NOT pulled into the initial
          // bundle — they download only when a chart or map actually renders.
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("victory") || id.includes("leaflet")) return;
          return "vendor";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    proxy: {
      "/api": { target: "http://localhost:5001", changeOrigin: true },
      "/uploads": { target: "http://localhost:5001", changeOrigin: true },
      "/health": { target: "http://localhost:5001", changeOrigin: true },
      "/socket.io": {
        target: "http://localhost:5001",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
