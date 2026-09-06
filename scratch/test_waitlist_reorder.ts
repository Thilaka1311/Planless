import assert from 'node:assert';

interface Friend {
  id: string;
  name: string;
  isHost?: boolean;
  waitlistPosition?: number;
}

const renumberWaitlist = (friends: Friend[]): Friend[] => {
  return friends.map((f, idx) => ({ ...f, waitlistPosition: idx + 1 }));
};

const sortGoingFriends = (friends: Friend[]): Friend[] => {
  return [...friends].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  );
};

function runReorderTests() {
  console.log('🧪 Starting tests for Waitlist Drag-and-Drop Reordering...');

  // Setup: 3 participants in waitlist: Thi, Vaishakh M, Pranav
  let waitlist: Friend[] = [
    { id: 'u1', name: 'Thi', waitlistPosition: 1 },
    { id: 'u2', name: 'vaishakh M', waitlistPosition: 2 },
    { id: 'u3', name: 'Pranav', waitlistPosition: 3 },
  ];

  // Helper simulating how WaitlistSection computes itemIndex for each slot:
  // const itemIndex = idx + indexOffset;
  const getRenderedPositions = (list: Friend[]) =>
    list.map((item, idx) => ({
      name: item.name,
      renderedIndex: `#${idx + 1}`,
      objectWaitlistPosition: item.waitlistPosition,
    }));

  console.log('Test 1: Initial waitlist state');
  let positions = getRenderedPositions(waitlist);
  assert.deepStrictEqual(
    positions.map((p) => `${p.renderedIndex} ${p.name}`),
    ['#1 Thi', '#2 vaishakh M', '#3 Pranav']
  );
  console.log('✓ Initial positions match: #1 Thi, #2 vaishakh M, #3 Pranav');

  console.log('\nTest 2: Drag #1 (Thi) -> #3 (bottom)');
  // Reorder array: [vaishakh M, Pranav, Thi]
  const reordered1 = [waitlist[1], waitlist[2], waitlist[0]];
  waitlist = renumberWaitlist(reordered1);
  positions = getRenderedPositions(waitlist);
  assert.deepStrictEqual(
    positions.map((p) => `${p.renderedIndex} ${p.name}`),
    ['#1 vaishakh M', '#2 Pranav', '#3 Thi']
  );
  // Also verify internal objects are renumbered
  assert.strictEqual(waitlist[0].waitlistPosition, 1);
  assert.strictEqual(waitlist[1].waitlistPosition, 2);
  assert.strictEqual(waitlist[2].waitlistPosition, 3);
  console.log('✓ Drag #1 -> #3 immediately renumbers: #1 vaishakh M, #2 Pranav, #3 Thi');

  console.log('\nTest 3: Drag #3 (Thi) back to #1 (top)');
  const reordered2 = [waitlist[2], waitlist[0], waitlist[1]];
  waitlist = renumberWaitlist(reordered2);
  positions = getRenderedPositions(waitlist);
  assert.deepStrictEqual(
    positions.map((p) => `${p.renderedIndex} ${p.name}`),
    ['#1 Thi', '#2 vaishakh M', '#3 Pranav']
  );
  console.log('✓ Drag #3 -> #1 immediately renumbers: #1 Thi, #2 vaishakh M, #3 Pranav');

  console.log('\nTest 4: Drag middle participant (#2 vaishakh M -> #1 top)');
  const reordered3 = [waitlist[1], waitlist[0], waitlist[2]];
  waitlist = renumberWaitlist(reordered3);
  positions = getRenderedPositions(waitlist);
  assert.deepStrictEqual(
    positions.map((p) => `${p.renderedIndex} ${p.name}`),
    ['#1 vaishakh M', '#2 Thi', '#3 Pranav']
  );
  console.log('✓ Middle drag renumbers: #1 vaishakh M, #2 Thi, #3 Pranav');

  console.log('\nTest 5: Plan Size + promotes the reordered #1 (vaishakh M)');
  const promoted = waitlist[0];
  assert.strictEqual(promoted.name, 'vaishakh M', 'Must promote current #1 in array');
  waitlist = renumberWaitlist(waitlist.slice(1));
  positions = getRenderedPositions(waitlist);
  assert.deepStrictEqual(
    positions.map((p) => `${p.renderedIndex} ${p.name}`),
    ['#1 Thi', '#2 Pranav']
  );
  console.log('✓ Promoted vaishakh M, remaining waitlist renumbered: #1 Thi, #2 Pranav');

  console.log('\nTest 6: Plan Size - demotes last alphabetical Going and appends to end');
  // Suppose Going has Host + Bhaavya + Renjith
  // Demoting Renjith:
  const demoted: Friend = { id: 'u4', name: 'Renjith' };
  waitlist = renumberWaitlist([...waitlist, demoted]);
  positions = getRenderedPositions(waitlist);
  assert.deepStrictEqual(
    positions.map((p) => `${p.renderedIndex} ${p.name}`),
    ['#1 Thi', '#2 Pranav', '#3 Renjith']
  );
  console.log('✓ Demoted Renjith appended as #3: #1 Thi, #2 Pranav, #3 Renjith');

  console.log('\nTest 7: Switching tabs or navigating back/forward preserves custom waitlist order');
  // Simulate WhoIsActuallyComing selectedFriends useMemo:
  const priorityIds = ['host', 'f_going_1'];
  const rawFriends = [
    { id: 'f_going_1', name: 'Bhaavya' },
    ...waitlist,
  ];
  const prioritySet = new Set(priorityIds);
  const goingFriends = priorityIds
    .map((id) => rawFriends.find((f) => f.id === id))
    .filter((f): f is Friend => Boolean(f));
  const waitFriends = rawFriends.filter((f) => !prioritySet.has(f.id));
  const restored = [...goingFriends, ...waitFriends];

  const restoredWaitlist = restored.filter((f) => !prioritySet.has(f.id));
  assert.deepStrictEqual(
    restoredWaitlist.map((w) => w.name),
    ['Thi', 'Pranav', 'Renjith'],
    'Restored waitlist retains exact reordered sequence'
  );
  console.log('✓ Navigation roundtrip preserves exact custom order');

  console.log('\n🎉 ALL REORDER TESTS PASSED!');
}

runReorderTests();
