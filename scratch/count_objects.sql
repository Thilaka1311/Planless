-- Exact Counts Summary
SELECT 'public_tables' AS object_type, count(*)::text AS count
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'
UNION ALL
SELECT 'public_columns', count(*)::text
FROM information_schema.columns WHERE table_schema = 'public'
UNION ALL
SELECT 'primary_keys', count(*)::text
FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'p'
UNION ALL
SELECT 'foreign_keys', count(*)::text
FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f'
UNION ALL
SELECT 'unique_constraints', count(*)::text
FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'u'
UNION ALL
SELECT 'check_constraints', count(*)::text
FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'c'
UNION ALL
SELECT 'all_constraints', count(*)::text
FROM pg_constraint WHERE connamespace = 'public'::regnamespace
UNION ALL
SELECT 'indexes', count(*)::text
FROM pg_indexes WHERE schemaname = 'public'
UNION ALL
SELECT 'triggers', count(*)::text
FROM information_schema.triggers WHERE trigger_schema = 'public'
UNION ALL
SELECT 'functions_rpcs', count(*)::text
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
UNION ALL
SELECT 'custom_enums', count(*)::text
FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'
UNION ALL
SELECT 'rls_enabled_tables', count(*)::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
UNION ALL
SELECT 'rls_policies_public', count(*)::text
FROM pg_policies WHERE schemaname = 'public'
UNION ALL
SELECT 'storage_buckets', count(*)::text
FROM storage.buckets
UNION ALL
SELECT 'storage_policies', count(*)::text
FROM pg_policies WHERE schemaname = 'storage'
UNION ALL
SELECT 'views', count(*)::text
FROM information_schema.views WHERE table_schema = 'public'
UNION ALL
SELECT 'sequences', count(*)::text
FROM information_schema.sequences WHERE sequence_schema = 'public'
UNION ALL
SELECT 'extensions', count(*)::text
FROM pg_extension
UNION ALL
SELECT 'realtime_tables', count(*)::text
FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
