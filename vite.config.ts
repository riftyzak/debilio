import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

const ROOT_ASSET_DIR = path.resolve(__dirname, "assets");
const ROOT_PUBLIC_FILES = [
  "android-chrome-192x192.png",
  "android-chrome-512x512.png",
  "apple-touch-icon.png",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "favicon.ico",
  "site.webmanifest",
];

function contentType(filePath: string) {
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  if (filePath.endsWith(".webmanifest")) return "application/manifest+json";
  return "application/octet-stream";
}

function serveRootAssets() {
  return {
    name: "serve-root-assets",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url || "";
        if (url.startsWith("/assets/")) {
          const rel = url.replace("/assets/", "");
          const filePath = path.join(ROOT_ASSET_DIR, rel);
          if (fs.existsSync(filePath)) {
            res.statusCode = 200;
            res.setHeader("Content-Type", contentType(filePath));
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }

        if (ROOT_PUBLIC_FILES.includes(url.replace("/", ""))) {
          const filePath = path.resolve(__dirname, url.replace("/", ""));
          if (fs.existsSync(filePath)) {
            res.statusCode = 200;
            res.setHeader("Content-Type", contentType(filePath));
            fs.createReadStream(filePath).pipe(res);
            return;
          }
        }

        next();
      });
    },
    async closeBundle() {
      const outDir = path.resolve(__dirname, "dist");
      const assetsOut = path.join(outDir, "assets");
      if (fs.existsSync(ROOT_ASSET_DIR)) {
        await fs.promises.mkdir(assetsOut, { recursive: true });
        const entries = await fs.promises.readdir(ROOT_ASSET_DIR);
        await Promise.all(
          entries.map(async (entry) => {
            const src = path.join(ROOT_ASSET_DIR, entry);
            const dest = path.join(assetsOut, entry);
            await fs.promises.copyFile(src, dest);
          })
        );
      }

      await Promise.all(
        ROOT_PUBLIC_FILES.map(async (file) => {
          const src = path.resolve(__dirname, file);
          const dest = path.join(outDir, file);
          if (fs.existsSync(src)) {
            await fs.promises.copyFile(src, dest);
          }
        })
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), serveRootAssets()],
  build: {
    assetsDir: "static",
  },
});
