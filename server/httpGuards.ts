import type { Response } from "express";

/** True for `/api` and `/api/...` (case-insensitive). Not `/apiary`. */
export function isApiPath(pathname: string): boolean {
  const path = pathname.split("?")[0].toLowerCase();
  return path === "/api" || path.startsWith("/api/");
}

export function sendApiNotFound(res: Response): void {
  if (res.headersSent) return;
  res.status(404).json({ message: "Not found" });
}
