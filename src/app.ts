import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import paymentController = require("./controllers/paymentController");
import errorHandler = require("./middleware/errorHandler");
const connectDatabase = require("./config/db");
const { clientUrl, nodeEnv } = require("./config/env");
const app = express();
const ensureDatabaseConnection = (_req: Request, _res: Response, next: NextFunction) => {
  connectDatabase().then(() => next(), next);
};

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: clientUrl, credentials: true }));
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.io = app.get("io");
  next();
});
app.use("/api", (_req: Request, _res: Response, next: NextFunction) => {
  connectDatabase().then(() => next(), next);
});

app.post(
  "/api/payments/webhook",
  rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }),
  ensureDatabaseConnection,
  express.raw({ type: "application/json" }),
  (req: Request, res: Response, next: NextFunction) => {
  paymentController.handleStripeWebhook(req, res).catch(next);
  }
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());
app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false }));
app.use("/api", ensureDatabaseConnection);

app.get("/api/health", (_req, res) => res.json({ status: "ok", environment: nodeEnv }));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/courses", require("./routes/courseRoutes"));
app.use("/api/enrollments", require("./routes/enrollmentRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/uploads", require("./routes/uploadRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

app.use((req: Request, res: Response) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));
app.use(errorHandler as ErrorRequestHandler);

module.exports = app;
