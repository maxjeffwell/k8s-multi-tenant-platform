import { z } from 'zod';

// ============================================================================
// Base Validators
// ============================================================================

/**
 * Kubernetes resource name validator
 * RFC 1123: lowercase alphanumeric, hyphens allowed (not at start/end), max 63 chars
 */
export const k8sNameSchema = z
  .string()
  .min(1, 'Name is required')
  .max(63, 'Name must not exceed 63 characters')
  .regex(
    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/,
    'Must be lowercase alphanumeric, may contain hyphens (not at start/end)'
  );

/**
 * Tenant name - alias for k8s name with specific error message
 */
export const tenantNameSchema = k8sNameSchema.describe('Tenant name');

/**
 * CPU resource format validator
 * Accepts: '100m', '0.5', '1', '2', '4' (millicores or cores)
 */
export const cpuSchema = z
  .string()
  .regex(
    /^(\d+m|\d+(\.\d+)?|0\.\d+)$/,
    'CPU must be in format like "100m", "0.5", "1", "2" (millicores or cores)'
  )
  .refine(
    (val) => {
      // Convert to millicores for comparison
      let millicores;
      if (val.endsWith('m')) {
        millicores = parseInt(val);
      } else {
        millicores = parseFloat(val) * 1000;
      }
      return millicores >= 100 && millicores <= 16000; // 100m to 16 cores
    },
    { message: 'CPU must be between 100m and 16 cores' }
  )
  .optional()
  .default('2');

/**
 * Memory resource format validator
 * Accepts: '256Mi', '1Gi', '2Gi', '4Gi', '8Gi', '16Gi' (or MB/GB variants)
 */
export const memorySchema = z
  .string()
  .regex(
    /^(\d+)(Mi|Gi|MB|GB|M|G)$/i,
    'Memory must be in format like "256Mi", "1Gi", "2GB"'
  )
  .refine(
    (val) => {
      // Convert to bytes for comparison
      const match = val.match(/^(\d+)(Mi|Gi|MB|GB|M|G)$/i);
      if (!match) return false;
      const value = parseInt(match[1]);
      const unit = match[2].toLowerCase();

      let bytes;
      if (unit === 'mi' || unit === 'm') {
        bytes = value * 1024 * 1024;
      } else if (unit === 'gi' || unit === 'g' || unit === 'gb') {
        bytes = value * 1024 * 1024 * 1024;
      } else if (unit === 'mb') {
        bytes = value * 1000 * 1000;
      } else {
        return false;
      }

      // Min 128Mi (128MB), Max 32Gi (32GB)
      return bytes >= 128 * 1024 * 1024 && bytes <= 32 * 1024 * 1024 * 1024;
    },
    { message: 'Memory must be between 128Mi and 32Gi' }
  )
  .optional()
  .default('4Gi');

/**
 * Resource quota schema
 */
export const resourceQuotaSchema = z.object({
  cpu: cpuSchema,
  memory: memorySchema
}).strict();

/**
 * Replica count validator (1-10 based on platform limits)
 */
export const replicaCountSchema = z
  .number()
  .int('Replicas must be a whole number')
  .min(0, 'Replicas cannot be negative')
  .max(10, 'Replicas cannot exceed 10 (platform limit)')
  .optional()
  .default(1);

/**
 * Docker image name validator
 * Accepts: 'nginx', 'nginx:latest', 'registry.io/image:tag', 'user/repo:v1.0.0'
 */
export const dockerImageSchema = z
  .string()
  .min(1, 'Image name is required')
  .max(256, 'Image name too long')
  .regex(
    /^[a-z0-9][a-z0-9._\/-]*[a-z0-9](:[a-z0-9._-]+)?$/i,
    'Invalid Docker image format. Examples: "nginx", "nginx:latest", "registry.io/image:tag"'
  )
  .refine(
    (val) => !val.includes('..') && !val.includes('//'),
    { message: 'Image name contains invalid path sequences' }
  )
  .optional();

/**
 * Environment variable name validator
 * Must be valid shell variable name
 */
export const envVarNameSchema = z
  .string()
  .min(1, 'Environment variable name is required')
  .max(128, 'Environment variable name too long')
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    'Environment variable name must start with letter or underscore, contain only alphanumeric and underscores'
  );

/**
 * Environment variable value validator
 */
export const envVarValueSchema = z
  .string()
  .max(32768, 'Environment variable value too long (max 32KB)');

/**
 * Single environment variable
 */
export const envVarSchema = z.object({
  name: envVarNameSchema,
  value: envVarValueSchema
}).strict();

/**
 * Environment variables array
 */
export const envVarsArraySchema = z.array(envVarSchema).max(50, 'Too many environment variables (max 50)').optional().default([]);

/**
 * Application type validator
 */
export const appTypeSchema = z
  .enum(['educationelly', 'educationelly-graphql', 'code-talk', 'bookmarked', 'firebook', 'intervalai'], {
    errorMap: () => ({ message: 'App type must be one of: educationelly, educationelly-graphql, code-talk, bookmarked, firebook, intervalai' })
  })
  .optional()
  .default('educationelly-graphql');

/**
 * MongoDB connection string validator
 */
export const mongoConnectionStringSchema = z
  .string()
  .min(1, 'Connection string is required')
  .regex(
    /^mongodb(\+srv)?:\/\/.+/,
    'Must be a valid MongoDB connection string starting with "mongodb://" or "mongodb+srv://"'
  )
  .refine(
    (val) => {
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Connection string must be a valid URL format' }
  );

/**
 * Database username validator
 */
export const databaseUsernameSchema = z
  .string()
  .min(1, 'Username is required')
  .max(128, 'Username too long')
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    'Username must start with a letter and contain only alphanumeric characters, underscores, or hyphens'
  );

/**
 * Database password validator (not stored in logs)
 */
export const databasePasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long');

/**
 * Database name validator
 */
export const databaseNameSchema = z
  .string()
  .min(1, 'Database name is required')
  .max(64, 'Database name too long')
  .regex(
    /^[a-zA-Z][a-zA-Z0-9_-]*$/,
    'Database name must start with a letter and contain only alphanumeric characters, underscores, or hyphens'
  );

/**
 * Database key for pre-configured databases
 */
export const databaseKeySchema = z
  .string()
  .min(1, 'Database key is required')
  .max(64, 'Database key too long')
  .regex(
    /^[a-z][a-z0-9-]*$/,
    'Database key must be lowercase alphanumeric with hyphens'
  );

// ============================================================================
// Composite Request Schemas
// ============================================================================

/**
 * Create tenant request body
 */
export const createTenantSchema = z.object({
  tenantName: tenantNameSchema,
  resourceQuota: resourceQuotaSchema.optional(),
  database: z.object({
    mongoUri: mongoConnectionStringSchema.optional(),
    username: databaseUsernameSchema.optional(),
    password: databasePasswordSchema.optional(),
    databaseName: databaseNameSchema.optional()
  }).optional()
}).strict();

/**
 * Update tenant request body
 */
export const updateTenantSchema = z.object({
  resourceQuota: resourceQuotaSchema
}).strict();

/**
 * Deploy application request body
 */
export const deployAppSchema = z.object({
  replicas: replicaCountSchema,
  serverImage: dockerImageSchema,
  clientImage: dockerImageSchema,
  appType: appTypeSchema,
  serverPort: z.number().int().min(1).max(65535).optional(),
  clientPort: z.number().int().min(1).max(65535).optional(),
  env: envVarsArraySchema
}).strict();

/**
 * Scale deployment request body
 */
export const scaleDeploymentSchema = z.object({
  replicas: z.number()
    .int('Replicas must be a whole number')
    .min(0, 'Replicas cannot be negative')
    .max(10, 'Replicas cannot exceed 10 (platform limit)')
}).strict();

/**
 * Create database request body
 */
export const createDatabaseSchema = z.object({
  databaseKey: databaseKeySchema.optional(),
  connectionString: mongoConnectionStringSchema.optional(),
  username: databaseUsernameSchema.optional(),
  password: databasePasswordSchema.optional(),
  databaseName: databaseNameSchema.optional()
}).strict().refine(
  (data) => {
    // Either databaseKey OR (connectionString with credentials) should be provided
    if (data.databaseKey) return true;
    if (data.connectionString) return true;
    // Allow empty for default shared database
    return true;
  },
  { message: 'Provide either databaseKey or connection credentials' }
);

/**
 * Connect existing database request body
 */
export const connectDatabaseSchema = z.object({
  connectionString: mongoConnectionStringSchema.optional(),
  username: databaseUsernameSchema.optional(),
  password: databasePasswordSchema.optional(),
  databaseName: databaseNameSchema.optional()
}).strict();

/**
 * Tenant name parameter
 */
export const tenantNameParamSchema = z.object({
  tenantName: tenantNameSchema
}).strict();

/**
 * Deployment name parameter
 */
export const deploymentNameParamSchema = z.object({
  tenantName: tenantNameSchema,
  deploymentName: k8sNameSchema
}).strict();

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Validate request body and return parsed data or throw structured error
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {Object} data - Data to validate
 * @returns {Object} Validated and parsed data
 * @throws {ValidationError} If validation fails
 */
export function validateBody(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }));
    const error = new Error('Validation failed');
    error.name = 'ValidationError';
    error.statusCode = 400;
    error.errors = errors;
    throw error;
  }
  return result.data;
}

/**
 * Validate request params and return parsed data or throw structured error
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {Object} params - Params to validate
 * @returns {Object} Validated and parsed data
 * @throws {ValidationError} If validation fails
 */
export function validateParams(schema, params) {
  return validateBody(schema, params);
}

/**
 * Express middleware factory for request validation
 * @param {Object} options - Validation options
 * @param {z.ZodSchema} options.body - Schema for request body
 * @param {z.ZodSchema} options.params - Schema for URL params
 * @param {z.ZodSchema} options.query - Schema for query string
 * @returns {Function} Express middleware
 */
export function validate({ body, params, query }) {
  return (req, res, next) => {
    try {
      if (body) {
        req.validatedBody = validateBody(body, req.body);
      }
      if (params) {
        req.validatedParams = validateParams(params, req.params);
      }
      if (query) {
        req.validatedQuery = validateBody(query, req.query);
      }
      next();
    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(error.statusCode).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      next(error);
    }
  };
}

// ============================================================================
// Metrics Schemas
// ============================================================================

/**
 * Time range in seconds (for time series queries)
 */
export const timeRangeSecondsSchema = z
  .string()
  .transform((val) => parseInt(val, 10))
  .pipe(
    z.number()
      .int('Time range must be a whole number')
      .min(3600, 'Time range must be at least 3600 seconds (1 hour)')
      .max(86400, 'Time range must not exceed 86400 seconds (24 hours)')
  )
  .optional()
  .default('3600');

/**
 * Time range format (e.g., '5m', '1h', '30s')
 */
export const timeRangeFormatSchema = z
  .string()
  .regex(
    /^(\d+)(s|m|h|d)$/,
    'Time range must be in format like "30s", "5m", "1h", "1d"'
  )
  .refine(
    (val) => {
      const match = val.match(/^(\d+)(s|m|h|d)$/);
      if (!match) return false;
      const value = parseInt(match[1]);
      const unit = match[2];
      // Convert to seconds
      let seconds;
      switch (unit) {
        case 's': seconds = value; break;
        case 'm': seconds = value * 60; break;
        case 'h': seconds = value * 3600; break;
        case 'd': seconds = value * 86400; break;
        default: return false;
      }
      // Allow 30s to 24h
      return seconds >= 30 && seconds <= 86400;
    },
    { message: 'Time range must be between 30s and 24h' }
  )
  .optional()
  .default('5m');

/**
 * PromQL query validator (basic sanitization)
 */
export const promqlQuerySchema = z
  .string()
  .min(1, 'PromQL query is required')
  .max(4096, 'PromQL query too long (max 4096 characters)')
  .refine(
    (val) => {
      // Block potentially dangerous patterns
      const dangerous = [
        /;\s*drop/i,
        /;\s*delete/i,
        /;\s*truncate/i,
        /--/,
        /\/\*/,
        /<script/i,
        /javascript:/i
      ];
      return !dangerous.some(pattern => pattern.test(val));
    },
    { message: 'Query contains potentially dangerous patterns' }
  );

/**
 * Metrics time series query params
 */
export const metricsTimeSeriesQuerySchema = z.object({
  range: z.string()
    .transform((val) => parseInt(val, 10))
    .pipe(
      z.number()
        .int('Time range must be a whole number')
        .min(3600, 'Time range must be at least 3600 seconds (1 hour)')
        .max(86400, 'Time range must not exceed 86400 seconds (24 hours)')
    )
    .optional()
}).strict();

/**
 * Metrics range query params (short format like '5m')
 */
export const metricsRangeQuerySchema = z.object({
  range: timeRangeFormatSchema
}).strict();

/**
 * Custom PromQL query body
 */
export const customPromqlQuerySchema = z.object({
  query: promqlQuerySchema
}).strict();

// Export all schemas for testing
export const schemas = {
  k8sNameSchema,
  tenantNameSchema,
  cpuSchema,
  memorySchema,
  resourceQuotaSchema,
  replicaCountSchema,
  dockerImageSchema,
  envVarNameSchema,
  envVarValueSchema,
  envVarSchema,
  envVarsArraySchema,
  appTypeSchema,
  mongoConnectionStringSchema,
  databaseUsernameSchema,
  databasePasswordSchema,
  databaseNameSchema,
  databaseKeySchema,
  createTenantSchema,
  updateTenantSchema,
  deployAppSchema,
  scaleDeploymentSchema,
  createDatabaseSchema,
  connectDatabaseSchema,
  tenantNameParamSchema,
  deploymentNameParamSchema,
  timeRangeSecondsSchema,
  timeRangeFormatSchema,
  promqlQuerySchema,
  metricsTimeSeriesQuerySchema,
  metricsRangeQuerySchema,
  customPromqlQuerySchema
};
