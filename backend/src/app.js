import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import session from "express-session";
import { createServer } from "http";
import passport from "passport";
import requestIp from "request-ip";
import { ApiError } from "./utils/ApiError.js";
import morganMiddleware from "./logger/morgan.logger.js";

const app = express();

export const httpServer = createServer(app);

// global middlewares
app.use(
  cors({
    origin:
      process.env.CORS_ORIGIN === "*"
        ? "*" :
        process.env.CORS_ORIGIN?.split(","), // For multiple cors origin 
    credentials: true,
  })
);

app.use(requestIp.mw());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, _) => {
    return req.clientIp; // use ip from requestIp.mw, for more accurate ip
  },
  handler: (_, __, ___, options) => {
    throw new ApiError(
      options.statusCode || 500,
      `There are too many requests. You are only allowed ${options.limit
      } requests per ${options.windowMs / 60000} minutes`
    );
  },
});

// Apply the rate limiting middleware to all requests
app.use(limiter);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());

// required for passport
app.use(
  session({
    secret: process.env.EXPRESS_SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
  })
); // session secret
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions

app.use(morganMiddleware);

//api routes
import chatRouter from "./routes/chat.routes.js";
import messageRouter from "./routes/message.routes.js"
import userRouter from "./routes/user.routes.js";
import fileRouter from "./routes/file.routes.js";
import healthCheckRouter from "./routes/healthcheck.routes.js";
import wsRouter from "./routes/ws.routes.js";
import { errorHandler } from "./middlewares/error.middleware.js";

app.use("/api/v1/chats", chatRouter);
app.use("/api/v1/messages", messageRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/file", fileRouter);
app.use("/api/v1/health-check", healthCheckRouter);
app.use("/api/v1/ws", wsRouter);


//at the end, catch any errors for correct format
app.use(errorHandler);
