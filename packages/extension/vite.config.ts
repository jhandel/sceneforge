import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { build as esbuild } from "esbuild";

// Custom plugin to handle Chrome extension build
function chromeExtensionPlugin() {
  return {
    name: "chrome-extension",
    async closeBundle() {
      const distDir = resolve(__dirname, "../../dist");

      // Copy manifest.json
      copyFileSync(
        resolve(__dirname, "manifest.json"),
        resolve(distDir, "manifest.json")
      );

      // Move sidepanel.html from nested location to root and fix paths
      const nestedHtml = resolve(distDir, "src/sidepanel/sidepanel.html");
      const rootHtml = resolve(distDir, "sidepanel.html");
      if (existsSync(nestedHtml)) {
        let htmlContent = readFileSync(nestedHtml, "utf-8");
        // Fix paths - replace ../../ with ./ since we're moving to root
        htmlContent = htmlContent.replace(/\.\.\/\.\.\//g, './');
        // Also handle relative paths that might be just ../
        htmlContent = htmlContent.replace(/\.\.\//g, './');
        writeFileSync(rootHtml, htmlContent);
        // Clean up nested directories
        rmSync(resolve(distDir, "src"), { recursive: true, force: true });
      }

      // Copy icons if they exist
      const iconsDir = resolve(__dirname, "icons");
      const distIconsDir = resolve(distDir, "icons");
      if (existsSync(iconsDir)) {
        if (!existsSync(distIconsDir)) {
          mkdirSync(distIconsDir, { recursive: true });
        }
        ["icon16.svg", "icon32.svg", "icon48.svg", "icon128.svg"].forEach((icon) => {
          const src = resolve(iconsDir, icon);
          if (existsSync(src)) {
            copyFileSync(src, resolve(distIconsDir, icon));
          }
        });
      }

      // Bundle content script as IIFE (classic script) for programmatic injection compatibility
      console.log("Bundling content-script as IIFE for compatibility...");
      await esbuild({
        entryPoints: [resolve(__dirname, "src/content/content-script.ts")],
        outfile: resolve(distDir, "content-script.js"),
        bundle: true,
        format: "iife",
        target: ["chrome110"],
        platform: "browser",
        sourcemap: true,
        tsconfig: resolve(__dirname, "../../tsconfig.json"),
        define: {
          "process.env.NODE_ENV": '"production"',
        },
      });

      console.log("Chrome extension files prepared in dist/");
    },
  };
}

export default defineConfig({
  plugins: [react(), chromeExtensionPlugin()],
  base: "./", // Use relative paths
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@t3lnet/sceneforge-shared": resolve(__dirname, "../shared/src"),
    },
  },
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "src/sidepanel/sidepanel.html"),
        "service-worker": resolve(__dirname, "src/background/service-worker.ts"),
        "content-script": resolve(__dirname, "src/content/content-script.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) {
            return "sidepanel.css";
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
