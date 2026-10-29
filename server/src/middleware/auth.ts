import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { config } from "../config.js";
import type { UserRole } from "../models/User.js";
import { User } from "../models/User.js";

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  schoolId: string | null;
  name: string;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ detail: "Not authenticated" });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    const user = await User.findById(payload.sub);

    if (!user || !user.active) {
      res.status(401).json({ detail: "Invalid or inactive user" });
      return;
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role as UserRole,
      schoolId: user.schoolId?.toString() ?? null,
      name: user.name,
    };
    next();
  } catch {
    res.status(401).json({ detail: "Invalid or expired token" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ detail: "Forbidden" });
      return;
    }
    next();
  };
}
