import { createClient } from '@supabase/supabase-js';

const localUrl = 'http://127.0.0.1:54321';
const localKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const local = createClient(localUrl, localKey, { auth: { persistSession: false } });

async function verify() {
  console.log('=== VERIFYING LOCAL DATABASE ===');

  // 1. Users count and sample
  const { data: users, error: uErr } = await local.from('users').select('*');
  if (uErr) throw uErr;
  console.log('Total users in local:', users.length);
  console.log('Sample users:', users.slice(0, 3).map(u => ({ id: u.id, public_id: u.public_id, name: u.full_name, friends: u.friends, photo: u.profile_photo_path })));

  // 2. Auth users count
  const { data: authData, error: aErr } = await local.auth.admin.listUsers();
  if (aErr) throw aErr;
  console.log('Total auth.users in local:', authData.users.length);

  // 3. Friendships count and status
  const { data: friendships, error: fErr } = await local.from('friendships').select('*');
  if (fErr) throw fErr;
  console.log('Total friendships in local:', friendships.length);
  const byStatus = {};
  friendships.forEach(f => byStatus[f.status] = (byStatus[f.status] || 0) + 1);
  console.log('Friendships by status in local:', byStatus);

  // 4. Foreign key validity
  const userIds = new Set(users.map(u => u.id));
  const invalidFks = friendships.filter(f => !userIds.has(f.user_1_id) || !userIds.has(f.user_2_id) || !userIds.has(f.requested_by));
  console.log('Invalid friendship foreign keys in local:', invalidFks.length);

  // 5. Avatars in storage
  const { data: storageObjects, error: sErr } = await local.storage.from('avatars').list('', { limit: 100 });
  if (sErr) throw sErr;
  console.log('Local avatars bucket root entries:', storageObjects.length);

  // Check that every user with profile_photo_path has their file in storage
  let photoMatches = 0;
  for (const u of users) {
    if (u.profile_photo_path) {
      const relPath = u.profile_photo_path.replace(/^avatars\//, '');
      const { data: blob, error } = await local.storage.from('avatars').download(relPath);
      if (blob && !error) {
        photoMatches++;
      } else {
        console.warn('Missing avatar file for user', u.id, relPath, error ? error.message : 'no data');
      }
    }
  }
  const usersWithPhotos = users.filter(u => !!u.profile_photo_path).length;
  console.log(`Avatar files resolved: ${photoMatches} / ${usersWithPhotos} users with photos`);

  // 6. Test a user profile & friends query as performed by the application
  const testUserId = users[0].id;
  const { data: userProfile, error: qErr } = await local.from('users').select('*, friendships!friendships_user_1_id_fkey(*)').eq('id', testUserId).single();
  console.log(`Query test for user '${users[0].full_name}' passed:`, !qErr && !!userProfile);
}

verify().catch(console.error);
