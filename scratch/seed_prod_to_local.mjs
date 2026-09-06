import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

const env = dotenv.parse(fs.readFileSync('.env', 'utf8'));
const prodUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const prodKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!prodUrl || !prodKey) {
  console.error('Missing production Supabase credentials in .env');
  process.exit(1);
}

const localUrl = 'http://127.0.0.1:54321';
const localKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const prodClient = createClient(prodUrl, prodKey, { auth: { persistSession: false } });
const localClient = createClient(localUrl, localKey, { auth: { persistSession: false } });

async function seed() {
  console.log('====================================================');
  console.log('PHASE 1: READ-ONLY FETCH FROM PRODUCTION');
  console.log('====================================================');
  console.log('Connecting to Production:', prodUrl);

  // 1. Fetch Users
  const { data: prodUsers, error: uErr } = await prodClient.from('users').select('*').order('created_at', { ascending: true });
  if (uErr) throw new Error('Error fetching production users: ' + uErr.message);
  console.log(`Fetched ${prodUsers.length} users from production public.users`);

  // 2. Fetch Auth Users (to get emails for local login/FK preservation)
  const { data: prodAuth, error: aErr } = await prodClient.auth.admin.listUsers({ perPage: 1000 });
  if (aErr) throw new Error('Error fetching production auth users: ' + aErr.message);
  const authUserMap = new Map(prodAuth.users.map(u => [u.id, u]));
  console.log(`Fetched ${prodAuth.users.length} auth.users from production`);

  // 3. Fetch Friendships
  const { data: prodFriendships, error: fErr } = await prodClient.from('friendships').select('*').order('created_at', { ascending: true });
  if (fErr) throw new Error('Error fetching production friendships: ' + fErr.message);
  console.log(`Fetched ${prodFriendships.length} friendships from production public.friendships`);

  // 4. Discover Avatars in Storage
  const { data: rootFolders, error: sErr } = await prodClient.storage.from('avatars').list('', { limit: 200 });
  if (sErr) throw new Error('Error listing production avatars bucket: ' + sErr.message);
  
  const avatarFiles = [];
  for (const item of rootFolders) {
    if (!item.metadata) {
      // It is a directory named <userId>
      const { data: files } = await prodClient.storage.from('avatars').list(item.name);
      if (files) {
        files.forEach(f => {
          avatarFiles.push({ path: `${item.name}/${f.name}`, name: f.name });
        });
      }
    } else {
      avatarFiles.push({ path: item.name, name: item.name });
    }
  }
  console.log(`Discovered ${avatarFiles.length} avatar files in production storage bucket 'avatars'`);

  console.log('\n====================================================');
  console.log('PHASE 2: SEED LOCAL AUTH & PUBLIC USERS');
  console.log('====================================================');

  let authCreated = 0;
  let publicUsersCreated = 0;

  for (const u of prodUsers) {
    const authUser = authUserMap.get(u.id);
    const email = authUser ? authUser.email : `${u.public_id.toLowerCase()}@example.com`;

    // Create or ensure in local auth.users
    const { data: localAuthUser, error: localAuthErr } = await localClient.auth.admin.createUser({
      id: u.id,
      email: email,
      email_confirm: true,
      user_metadata: { full_name: u.full_name }
    });

    if (localAuthErr) {
      if (!localAuthErr.message.includes('already exists') && !localAuthErr.message.includes('already been registered')) {
        console.warn(`[Local Auth] Warning for user ${u.id} (${email}):`, localAuthErr.message);
      }
    } else {
      authCreated++;
    }

    // Insert into local public.users
    const { error: userInsertErr } = await localClient.from('users').upsert({
      id: u.id,
      public_id: u.public_id,
      full_name: u.full_name,
      profile_photo_path: u.profile_photo_path,
      bio: u.bio || '',
      created_at: u.created_at,
      updated_at: u.updated_at,
      profile_completed: u.profile_completed,
      username: u.username,
      role: u.role,
      friends: u.friends
    });

    if (userInsertErr) {
      throw new Error(`Failed to insert local user ${u.id} (${u.full_name}): ${userInsertErr.message}`);
    }
    publicUsersCreated++;
  }
  console.log(`Successfully seeded ${publicUsersCreated} users in local public.users (Auth users initialized: ${authCreated})`);

  console.log('\n====================================================');
  console.log('PHASE 3: SEED LOCAL FRIENDSHIPS');
  console.log('====================================================');

  let friendshipsCreated = 0;
  for (const f of prodFriendships) {
    const { error: fInsertErr } = await localClient.from('friendships').upsert({
      id: f.id,
      user_1_id: f.user_1_id,
      user_2_id: f.user_2_id,
      requested_by: f.requested_by,
      created_from_plan_id: null, // Nullified because plans are not imported; avoids FK failure
      status: f.status,
      created_at: f.created_at,
      responded_at: f.responded_at
    });

    if (fInsertErr) {
      throw new Error(`Failed to insert friendship ${f.id}: ${fInsertErr.message}`);
    }
    friendshipsCreated++;
  }
  console.log(`Successfully seeded ${friendshipsCreated} friendships in local public.friendships`);

  console.log('\n====================================================');
  console.log('PHASE 4: IMPORT AVATAR STORAGE OBJECTS');
  console.log('====================================================');

  // Ensure local bucket exists
  const { data: buckets } = await localClient.storage.listBuckets();
  if (!buckets.some(b => b.name === 'avatars')) {
    await localClient.storage.createBucket('avatars', { public: true });
  }

  let avatarsUploaded = 0;
  for (const a of avatarFiles) {
    // Read from prod storage
    const { data: blob, error: dlErr } = await prodClient.storage.from('avatars').download(a.path);
    if (dlErr) {
      console.warn(`Failed to download ${a.path} from production:`, dlErr.message);
      continue;
    }

    const buffer = Buffer.from(await blob.arrayBuffer());
    const mimeType = a.name.endsWith('.webp') ? 'image/webp' : (a.name.endsWith('.png') ? 'image/png' : 'image/jpeg');

    // Upload to local storage
    const { error: upErr } = await localClient.storage.from('avatars').upload(a.path, buffer, {
      contentType: mimeType,
      upsert: true
    });

    if (upErr) {
      console.warn(`Failed to upload ${a.path} to local storage:`, upErr.message);
    } else {
      avatarsUploaded++;
    }
  }
  console.log(`Successfully copied ${avatarsUploaded} / ${avatarFiles.length} avatar files to local Supabase Storage`);

  console.log('\n====================================================');
  console.log('PHASE 5: LOCAL VERIFICATION');
  console.log('====================================================');

  const { count: finalUserCount } = await localClient.from('users').select('*', { count: 'exact', head: true });
  const { count: finalFriendshipCount } = await localClient.from('friendships').select('*', { count: 'exact', head: true });
  const { data: localAvatarsRoot } = await localClient.storage.from('avatars').list('', { limit: 200 });

  let localAvatarFileCount = 0;
  for (const item of localAvatarsRoot) {
    if (!item.metadata) {
      const { data: sub } = await localClient.storage.from('avatars').list(item.name);
      if (sub) localAvatarFileCount += sub.length;
    } else {
      localAvatarFileCount++;
    }
  }

  console.log(`Local public.users count: ${finalUserCount} (Expected: ${prodUsers.length})`);
  console.log(`Local public.friendships count: ${finalFriendshipCount} (Expected: ${prodFriendships.length})`);
  console.log(`Local avatars in storage: ${localAvatarFileCount} (Expected: ${avatarFiles.length})`);
  console.log('\nSeed process completed successfully!');
}

seed().catch(err => {
  console.error('Fatal error during seed:', err);
  process.exit(1);
});
