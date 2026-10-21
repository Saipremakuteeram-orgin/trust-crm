import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = path.join(repositoryRoot, 'backend', 'src', 'migrations');
const outputPath = path.join(repositoryRoot, 'supabase', 'combined-schema.sql');

const migrationFiles = fs.readdirSync(migrationsDirectory)
  .filter((fileName) => /^\d{3}_.+\.sql$/.test(fileName))
  .sort((left, right) => Number(left.slice(0, 3)) - Number(right.slice(0, 3)));

const sections = migrationFiles.map((fileName) => {
  const version = fileName.slice(0, 3);
  // The legacy 000 file used a MySQL-style heading. Normalize it for PostgreSQL.
  const sql = fs.readFileSync(path.join(migrationsDirectory, fileName), 'utf8')
    .replace(/^#(?=\s)/gm, '--')
    .replace(/[ \t]+$/gm, '')
    .trim();

  return [
    `-- -----------------------------------------------------------------------------`,
    `-- Migration ${fileName}`,
    `-- -----------------------------------------------------------------------------`,
    sql,
    '',
    `INSERT INTO public.schema_migrations (version)`,
    `VALUES ('${version}')`,
    `ON CONFLICT (version) DO NOTHING;`,
  ].join('\n');
});

const bundle = [
  '-- Trust CRM combined Supabase schema bundle',
  '-- Generated from backend/src/migrations/*.sql in numeric order.',
  '-- CLEAN DATABASE ONLY: use the migration runner for an existing database.',
  '-- The bundle records versions in public.schema_migrations after each section.',
  '',
  'BEGIN;',
  'SET LOCAL search_path = public;',
  '',
  sections.join('\n\n'),
  '',
  'COMMIT;',
  '',
].join('\n');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, bundle, 'utf8');
console.log(`Wrote ${path.relative(repositoryRoot, outputPath)} from ${migrationFiles.length} migrations.`);
