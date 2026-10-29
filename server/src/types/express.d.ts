import type { UserRole } from "../models/User.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
        schoolId: string | null;
        name: string;
      };
    }
  }
}

export {};
