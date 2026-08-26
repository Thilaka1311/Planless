const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('plan_participants')
    .select('id, rsvp_status, skip_reason, user_id, plan_id')
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
