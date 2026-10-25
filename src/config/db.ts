const mongoose = require("mongoose");

let connectionPromise: Promise<void> | undefined;

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing required environment variable: MONGODB_URI");

  if (mongoose.connection.readyState !== 2) connectionPromise = undefined;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri)
      .then(() => {
        console.log(`MongoDB connected: ${mongoose.connection.name}`);
      })
      .catch((error: unknown) => {
        connectionPromise = undefined;
        throw error;
      });
  }

  await connectionPromise;
}

module.exports = connectDatabase;

export {};
