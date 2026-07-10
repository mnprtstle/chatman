import winston from "winston";
// customized severity levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// show all levels in development, only warn and error in production
const level = () => {
  const env = process.env.NODE_ENV || "development";
  const isDevelopment = env === "development";
  return isDevelopment ? "debug" : "warn";
};

// Define different colors for each level.
const colors = {
  error: "red",
  warn: "yellow",
  info: "blue",
  http: "magenta",
  debug: "white",
};

//link colors to severity levels
winston.addColors(colors);

// log format customization
const format = winston.format.combine(
  winston.format.timestamp({ format: "DD MMM, YYYY - HH:mm:ss:ms" }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `[${info.timestamp}] ${info.level}: ${info.message}`
  )
);

// transports the logger must use to print out messages.
const transports = [
  new winston.transports.Console(),
  new winston.transports.File({ filename: "logs/error.log", level: "error" }),
  new winston.transports.File({ filename: "logs/info.log", level: "info" }),
  new winston.transports.File({ filename: "logs/http.log", level: "http" }),
];

// winston logger instance created, import it to use in modules
const logger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
});

export default logger;
