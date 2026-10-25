const jwt = require("jsonwebtoken");
const { jwtSecret, cookieName } = require("../config/env");
const User = require("../models/User");
import type { Server, Socket } from "socket.io";

function attachSocket(io: Server) {
  io.use(async (socket: Socket, next: (error?: Error) => void) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie || "";
      const cookie = cookieHeader.split("; ").find((item) => item.startsWith(`${cookieName}=`));
      const token = socket.handshake.auth?.token || cookie?.slice(cookieName.length + 1);
      if (!token) return next(new Error("Authentication required"));
      const decoded = jwt.verify(token, jwtSecret);
      const user = await User.findById(decoded.sub).select("_id role isActive");
      if (!user || !user.isActive) return next(new Error("Authentication required"));
      socket.user = user;
      next();
    } catch {
      next(new Error("Authentication required"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    socket.join(`user:${user.id}`);
    if (user.role === "admin") socket.join("role:admin");
  });
}

module.exports = attachSocket;

export {};
