const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
  console.log('Base de datos conectada con éxito');
});

// Función para crear las tablas automáticamente si no existen
async function createTables() {
  try {
    const client = await pool.connect();
    
    // Tabla organizations
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id SERIAL PRIMARY KEY,
        uuid UUID DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        subdomain VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log("Tablas verificadas y creadas correctamente.");
    client.release();
  } catch (err) {
    console.error("Error al crear las tablas en la base de datos:", err);
  }
}

// Ejecutamos la creación de tablas al iniciar
createTables();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};