import type { Server as SocketServer } from "socket.io";

export type UserRole = "student" | "instructor" | "admin";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      io?: SocketServer;
      validated?: {
        body: Record<string, unknown>;
        params: Record<string, string>;
        query: Record<string, string | undefined>;
      };
    }

  }
}

declare module "socket.io" {
  interface Socket {
    user?: {
      id: string;
      role: UserRole;
    };
  }
}
