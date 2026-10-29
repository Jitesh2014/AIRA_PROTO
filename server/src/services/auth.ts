import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Types } from "mongoose";

import { config } from "../config.js";
import { School } from "../models/School.js";
import { User, type UserRole } from "../models/User.js";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  schoolId: string | null;
  name: string;
}

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: `${config.jwtExpireDays}d`,
  });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function buildAuthResponse(userId: string | Types.ObjectId) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  let schoolName: string | null = null;
  if (user.schoolId) {
    const school = await School.findById(user.schoolId);
    schoolName = school?.name ?? null;
  }

  const token = signToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role as UserRole,
    schoolId: user.schoolId?.toString() ?? null,
    name: user.name,
  });

  return {
    access_token: token,
    token_type: "bearer" as const,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    school_id: user.schoolId?.toString() ?? null,
    school_name: schoolName,
  };
}
