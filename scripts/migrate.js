/**
 * Database Migration Script
 * Loads .env and runs schema.sql (and optional migrations) via Node pg client.
 * Use this instead of psql so migrations work with Supabase/remote DBs (SSL, same network as app).
 */

const { Client } = require('pg');
const path = require('path');
const fs = require('fs');

// Load dotenv when not already loaded (e.g. by -r dotenv/config)
if (!process.env.DATABASE_URL && require('fs').existsSync(path.join(__dirname, '../.env'))) {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ Error: DATABASE_URL environment variable is not set');
  console.error('Make sure you have a .env file with DATABASE_URL defined');
  process.exit(1);
}

// Supabase and most cloud Postgres require SSL; pg uses this by default for non-localhost.
// If your URL has sslmode=require or the host is *.supabase.co, connection will use SSL.
const isSupabase = /supabase\.co|supabase\.com/i.test(databaseUrl);
const clientConfig = {
  connectionString: databaseUrl,
  ...(isSupabase && { ssl: { rejectUnauthorized: false } }),
};

function runSqlFile(client, filePath, label) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  const sql = fs.readFileSync(fullPath, 'utf8');
  console.log(`   Running ${label || path.basename(fullPath)}...`);
  return client.query(sql);
}

async function main() {
  const displayHost = databaseUrl.replace(/:[^:@]+@/, ':****@').split('@')[1]?.split('?')[0] || 'hidden';
  console.log('🔄 Running database migration...');
  console.log('📍 Database:', displayHost);

  const client = new Client(clientConfig);

  try {
    await client.connect();
  } catch (err) {
    console.error('\n❌ Could not connect to database');
    console.error('Error:', err.message);
    if (isSupabase || /ENOTFOUND|getaddrinfo/i.test(err.message)) {
      console.error('\n📌 If using Supabase:');
      console.error('   1. Unpause the project: Dashboard → Project Settings → General → Restore project');
      console.error('   2. Wait 1–2 minutes, then run: npm run db:migrate');
      console.error('   3. Or run the schema manually: npm run db:print-schema then paste the output into');
      console.error('      Supabase Dashboard → SQL Editor → New query → Run');
    }
    process.exit(1);
  }

  try {
    // 1. Main schema
    const schemaPath = path.join(__dirname, '../src/db/schema.sql');
    await runSqlFile(client, schemaPath, 'schema.sql');
    console.log('   ✅ schema.sql');

    // 2. Optional migrations (002, 003, ...)
    const migrationsDir = path.join(__dirname, '../src/db/migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        await runSqlFile(client, path.join(migrationsDir, file), file);
        console.log(`   ✅ ${file}`);
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Verify with: SELECT tablename FROM pg_tables WHERE schemaname = \'public\';');
  } catch (err) {
    console.error('\n❌ Migration failed');
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
