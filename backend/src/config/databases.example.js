// Database configurations
// Copy this file to databases.js and fill in your actual credentials
// In production, load credentials from environment variables or a secure secrets manager

const databases = {
  test: {
    connectionString: process.env.TEST_DB_CONNECTION_STRING || 'mongodb+srv://username:password@cluster.mongodb.net/test',
    username: process.env.TEST_DB_USERNAME || 'username',
    password: process.env.TEST_DB_PASSWORD || 'password',
    databaseName: 'test',
    displayName: 'Test Database',
    description: 'Development/testing environment'
  },
  'production-db': {
    connectionString: process.env.PROD_DB_CONNECTION_STRING || 'mongodb+srv://username:password@cluster.mongodb.net/production',
    username: process.env.PROD_DB_USERNAME || 'username',
    password: process.env.PROD_DB_PASSWORD || 'password',
    databaseName: 'production-db',
    displayName: 'Production Database',
    description: 'Production database'
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
