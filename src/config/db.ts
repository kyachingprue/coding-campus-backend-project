const mongoose = require("mongoose");

async function connectDatabase() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}

module.exports = connectDatabase;

export {};
