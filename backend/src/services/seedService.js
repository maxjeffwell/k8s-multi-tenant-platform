import { MongoClient } from 'mongodb';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { createLogger } from '../utils/logger.js';

const { Client } = pg;
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
   * Seed demo users and rooms into a PostgreSQL database (Code Talk)
   * @param {string} connectionString - PostgreSQL connection string
   * @param {Object} options - Seeding options
   * @returns {Promise<Object>} Seeding results
   */
  async seedPostgresDatabase(connectionString, options = {}) {
    const {
      demoUsers = [
        { username: 'demo', email: 'demo@demo.example', password: 'demopassword' },
        { username: 'demo2', email: 'demo2@demo.example', password: 'demopassword' }
      ],
      defaultRooms = [
        'General Discussion',
        'JavaScript Help',
        'React Development',
        'Node.js Backend'
      ]
    } = options;

    const client = new Client({ connectionString });

    try {
      log.info('Connecting to PostgreSQL for seeding...');
      await client.connect();
      log.info('Connected to PostgreSQL database for seeding');

      const results = {
        users: [],
        rooms: [],
        userRooms: []
      };

      // Seed demo users
      for (const user of demoUsers) {
        // Check if user already exists
        const existingUser = await client.query(
          'SELECT id FROM users WHERE username = $1 OR email = $2',
          [user.username, user.email]
        );

        if (existingUser.rows.length > 0) {
          log.info({ username: user.username }, 'Demo user already exists, skipping');
          results.users.push({ username: user.username, status: 'exists', id: existingUser.rows[0].id });
          continue;
        }

        // Hash password and create user
        const hashedPassword = await this.hashPassword(user.password);
        const insertResult = await client.query(
          `INSERT INTO users (username, email, password, role, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           RETURNING id`,
          [user.username, user.email.toLowerCase(), hashedPassword, 'USER']
        );

        log.info({ username: user.username }, 'Demo user created');
        results.users.push({ username: user.username, status: 'created', id: insertResult.rows[0].id });
      }

      // Seed default rooms
      for (const roomTitle of defaultRooms) {
        // Check if room already exists
        const existingRoom = await client.query(
          'SELECT id FROM rooms WHERE title = $1',
          [roomTitle]
        );

        if (existingRoom.rows.length > 0) {
          log.info({ roomTitle }, 'Room already exists, skipping');
          results.rooms.push({ title: roomTitle, status: 'exists', id: existingRoom.rows[0].id });
          continue;
        }

        // Create room
        const insertResult = await client.query(
          `INSERT INTO rooms (title, "createdAt", "updatedAt")
           VALUES ($1, NOW(), NOW())
           RETURNING id`,
          [roomTitle]
        );

        log.info({ roomTitle }, 'Room created');
        results.rooms.push({ title: roomTitle, status: 'created', id: insertResult.rows[0].id });
      }

      // Associate all users with all rooms
      const createdUsers = results.users.filter(u => u.id);
      const createdRooms = results.rooms.filter(r => r.id);

      for (const user of createdUsers) {
        for (const room of createdRooms) {
          // Check if association already exists
          const existingAssoc = await client.query(
            'SELECT * FROM user_rooms WHERE "userId" = $1 AND "roomId" = $2',
            [user.id, room.id]
          );

          if (existingAssoc.rows.length === 0) {
            await client.query(
              `INSERT INTO user_rooms ("userId", "roomId", "createdAt", "updatedAt")
               VALUES ($1, $2, NOW(), NOW())`,
              [user.id, room.id]
            );
            results.userRooms.push({ userId: user.id, roomId: room.id, status: 'created' });
          }
        }
      }

      log.info({ userCount: results.users.length, roomCount: results.rooms.length }, 'PostgreSQL seeding completed');
      return results;
    } catch (error) {
      log.error({ err: error }, 'Failed to seed PostgreSQL database');
      throw error;
    } finally {
      await client.end();
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
