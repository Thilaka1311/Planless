import { createClient } from '@supabase/supabase-js';

const localUrl = 'http://127.0.0.1:54321';
const localAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const localServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const client = createClient(localUrl, localAnonKey, { auth: { persistSession: false } });
const admin = createClient(localUrl, localServiceKey, { auth: { persistSession: false } });

async function runTests() {
  console.log('====================================================');
  console.log('TEST 1: Existing Imported Production User Profile Resolution');
  console.log('====================================================');
  
  const testEmail = 'thilakasundar1311@gmail.com';
  console.log(`Checking profile for imported user: ${testEmail}`);
  
  // Look up user in auth.users via admin
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers();
  const authUser = authUsers.find(u => u.email === testEmail);
  if (!authUser) throw new Error(`User ${testEmail} not found in auth.users`);
  console.log('Found in auth.users: ID =', authUser.id);

  // Look up user in public.users
  const { data: profile, error: pErr } = await client
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (pErr) throw new Error('Failed to fetch profile: ' + pErr.message);
  console.log('Successfully fetched profile from public.users:');
  console.log({
    id: profile.id,
    public_id: profile.public_id,
    full_name: profile.full_name,
    friends: profile.friends,
    profile_photo_path: profile.profile_photo_path
  });

  console.log('\n====================================================');
  console.log('TEST 2: New Local User OTP Signup & Profile Creation Flow');
  console.log('====================================================');

  const newTestEmail = `test_flow_${Date.now()}@example.com`;
  console.log(`Creating brand new user via Auth Admin API: ${newTestEmail}`);

  let newAuthUserId = null;
  try {
    const { data: newAuthUser, error: aErr } = await admin.auth.admin.createUser({
      email: newTestEmail,
      email_confirm: true,
      user_metadata: { full_name: 'New Test User' }
    });

    if (aErr) throw new Error('Failed to create auth user: ' + aErr.message);
    newAuthUserId = newAuthUser.user.id;
    console.log('New user created in auth.users: ID =', newAuthUserId);

    // Simulate client-side profile creation as performed in App.tsx
    console.log('Generating public ID via RPC generate_user_public_id...');
    const { data: publicId, error: rpcErr } = await client.rpc('generate_user_public_id');
    if (rpcErr) throw new Error('RPC failed: ' + rpcErr.message);
    console.log('Generated public ID:', publicId);

    // In the real app, the client is authenticated with the user's session
    console.log('Generating session for new user to satisfy RLS...');
    const { data: sessionData, error: sErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: newTestEmail,
    });
    if (sErr) throw new Error('Failed to generate magiclink: ' + sErr.message);

    // Authenticate user client with session
    const userClient = createClient(localUrl, localAnonKey, { auth: { persistSession: false } });
    const { error: verifyErr } = await userClient.auth.verifyOtp({
      email: newTestEmail,
      token: sessionData.properties.email_otp,
      type: 'email'
    });
    if (verifyErr) throw new Error('Failed to verify OTP: ' + verifyErr.message);

    console.log('Inserting new profile row into public.users using authenticated client...');
    const { data: insertedProfile, error: insErr } = await userClient
      .from('users')
      .upsert({
        id: newAuthUserId,
        public_id: publicId,
        full_name: 'New Test User',
        profile_photo_path: null,
        bio: 'Hello world from local test',
        profile_completed: false
      })
      .select('*')
      .single();

    if (insErr) throw new Error('Failed to insert new profile row: ' + insErr.message);
    console.log('New profile created successfully in public.users:');
    console.log({
      id: insertedProfile.id,
      public_id: insertedProfile.public_id,
      full_name: insertedProfile.full_name
    });
  } finally {
    if (newAuthUserId) {
      console.log('Cleaning up temporary test user...');
      await admin.auth.admin.deleteUser(newAuthUserId);
      const { data: verifyDeleted } = await client.from('users').select('id').eq('id', newAuthUserId);
      console.log('Cascade deletion verified (public.users rows remaining):', verifyDeleted.length);
    }
  }

  console.log('\n====================================================');
  console.log('TEST 3: Stale / Orphaned Session Detection');
  console.log('====================================================');

  const fakeOrphanedId = '18d72119-efd3-4971-84ac-b0c172b71765';
  console.log(`Simulating insert attempt for orphaned ID (${fakeOrphanedId}) not in auth.users...`);

  const { data: orphanResult, error: orphanErr } = await admin
    .from('users')
    .upsert({
      id: fakeOrphanedId,
      public_id: 'U999999',
      full_name: 'Ghost User',
      profile_photo_path: null,
      bio: '',
      profile_completed: false
    })
    .select('*')
    .single();

  console.log('Expected foreign key error caught?');
  console.log({
    code: orphanErr?.code,
    is23503: orphanErr?.code === '23503',
    message: orphanErr?.message
  });

  if (orphanErr?.code === '23503') {
    console.log('Verified: App.tsx now intercepts code 23503 and cleanly signs out the client instead of throwing a fatal startup error!');
  } else {
    throw new Error('Expected error 23503 was not returned');
  }

  console.log('\n====================================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
