// Migration runner script - execute with: npx vite-node scripts/migrate.ts
import { resolve } from 'path';
import { runMigrations } from '../src/lib/migrate';

const migrationsDir = resolve(import.meta.dirname, '..', 'migrations');

console.log('Running database migrations...');
console.log(`Migrations directory: ${migrationsDir}`);

const result = await runMigrations(migrationsDir);

if (result.error) {
  console.error(`Migration error: ${result.error}`);
  process.exit(1);
}

if (result.applied.length > 0) {
  console.log(`Applied ${result.applied.length} migration(s):`);
  for (const name of result.applied) {
    console.log(`  + ${name}`);
  }
} else {
  console.log('No new migrations to apply.');
}

if (result.skipped.length > 0) {
  console.log(`Skipped ${result.skipped.length} already-applied migration(s).`);
}
