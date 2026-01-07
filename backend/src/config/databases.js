// Database configurations
// Using local Kubernetes pods for MongoDB, PostgreSQL, and Redis
// Neon Cloud DB is kept for bookmarked application

const databases = {
  // Local MongoDB - Educationelly (default namespace)
  'mongodb-educationelly': {
    connectionString: process.env.MONGODB_EDUCATIONELLY_CONNECTION_STRING,
    username: process.env.MONGODB_EDUCATIONELLY_USERNAME,
    password: process.env.MONGODB_EDUCATIONELLY_PASSWORD,
    databaseName: 'educationelly',
    displayName: 'MongoDB Educationelly (Local)',
    description: 'Local MongoDB for Educationelly application'
  },
  // Local MongoDB - Educationelly GraphQL (default namespace)
  'mongodb-educationelly-graphql': {
    connectionString: process.env.MONGODB_EDUCATIONELLY_GRAPHQL_CONNECTION_STRING,
    username: process.env.MONGODB_EDUCATIONELLY_GRAPHQL_USERNAME,
    password: process.env.MONGODB_EDUCATIONELLY_GRAPHQL_PASSWORD,
    databaseName: 'educationelly',
    displayName: 'MongoDB Educationelly GraphQL (Local)',
    description: 'Local MongoDB for Educationelly GraphQL application'
  },
  // Local MongoDB - IntervalAI (default namespace)
  'mongodb-intervalai': {
    connectionString: process.env.MONGODB_INTERVALAI_CONNECTION_STRING,
    username: process.env.MONGODB_INTERVALAI_USERNAME,
    password: process.env.MONGODB_INTERVALAI_PASSWORD,
    databaseName: 'intervalai',
    displayName: 'MongoDB IntervalAI (Local)',
    description: 'Local MongoDB for IntervalAI spaced repetition application'
  },
  // Local PostgreSQL - Code-Talk (default namespace)
  'postgres-codetalk': {
    connectionString: process.env.POSTGRES_CODETALK_CONNECTION_STRING,
    username: process.env.POSTGRES_CODETALK_USERNAME,
    password: process.env.POSTGRES_CODETALK_PASSWORD,
    databaseName: 'codetalk',
    displayName: 'PostgreSQL Code-Talk (Local)',
    description: 'Local PostgreSQL for Code-Talk application'
  },
  // Neon PostgreSQL (Cloud - kept for bookmarked)
  'postgres-neon': {
    connectionString: process.env.NEONDB_CONNECTION_STRING,
    username: process.env.NEONDB_USERNAME,
    password: process.env.NEONDB_PASSWORD,
    databaseName: 'neondb',
    displayName: 'PostgreSQL Neon DB',
    description: 'Serverless PostgreSQL with branching'
  },
  // Local Redis (default namespace)
  'redis-local': {
    connectionString: process.env.REDIS_LOCAL_CONNECTION_STRING,
    username: '',
    password: process.env.REDIS_LOCAL_PASSWORD,
    databaseName: 'redis',
    displayName: 'Redis (Local)',
    description: 'Local Redis for caching and sessions'
  },
  // Firebase (kept for potential future use)
  'firebook-db': {
    connectionString: 'firebase://configured-via-env-vars',
    username: 'firebase',
    password: 'via-env-vars',
    databaseName: 'firebook',
    displayName: 'FireBook DB',
    description: 'Firebase Realtime Database'
  }
};

// Return database metadata without credentials
function getDatabaseOptions() {
  return Object.keys(databases).map(key => ({
    key,
    displayName: databases[key].displayName,
    description: databases[key].description
  }));
}

// Get database credentials by key
function getDatabaseConfig(key) {
  return databases[key];
}

export { getDatabaseOptions, getDatabaseConfig };
