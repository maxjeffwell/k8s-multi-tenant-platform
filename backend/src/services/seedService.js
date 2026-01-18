import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import { createLogger } from '../utils/logger.js';

const log = createLogger('seed-service');

/**
 * SeedService - Seeds demo data into tenant databases
 */
class SeedService {
  /**
   * Hash a password using bcrypt (same as educationelly app)
   */
  async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  /**
   * Seed demo users and sample data into a MongoDB database
   * @param {string} connectionString - MongoDB connection string with tenant database
   * @param {Object} options - Seeding options
   * @returns {Promise<Object>} Seeding results
   */
  async seedMongoDatabase(connectionString, options = {}) {
    const {
      demoUsers = [
        { email: 'demo@example.com', password: 'demopassword' }
      ],
      sampleStudents = true
    } = options;

    let client;
    try {
      log.info('Connecting to MongoDB for seeding...');
      client = new MongoClient(connectionString);
      await client.connect();

      const db = client.db(); // Uses database from connection string
      const dbName = db.databaseName;
      log.info({ dbName }, 'Connected to database for seeding');

      const results = {
        database: dbName,
        users: [],
        students: []
      };

      // Seed demo users
      const usersCollection = db.collection('users');
      for (const user of demoUsers) {
        // Check if user already exists
        const existing = await usersCollection.findOne({ email: user.email.toLowerCase() });
        if (existing) {
          log.info({ email: user.email }, 'Demo user already exists, skipping');
          results.users.push({ email: user.email, status: 'exists' });
          continue;
        }

        // Hash password and create user
        const hashedPassword = await this.hashPassword(user.password);
        await usersCollection.insertOne({
          email: user.email.toLowerCase(),
          password: hashedPassword
        });
        log.info({ email: user.email }, 'Demo user created');
        results.users.push({ email: user.email, status: 'created' });
      }

      // Seed sample students if requested
      if (sampleStudents) {
        const studentsCollection = db.collection('students');
        const existingCount = await studentsCollection.countDocuments();

        if (existingCount === 0) {
          const sampleStudentData = [
            {
              fullName: 'Maria Garcia',
              school: 'Lincoln Elementary',
              studentId: 1001,
              teacher: 'Ms. Johnson',
              dateOfBirth: new Date('2015-03-15'),
              gender: 'Female',
              gradeLevel: 3,
              nativeLanguage: 'Spanish',
              cityOfBirth: 'Los Angeles',
              countryOfBirth: 'USA',
              ellStatus: 'Active',
              compositeLevel: 'Intermediate',
              active: true,
              designation: 'ELL'
            },
            {
              fullName: 'Ahmed Hassan',
              school: 'Lincoln Elementary',
              studentId: 1002,
              teacher: 'Ms. Johnson',
              dateOfBirth: new Date('2014-07-22'),
              gender: 'Male',
              gradeLevel: 4,
              nativeLanguage: 'Arabic',
              cityOfBirth: 'Cairo',
              countryOfBirth: 'Egypt',
              ellStatus: 'Active',
              compositeLevel: 'Beginning',
              active: true,
              designation: 'ELL'
            },
            {
              fullName: 'Linh Nguyen',
              school: 'Lincoln Elementary',
              studentId: 1003,
              teacher: 'Mr. Smith',
              dateOfBirth: new Date('2015-11-08'),
              gender: 'Female',
              gradeLevel: 3,
              nativeLanguage: 'Vietnamese',
              cityOfBirth: 'Ho Chi Minh City',
              countryOfBirth: 'Vietnam',
              ellStatus: 'Active',
              compositeLevel: 'Advanced',
              active: true,
              designation: 'ELL'
            }
          ];

          await studentsCollection.insertMany(sampleStudentData);
          log.info({ count: sampleStudentData.length }, 'Sample students created');
          results.students = sampleStudentData.map(s => ({ fullName: s.fullName, status: 'created' }));
        } else {
          log.info({ existingCount }, 'Students already exist, skipping sample data');
          results.students = [{ status: 'skipped', reason: 'data exists' }];
        }
      }

      return results;
    } catch (error) {
      log.error({ err: error }, 'Failed to seed database');
      throw error;
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  /**
   * Get MongoDB connection string for a tenant from environment
   * @param {string} databaseKey - The database key (e.g., 'mongodb-educationelly')
   * @param {string} tenantName - The tenant namespace name
   * @returns {string|null} Connection string or null if not found
   */
  getTenantConnectionString(databaseKey, tenantName) {
    const keyMap = {
      'mongodb-educationelly': 'MONGODB_EDUCATIONELLY_CONNECTION_STRING',
      'mongodb-educationelly-graphql': 'MONGODB_EDUCATIONELLY_GRAPHQL_CONNECTION_STRING',
      'mongodb-intervalai': 'MONGODB_INTERVALAI_CONNECTION_STRING'
    };

    const envKey = keyMap[databaseKey];
    if (!envKey) {
      log.warn({ databaseKey }, 'Unknown database key for seeding');
      return null;
    }

    const baseConnectionString = process.env[envKey];
    if (!baseConnectionString) {
      log.warn({ envKey }, 'Connection string not found in environment');
      return null;
    }

    // Replace database name with tenant-specific database
    const tenantDbName = `tenant_${tenantName.replace(/-/g, '_')}`;
    const tenantConnectionString = baseConnectionString.replace(
      /\/([^/?]+)(\?|$)/,
      `/${tenantDbName}$2`
    );

    return tenantConnectionString;
  }
}

const seedService = new SeedService();
export default seedService;
export { SeedService };
