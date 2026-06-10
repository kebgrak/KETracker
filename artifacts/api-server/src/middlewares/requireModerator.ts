import type { Request, Response, NextFunction } from "express";

export function requireModerator(req: Request, res: Response, next: NextFunction) {
  if (req.session.isAdmin || req.session.isModerator) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized. Login required." });
}
