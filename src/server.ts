require("dotenv").config();
const http = require("node:http");
const { Server } = require("socket.io");
const { port, clientUrl } = require("./config/env");
const connectDatabase = require("./config/db");
const app = require("./app");
const attachSocket = require("./services/socket");

async function start() {
  await connectDatabase();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: clientUrl, credentials: true } });
  attachSocket(io);
  app.set("io", io);
  server.listen(port, () => console.log(`Code Campus API listening on port ${port}`));
}

start().catch((error) => {
  console.error("Failed to start Code Campus API:", error);
  process.exitCode = 1;
});

export {};
