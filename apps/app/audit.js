import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wecmpncixopetvunkkyd.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlY21wbmNpeG9wZXR2dW5ra3lkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDYwNzQ3MCwiZXhwIjoyMTAwMTgzNDcwfQ.ncE3DIcBWW2r_koo8czo_JrWzV_9Y36oKmm1Yw-tOlQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('plan_participants')
    .select('rsvp_status, skip_reason, user_id, plan_id')
    .in('rsvp_status', ['JOINED', 'INVITED', 'WAITLISTED'])
    .not('skip_reason', 'is', null);

  if (error) {
    console.error('Error fetching data:', error);
  } else {
    console.log(`Found ${data.length} rows violating the invariant.`);
    if (data.length > 0) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

main();
