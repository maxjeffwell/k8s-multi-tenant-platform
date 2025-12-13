// Database configurations
// In production, these should be loaded from environment variables or a secure secrets manager

const databases = {
  test: {
    connectionString: process.env.TEST_DB_CONNECTION_STRING,
    username: process.env.TEST_DB_USERNAME,
    password: process.env.TEST_DB_PASSWORD,
    databaseName: 'test',
    displayName: 'Test Database',
    description: 'Development/testing environment'
  },
  'educationelly-db': {
    connectionString: process.env.EDUCATIONELLY_DB_CONNECTION_STRING,
    username: process.env.EDUCATIONELLY_DB_USERNAME,
    password: process.env.EDUCATIONELLY_DB_PASSWORD,
    databaseName: 'educationelly-db',
    displayName: 'Educationelly DB',
    description: 'Production database'
  },
  'spaced-repetition': {
    connectionString: process.env.SPACED_REPETITION_CONNECTION_STRING,
    username: process.env.SPACED_REPETITION_USERNAME,
    password: process.env.SPACED_REPETITION_PASSWORD,
    databaseName: 'spaced-repetition',
    displayName: 'Spaced Repetition DB',
    description: 'Spaced repetition application database'
  },
  'postgres-aws': {
    connectionString: process.env.POSTGRES_AWS_CONNECTION_STRING,
    username: process.env.POSTGRES_AWS_USERNAME,
    password: process.env.POSTGRES_AWS_PASSWORD,
    databaseName: 'postgres',
    displayName: 'PostgreSQL AWS RDS',
    description: 'PostgreSQL production database on AWS'
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
