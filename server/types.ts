import type { Request } from "express";

export type Role = "admin" | "lead" | "member";

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  email: string | null;
  role: Role;
  language: "en" | "ms";
}

export interface AuthenticatedRequest extends Request {
  user: SessionUser;
  sessionId: number;
  csrfToken: string;
}
