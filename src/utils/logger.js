import winston from 'winston';
import chalk from 'chalk';

// Define Chalk color mappings for Winston log levels (used only for console)
const levelColors = {
  error: chalk.red.bold,
  warn: chalk.yellow.bold,
  info: chalk.blue.bold,
  http: chalk.cyan.bold,
  verbose: chalk.magenta.bold,
  debug: chalk.green.bold,
  silly: chalk.gray.bold,
};

// Custom format for console logs (with Chalk)
const consoleFormat = winston.format.printf(({ level, message, timestamp }) => {
  const colorize = levelColors[level] || ((text) => text); // Apply Chalk colors
  return `[${timestamp}] ${colorize(level.toUpperCase())}: ${message}`;
});

// Custom format for file logs (plain text)
const fileFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
});

// Create the logger instance
const logger = winston.createLogger({
  level: 'silly', // Log all levels (highest verbosity)
  format: winston.format.combine(
    winston.format.timestamp(), // Add timestamp to each log
    winston.format.errors({ stack: true }) // Include stack traces for errors
  ),
  transports: [
    // Console Transport (with Chalk colors)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        consoleFormat // Use colorized format for console
      ),
    }),

    // File Transport (plain text, no colors)
    new winston.transports.File({
      filename: 'logs/app.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        fileFormat // Use plain text format for file
      ),
    }),
  ],
}
);

export default logger;