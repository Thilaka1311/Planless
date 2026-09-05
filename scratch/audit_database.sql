-- =============================================================================
-- Comprehensive Database Inventory & Audit Script
-- =============================================================================

\echo '=== 1. EXTENSIONS ==='
SELECT extname, extversion FROM pg_extension ORDER BY extname;

\echo '=== 2. PUBLIC TABLES & ROW COUNTS ==='
SELECT 
  c.relname AS table_name,
  c.reltuples::bigint AS estimated_row_count,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

\echo '=== 3. PUBLIC VIEWS ==='
SELECT table_name, view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

\echo '=== 4. PUBLIC SEQUENCES ==='
SELECT sequence_name, data_type, start_value, minimum_value, maximum_value, increment
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name;

\echo '=== 5. COLUMNS IN PUBLIC TABLES ==='
SELECT 
  table_name, 
  column_name, 
  data_type, 
  udt_name,
  is_nullable, 
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

\echo '=== 6. CONSTRAINTS (PK, FK, UNIQUE, CHECK) ==='
SELECT 
  conrelid::regclass::text AS table_name,
  conname,
  CASE contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUSION'
    ELSE contype::text
  END AS constraint_type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY table_name, contype, conname;

\echo '=== 7. INDEXES IN PUBLIC SCHEMA ==='
SELECT 
  tablename, 
  indexname, 
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

\echo '=== 8. ENUMS AND CUSTOM TYPES ==='
SELECT 
  t.typname, 
  t.typtype,
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
LEFT JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND (t.typtype = 'e' OR t.typtype = 'c')
GROUP BY t.typname, t.typtype
ORDER BY t.typname;

\echo '=== 9. TRIGGERS IN PUBLIC SCHEMA ==='
SELECT 
  event_object_table AS table_name,
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

\echo '=== 10. FUNCTIONS AND RPCS IN PUBLIC SCHEMA ==='
SELECT 
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS is_security_definer,
  l.lanname AS language
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
ORDER BY p.proname, identity_arguments;

\echo '=== 11. RLS POLICIES IN PUBLIC SCHEMA ==='
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

\echo '=== 12. STORAGE BUCKETS ==='
SELECT id, name, public, avif_autodetection, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

\echo '=== 13. STORAGE RLS POLICIES ==='
SELECT 
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, policyname;

\echo '=== 14. REALTIME PUBLICATION TABLES ==='
SELECT pt.pubname, pt.tablename
FROM pg_publication p
JOIN pg_publication_tables pt ON pt.pubname = p.pubname
ORDER BY pt.pubname, pt.tablename;

\echo '=== 15. AUTH SCHEMA OBJECTS (HOOKS, TRIGGERS ON AUTH) ==='
SELECT 
  event_object_schema,
  event_object_table,
  trigger_name,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
ORDER BY event_object_table, trigger_name;
