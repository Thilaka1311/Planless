import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

const localClient = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

await localClient.connect();
console.log('Connected to local Supabase database successfully!');

async function getLocalSchema() {
  // 1. Tables in public
  const tablesRes = await localClient.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);
  const tables = tablesRes.rows.map(r => r.table_name);

  // 2. Columns in public
  const colsRes = await localClient.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, column_name;
  `);

  // 3. Constraints
  const conRes = await localClient.query(`
    SELECT 
      conrelid::regclass::text AS table_name,
      conname,
      contype,
      pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
    ORDER BY table_name, conname;
  `);

  // 4. Indexes
  const idxRes = await localClient.query(`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `);

  // 5. Enums
  const enumRes = await localClient.query(`
    SELECT t.typname, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder;
  `);

  // 6. Functions in public
  const fnRes = await localClient.query(`
    SELECT 
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      pg_get_function_result(p.oid) AS result_type,
      p.prosecdef AS is_security_definer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname, identity_arguments;
  `);

  // 7. Triggers
  const trgRes = await localClient.query(`
    SELECT 
      tgrelid::regclass::text AS table_name,
      tgname,
      pg_get_triggerdef(oid) AS def
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgrelid::regclass::text LIKE 'public.%' OR tgrelid::regclass::text NOT LIKE '%.%'
    ORDER BY table_name, tgname;
  `);

  // 8. RLS
  const rlsRes = await localClient.query(`
    SELECT relname, relrowsecurity
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY relname;
  `);

  // 9. Policies
  const polRes = await localClient.query(`
    SELECT tablename, policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `);

  // 10. Storage buckets
  const bktRes = await localClient.query(`
    SELECT id, name, public, file_size_limit, allowed_mime_types
    FROM storage.buckets
    ORDER BY id;
  `);

  // 11. Storage policies
  const stPolRes = await localClient.query(`
    SELECT tablename, policyname, cmd, roles
    FROM pg_policies
    WHERE schemaname = 'storage'
    ORDER BY tablename, policyname;
  `);

  return {
    tables,
    columns: colsRes.rows,
    constraints: conRes.rows,
    indexes: idxRes.rows,
    enums: enumRes.rows,
    functions: fnRes.rows,
    triggers: trgRes.rows,
    rls: rlsRes.rows,
    policies: polRes.rows,
    storageBuckets: bktRes.rows,
    storagePolicies: stPolRes.rows
  };
}

const local = await getLocalSchema();
fs.writeFileSync('/tmp/local_schema.json', JSON.stringify(local, null, 2));
console.log('Local schema extracted:');
console.log('Tables:', local.tables.length);
console.log('Columns:', local.columns.length);
console.log('Constraints:', local.constraints.length);
console.log('Indexes:', local.indexes.length);
console.log('Functions:', local.functions.length);
console.log('Triggers:', local.triggers.length);
console.log('Policies (public):', local.policies.length);
console.log('Storage buckets:', local.storageBuckets.length);
console.log('Storage policies:', local.storagePolicies.length);

await localClient.end();
