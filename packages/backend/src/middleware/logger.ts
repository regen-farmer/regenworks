import winston from "winston"; // USE WINSTON FOR LOGGING

// LOGGER CONFIGURATION
const winstonLogger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log`
    // - Write all logs error (and below) to `error.log`.
    //
    new winston.transports.File({ filename: "error.log", level: "error" }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

export default winstonLogger;
