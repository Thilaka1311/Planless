import fs from 'fs';
import { execSync } from 'child_process';

const sql = fs.readFileSync('supabase/migrations/20260904200000_baseline_current_production.sql', 'utf8');

// Regex extractions supporting pg_dump quoted formats
const createdTables = [...sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:"public"\.|public\.)?"?([a-zA-Z0-9_]+)"?/gi)].map(m => m[1]);
const createdEnums = [...sql.matchAll(/CREATE TYPE (?:"public"\.|public\.)?"?([a-zA-Z0-9_]+)"? AS ENUM/gi)].map(m => m[1]);
const createdFunctions = [...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (?:"public"\.|public\.)?"?([a-zA-Z0-9_]+)"?/gi)].map(m => m[1]);
const createdTriggers = [...sql.matchAll(/CREATE TRIGGER "?([a-zA-Z0-9_]+)"?/gi)].map(m => m[1]);
const createdPolicies = [...sql.matchAll(/CREATE POLICY "([^"]+)" ON/gi)].map(m => m[1]);

console.log('=== BASELINE SQL PARSED STATS ===');
console.log('Tables in baseline SQL:', new Set(createdTables).size, [...new Set(createdTables)].sort());
console.log('Enums in baseline SQL:', new Set(createdEnums).size, [...new Set(createdEnums)].sort());
console.log('Functions in baseline SQL (unique names):', new Set(createdFunctions).size);
console.log('Triggers in baseline SQL (unique names):', new Set(createdTriggers).size);
console.log('Policies in baseline SQL:', createdPolicies.length);

const dbTables = execSync('docker exec supabase_db_planless psql -U postgres -d postgres -t -A -c "SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' AND table_type = \'BASE TABLE\' ORDER BY table_name;"', { encoding: 'utf8' }).trim().split('\n');
const dbEnums = execSync('docker exec supabase_db_planless psql -U postgres -d postgres -t -A -c "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = \'public\' AND t.typtype = \'e\' ORDER BY t.typname;"', { encoding: 'utf8' }).trim().split('\n');
const dbFunctions = execSync('docker exec supabase_db_planless psql -U postgres -d postgres -t -A -c "SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = \'public\' ORDER BY proname;"', { encoding: 'utf8' }).trim().split('\n');
const dbTriggers = execSync('docker exec supabase_db_planless psql -U postgres -d postgres -t -A -c "SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = \'public\' ORDER BY trigger_name;"', { encoding: 'utf8' }).trim().split('\n');
const dbPolicies = execSync('docker exec supabase_db_planless psql -U postgres -d postgres -t -A -c "SELECT policyname || \' on \' || schemaname || \'.\' || tablename FROM pg_policies WHERE schemaname IN (\'public\', \'storage\') ORDER BY policyname;"', { encoding: 'utf8' }).trim().split('\n');

console.log('\n=== COMPARISON WITH LOCAL DB ===');
console.log('DB Tables count:', dbTables.length);
console.log('DB Enums count:', dbEnums.length);
console.log('DB Functions count (total):', dbFunctions.length, 'unique:', new Set(dbFunctions).size);
console.log('DB Triggers count (total):', dbTriggers.length, 'unique:', new Set(dbTriggers).size);
console.log('DB Policies count (public + storage):', dbPolicies.length);

const missingTables = dbTables.filter(t => !new Set(createdTables).has(t));
const extraTables = [...new Set(createdTables)].filter(t => !dbTables.includes(t));
console.log('Table Mismatches:', { missingTables, extraTables });

const missingEnums = dbEnums.filter(e => !new Set(createdEnums).has(e));
const extraEnums = [...new Set(createdEnums)].filter(e => !dbEnums.includes(e));
console.log('Enum Mismatches:', { missingEnums, extraEnums });
