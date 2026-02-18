/**
 * Print schema.sql (and migrations) to stdout for pasting into Supabase SQL Editor
 * when npm run db:migrate fails (e.g. ENOTFOUND / paused project).
 *
 * Usage: npm run db:print-schema
 * Then: Supabase Dashboard → SQL Editor → New query → paste → Run
 */

const path = require('path');
const fs = require('fs');

const schemaPath = path.join(__dirname, '../src/db/schema.sql');
const migrationsDir = path.join(__dirname, '../src/db/migrations');

let out = fs.readFileSync(schemaPath, 'utf8');

if (fs.existsSync(migrationsDir)) {
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    out += '\n\n-- ' + file + '\n\n' + fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  }
}

process.stdout.write(out);
