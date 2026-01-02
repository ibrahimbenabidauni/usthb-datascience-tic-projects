import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Initialize schema on startup
async function initializeSchema() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set. Skipping database initialization.');
    return;
  }

  try {
    const client = await pool.connect();
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT,
        profile_picture TEXT,
        bio TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create projects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        author_id INTEGER NOT NULL REFERENCES users(id),
        section TEXT,
        group_number TEXT,
        full_name TEXT,
        matricule TEXT,
        drive_link TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add drive_link if it doesn't exist (for existing tables)
    try {
      await client.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS drive_link TEXT");
      // If we added it, it might be null for old rows. We should probably set a default or handle it.
    } catch (e) {
      console.log("drive_link column already exists or error adding it");
    }

    // Create reviews table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id),
        reviewer_id INTEGER NOT NULL REFERENCES users(id),
        rating INTEGER CHECK(rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, reviewer_id)
      )
    `);

    // Drop project_files table as it's no longer used
    await client.query("DROP TABLE IF EXISTS project_files");

    client.release();
    console.log('Database schema initialized successfully');
  } catch (err) {
    console.error('Database init error:', err.message);
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  }
}

// Initialize on module load - always attempt, just log if fails
initializeSchema().catch(err => {
  if (process.env.DATABASE_URL) {
    console.error('Schema init error:', err.message);
  }
});

export default pool;
