import pino from 'pino';

// Environment-based configuration
const isDevelopment = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Sensitive fields that should be redacted from logs
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'password',
  'secret',
  'token',
  'apiKey',
  'connectionString',
  'MONGODB_URI',
  'MONGODB_URL',
  'MONGO_URI',
  'MONGO_URL',
  'MONGO_PASSWORD',
  '*.password',
  '*.secret',
  '*.token',
  '*.apiKey',
  '*.connectionString'
];

// Base logger configuration
const baseConfig = {
  level: logLevel,

  // Redact sensitive information
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]'
  },

  // Add service metadata
  base: {
    service: 'k8s-multi-tenant-platform',
    version: process.env.npm_package_version || '1.0.0',
    env: process.env.NODE_ENV || 'development'
  },

  // Timestamp formatting
  timestamp: pino.stdTimeFunctions.isoTime,

  // Error serialization
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    req: (req) => ({
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      params: req.params,
      remoteAddress: req.ip || req.remoteAddress,
      userAgent: req.headers?.['user-agent']
    }),
    res: (res) => ({
      statusCode: res.statusCode
    })
  }
};

// Development: pretty print for readability
// Production: JSON for log aggregation systems
const transportConfig = isDevelopment
  ? {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname,service,version,env',
          messageFormat: '{msg}',
          singleLine: false
        }
      }
    }
  : {};

// Create the logger instance
const logger = pino({
  ...baseConfig,
  ...transportConfig
});

// Create child loggers for different modules
export function createLogger(module) {
  return logger.child({ module });
}

// HTTP request logging configuration for pino-http
export const httpLoggerConfig = {
  logger,

  // Custom log level based on response status
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'silent'; // Don't log redirects
    return 'info';
  },

  // Custom success message
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} completed`;
  },

  // Custom error message
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} failed: ${err.message}`;
  },

  // Custom attribute keys
  customAttributeKeys: {
    req: 'request',
    res: 'response',
    err: 'error',
    responseTime: 'duration'
  },

  // Don't log health check endpoints in production
  autoLogging: {
    ignore: (req) => {
      const ignorePaths = ['/health', '/ready', '/live', '/metrics'];
      return !isDevelopment && ignorePaths.includes(req.url);
    }
  },

  // Generate correlation IDs
  genReqId: (req, res) => {
    const existingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
    if (existingId) return existingId;

    // Generate a simple unique ID
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  },

  // Custom props to add to each log
  customProps: (req, res) => ({
    correlationId: req.id
  })
};

// Utility function to sanitize objects before logging
export function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'authorization', 'cookie'];
  const sanitized = { ...obj };

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitize(sanitized[key]);
    }
  }

  return sanitized;
}

// Log context helper for adding structured metadata
export function withContext(context) {
  return logger.child(context);
}

// Export default logger
export default logger;
