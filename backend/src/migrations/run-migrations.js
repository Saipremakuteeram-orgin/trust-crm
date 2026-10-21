/**
 * Migration runner for Trust CRM
 * Usage: node src/migrations/run-migrations.js [direction] [--dry-run|--contract]
 *   direction: 'up' (default) or 'down'
 *   --dry-run: list and validate migrations without connecting to Supabase
 *   --contract: validate migration safety without executing SQL
 * 
 * Migrations must be named with a numeric prefix: 001_name.sql, 002_name.sql, etc.
 * They run in numeric order (up) or reverse (down).
 * Each migration file should be idempotent (use IF NOT EXISTS and guarded creation).
 */

const fs = require('fs');
const path = require('path');
const {
  assertOperationsMigrationText,
  splitSqlStatements,
} = require('../operations/schemaContract');

const MIGRATIONS_DIR = path.join(__dirname);

function getSupabaseAdmin(client) {
  return client || require('@/config/supabaseAdmin');
}

function getMigrationFiles(migrationsDir = MIGRATIONS_DIR) {
  return fs.readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql') && /^\d{3}_/.test(fileName))
    .sort((left, right) => {
      const versionDifference = Number(left.slice(0, 3)) - Number(right.slice(0, 3));
      return versionDifference || left.localeCompare(right);
    });
}

function removeSqlComments(sqlText) {
  return sqlText
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ');
}

function getExecutableStatements(sqlText) {
  return splitSqlStatements(sqlText)
    .filter((statement) => removeSqlComments(statement).trim().length > 0);
}

function readAndValidateMigration(fileName, migrationsDir = MIGRATIONS_DIR) {
  const sqlText = fs.readFileSync(path.join(migrationsDir, fileName), 'utf8');
  assertOperationsMigrationText(sqlText, fileName);
  return {
    fileName,
    sqlText,
    statements: getExecutableStatements(sqlText),
  };
}

function validateMigrationFiles(migrationsDir = MIGRATIONS_DIR) {
  return getMigrationFiles(migrationsDir).map((fileName) => readAndValidateMigration(fileName, migrationsDir));
}

async function getAppliedMigrations(client) {
  const supabaseAdmin = getSupabaseAdmin(client);
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

async function recordMigration(version, client) {
  const supabaseAdmin = getSupabaseAdmin(client);
  const { error } = await supabaseAdmin
    .from('schema_migrations')
    .insert({ version, applied_at: new Date().toISOString() });
  if (error) throw new Error('Failed to record migration: ' + error.message);
}

async function removeMigrationRecord(version, client) {
  const supabaseAdmin = getSupabaseAdmin(client);
  const { error } = await supabaseAdmin
    .from('schema_migrations')
    .delete()
    .eq('version', version);
  if (error) throw new Error('Failed to remove migration record: ' + error.message);
}

async function runMigrations(direction = 'up', options = {}) {
  const {
    dryRun = false,
    contract = false,
    migrationsDir = MIGRATIONS_DIR,
    client,
  } = options;

  if (!['up', 'down'].includes(direction)) {
    throw new Error('Migration direction must be up or down');
  }

  const files = getMigrationFiles(migrationsDir);
  
  if (direction === 'down') {
    files.reverse();
  }

  const migrations = files.map((fileName) => readAndValidateMigration(fileName, migrationsDir));

  if (dryRun || contract) {
    const mode = contract ? 'contract' : 'dry-run';
    console.log(`Migration ${mode}: ${migrations.length} file(s) validated; no SQL executed.`);
    for (const migration of migrations) {
      console.log(`  [CHECK] ${migration.fileName} — ${migration.statements.length} statement(s)`);
    }
    return { files: migrations.map((migration) => migration.fileName), executed: false };
  }

  const applied = await getAppliedMigrations(client);
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

    const migration = migrations.find((candidate) => candidate.fileName === file);
    const statements = migration.statements;
    const supabaseAdmin = getSupabaseAdmin(client);

    for (const stmt of statements) {
      const { error } = await supabaseAdmin.rpc('execute_sql', { sql: stmt + ';' });
      if (error) {
        console.error(`    ! Statement failed in ${file}: ${stmt.slice(0, 120)}...`);
        console.error(`    Error: ${error.message}`);
        throw new Error(`Migration ${file} failed`);
      }
    }

    if (direction === 'up') {
      await recordMigration(version, client);
      console.log(`    ✅ ${file} applied`);
    } else {
      await removeMigrationRecord(version, client);
      console.log(`    ✅ ${file} rolled back`);
    }
  }

  console.log('Done.');
}

// Run if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const direction = args.find((arg) => ['up', 'down'].includes(arg)) || 'up';
  const supportedArgs = new Set(['up', 'down', '--dry-run', '--contract']);
  if (args.some((arg) => !supportedArgs.has(arg))) {
    console.error('Usage: node run-migrations.js [up|down] [--dry-run|--contract]');
    process.exit(1);
  }
  runMigrations(direction, {
    dryRun: args.includes('--dry-run'),
    contract: args.includes('--contract'),
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}

module.exports = {
  runMigrations,
  getAppliedMigrations,
  getMigrationFiles,
  getExecutableStatements,
  validateMigrationFiles,
};
