const winston = require('winston');
const fs = require('fs');
const path = require('path');

/* ============================
   📁 ALWAYS CREATE LOGS DIR
============================ */
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/* ============================
   🧾 FORMATS
============================ */
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const metaString = Object.keys(meta).length
      ? ` ${JSON.stringify(meta)}`
      : '';
    return `${timestamp} [${level}]: ${message}${metaString}`;
  })
);

/* ============================
   🪵 LOGGER
============================ */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',

  // 🔥 THIS IS THE CRITICAL LINE
  exitOnError: false,

  defaultMeta: { service: 'landlord-api' },

  format: jsonFormat,

  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production'
        ? jsonFormat
        : consoleFormat,
      handleExceptions: true
    }),

    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
      handleExceptions: true
    }),

    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

/* ============================
   🧩 REQUEST LOGGER
============================ */
const requestLogger = (req, res, next) => {
  req.id =
    req.headers['x-request-id'] ||
    `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  logger.debug('Incoming request', {
    requestId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip
  });

  const start = Date.now();
  res.on('finish', () => {
    logger.debug('Request completed', {
      requestId: req.id,
      statusCode: res.statusCode,
      duration: `${Date.now() - start}ms`
    });
  });

  next();
};

/* ============================
   🚨 ERROR LOGGER
============================ */
const logError = (error, req = null) => {
  logger.error(error.message, {
    stack: error.stack,
    ...(req && {
      requestId: req.id,
      url: req.url,
      method: req.method
    })
  });
};

module.exports = {
  logger,
  requestLogger,
  logError
};
