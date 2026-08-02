/**
 * Shared admin Basic-auth middleware.
 *
 * Reads ADMIN_PASSWORD via getConfigValue so the in-app setup wizard can
 * set the password without a server restart.
 *
 * If ADMIN_PASSWORD is not configured at all, the middleware is open
 * (dev convenience and initial setup flow).
 */

import { type Request, type Response } from "express";
import { getConfigValue } from "./configStore.js";

export function requireAdminAuth(
  req: Request,
  res: Response,
  next: () => void,
): void {
  const password = getConfigValue("ADMIN_PASSWORD");
  if (!password) {
    // No password set — open during dev / initial wizard setup
    next();
    return;
  }

  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Trial Dashboard"');
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const credentials = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const colonIdx = credentials.indexOf(":");
  const suppliedPassword =
    colonIdx >= 0 ? credentials.slice(colonIdx + 1) : credentials;

  if (suppliedPassword !== password) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Trial Dashboard"');
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
