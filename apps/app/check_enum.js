import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wecmpncixopetvunkkyd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlY21wbmNpeG9wZXR2dW5ra3lkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDYwNzQ3MCwiZXhwIjoyMTAwMTgzNDcwfQ.ncE3DIcBWW2r_koo8czo_JrWzV_9Y36oKmm1Yw-tOlQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase.rpc('execute_sql_query', { query: "SELECT unnest(enum_range(NULL::rsvp_status_enum));" });
  if (error) {
    console.error('Error fetching data:', error);
  } else {
    console.log("Enum values:", data);
  }
}

main();
