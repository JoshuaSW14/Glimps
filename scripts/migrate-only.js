/**
 * Run only migrations (no schema.sql). Use when the DB already has the base schema
 * but is missing tables from later migrations (e.g. users).
 * Usage: npm run db:migrate:only
 */

const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

if (!process.env.DATABASE_URL && fs.existsSync(path.join(__dirname, '../.env'))) {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const isSupabase = /supabase\.co|supabase\.com/i.test(databaseUrl);
const clientConfig = {
  connectionString: databaseUrl,
  ...(isSupabase && { ssl: { rejectUnauthorized: false } }),
};

async function main() {
  const migrationsDir = path.join(__dirname, '../src/db/migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error('❌ No migrations folder found');
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.log('No migration files found.');
    process.exit(0);
  }

  console.log('🔄 Running migrations only...');
  const client = new Client(clientConfig);

  try {
    await client.connect();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`   Running ${file}...`);
      await client.query(sql);
      console.log(`   ✅ ${file}`);
    }
    console.log('\n✅ Migrations completed successfully!');
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
