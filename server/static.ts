import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { isApiPath, sendApiNotFound } from "./httpGuards";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist.
  // Unknown /api paths are JSON 404s; only non-API routes serve the app.
  app.use("/{*path}", (req, res) => {
    if (isApiPath(req.path)) {
      sendApiNotFound(res);
      return;
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
