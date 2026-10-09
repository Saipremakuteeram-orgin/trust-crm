/**
 * Migration runner for Trust CRM
 * Usage: node src/migrations/run-migrations.js [direction]
 *   direction: 'up' (default) or 'down'
 * 
 * Migrations must be named with a numeric prefix: 001_name.sql, 002_name.sql, etc.
 * They run in numeric order (up) or reverse (down).
 * Each migration file should be idempotent (use IF NOT EXISTS, DROP IF EXISTS).
 */

const fs = require('fs');
const path = require('path');
const supabaseAdmin = require('@/config/supabaseAdmin');

const MIGRATIONS_DIR = path.join(__dirname);

async function getAppliedMigrations() {
  const { data, error } = await supabaseAdmin
    .from('schema_migrations')
    .select('version')
    .order('version', { ascending: true });
  
  if (error) {
    if (error.code === '42P01') {
      // Table doesn't exist yet
      return [];
    }
    throw new Error('Failed to read schema_migrations: ' + error.message);
  }
  return data.map((r) => r.version);
}

async function recordMigration(version) {
  const { error } = await supabaseAdmin
    .from('schema_migrations')
    .insert({ version, applied_at: new Date().toISOString() });
  if (error) throw new Error('Failed to record migration: ' + error.message);
}

async function removeMigrationRecord(version) {
  const { error } = await supabaseAdmin
    .from('schema_migrations')
    .delete()
    .eq('version', version);
  if (error) throw new Error('Failed to remove migration record: ' + error.message);
}

async function runMigrations(direction = 'up') {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && /^\d{3}_/.test(f))
    .sort((a, b) => a.localeCompare(b));
  
  if (direction === 'down') {
    files.reverse();
  }

  const applied = await getAppliedMigrations();
  const appliedSet = new Set(applied);

  console.log(`Found ${files.length} migration file(s), ${applied.length} already applied.`);

  for (const file of files) {
    const version = file.slice(0, 3);
    const isApplied = appliedSet.has(version);

    if (direction === 'up') {
      if (isApplied) {
        console.log(`  [SKIP] ${file} — already applied`);
        continue;
      }
      console.log(`  [UP]   ${file}`);
    } else {
      if (!isApplied) {
        console.log(`  [SKIP] ${file} — not applied`);
        continue;
      }
      console.log(`  [DOWN] ${file}`);
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    
    // Split by semicolon, execute each statement
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      const { error } = await supabaseAdmin.rpc('execute_sql', { sql: stmt + ';' });
      if (error) {
        // Try direct query if RPC fails
        const { error: err2 } = await supabaseAdmin.from('_').select('*').limit(0).rpc('execute_sql', { sql: stmt + ';' });
        // Fallback: use raw query via Supabase's pg client isn't directly exposed.
        // For now, log and continue with next statement (may need manual cleanup).
        console.error(`    ! Statement failed in ${file}: ${stmt.slice(0, 120)}...`);
        console.error(`    Error: ${error.message}`);
        throw new Error(`Migration ${file} failed`);
      }
    }

    if (direction === 'up') {
      await recordMigration(version);
      console.log(`    ✅ ${file} applied`);
    } else {
      await removeMigrationRecord(version);
      console.log(`    ✅ ${file} rolled back`);
    }
  }

  console.log('Done.');
}

// Run if executed directly
if (require.main === module) {
  const direction = process.argv[2] || 'up';
  if (!['up', 'down'].includes(direction)) {
    console.error('Usage: node run-migrations.js [up|down]');
    process.exit(1);
  }
  runMigrations(direction)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}

module.exports = { runMigrations, getAppliedMigrations };