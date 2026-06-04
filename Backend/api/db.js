// Configures and exports a PostgreSQL connection pool using the 'pg' library. Reads the database URL from environment variables for secure configuration.

const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;
