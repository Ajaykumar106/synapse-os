// Synapse OS — Comprehensive End-to-End Test Suite
// Verifies every perspective: UI Theme, Privacy, Security/SSRF, Tasks CRUD,
// Discipline Stats, Routine Timetable, Notes CRUD, Voice & AI Streaming Neural Linking.

const BASE = 'http://localhost:5100';

async function runTests() {
  const results = [];
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      results.push({ name, status: 'PASS' });
      passed++;
      console.log(`✅ PASS: ${name}`);
    } catch (err) {
      results.push({ name, status: 'FAIL', error: err.message });
      failed++;
      console.log(`❌ FAIL: ${name} -> ${err.message}`);
    }
  }

  function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
  }

  console.log('\n=================================================');
  console.log('🧪 RUNNING SYNAPSE OS COMPREHENSIVE E2E SUITE');
  console.log('=================================================\n');

  // --- 1. HEALTH, THEME & UI INTEGRATION ---
  await test('1.1 Health & App Version API', async () => {
    const res = await fetch(`${BASE}/api/version`);
    assert(res.ok, `HTTP ${res.status}`);
    const data = await res.json();
    assert(data.version === '2.0.0', `Expected version 2.0.0, got ${data.version}`);
  });

  await test('1.2 Index HTML loads in Light Mode by default & cleaned', async () => {
    const res = await fetch(`${BASE}/`);
    assert(res.ok, `HTTP ${res.status}`);
    const html = await res.text();
    assert(html.includes('data-theme="light"'), 'HTML does not have data-theme="light" default');
    assert(!html.includes('id="openPhoneModalBtn"'), 'openPhoneModalBtn still present in HTML');
    assert(html.includes('id="openVoiceLiveBtn"'), 'openVoiceLiveBtn missing from HTML');
    assert(html.includes('id="voiceLiveModal"'), 'voiceLiveModal missing from HTML');
    assert(html.includes('live-wave-spectrum'), 'Modern soundwave spectrum missing from HTML');
  });

  await test('1.3 PWA Manifest completeness', async () => {
    const res = await fetch(`${BASE}/manifest.json`);
    assert(res.ok, `HTTP ${res.status}`);
    const m = await res.json();
    assert(m.icons && m.icons.length >= 2, 'Manifest missing icons');
    assert(m.display === 'standalone', 'display is not standalone');
    assert(m.start_url === '/', 'start_url is not /');
  });

  await test('1.4 Service Worker script served properly', async () => {
    const res = await fetch(`${BASE}/sw.js`);
    assert(res.ok, `HTTP ${res.status}`);
    const text = await res.text();
    assert(text.includes('synapse-os-v1'), 'sw.js does not contain synapse-os-v1 cache key');
  });

  await test('1.5 Privacy Policy accessible & clear of technical jargon', async () => {
    const res = await fetch(`${BASE}/privacy.html`);
    assert(res.ok, `HTTP ${res.status}`);
    const text = await res.text();
    assert(text.includes('Privacy Policy'), 'Privacy title missing');
    assert(!text.includes('Ollama'), 'Privacy policy still mentions Ollama');
  });

  // --- 2. SECURITY & SSRF PROTECTION ---
  await test('2.1 SSRF Security: Block internal/loopback URL fetches', async () => {
    const res = await fetch(`${BASE}/api/web/fetch?url=http://localhost:5100/api/version`);
    assert(res.status === 403, `Expected status 403, got ${res.status}`);
  });

  await test('2.2 SSRF Security: Allow legitimate Wikipedia fetches', async () => {
    const res = await fetch(`${BASE}/api/web/fetch?url=https://en.wikipedia.org/wiki/Mitochondrion`);
    assert(res.ok, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(data.title, 'Wikipedia fetch did not return title');
  });

  // --- 3. TASKS MODULE (CRUD & PERSISTENCE) ---
  let createdTaskId = null;
  await test('3.1 Tasks: Fetch task list', async () => {
    const res = await fetch(`${BASE}/api/tasks`);
    assert(res.ok, `HTTP ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), 'Tasks is not an array');
  });

  await test('3.2 Tasks: Add new study task', async () => {
    const res = await fetch(`${BASE}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'E2E Test Physics Problem 42', category: 'Study' })
    });
    assert(res.ok, `HTTP ${res.status}`);
    const created = await res.json();
    assert(created.id && created.text === 'E2E Test Physics Problem 42', 'Task creation payload invalid');
    createdTaskId = created.id;

    // Verify persistence in task list
    const getRes = await fetch(`${BASE}/api/tasks`);
    const all = await getRes.json();
    assert(all.some(t => t.id === createdTaskId), 'Created task not persisted in tasks list');
  });

  await test('3.3 Tasks: Toggle task completion', async () => {
    assert(createdTaskId, 'No taskId to toggle');
    const res = await fetch(`${BASE}/api/tasks/${createdTaskId}/toggle`, { method: 'POST' });
    assert(res.ok, `HTTP ${res.status}`);
    const data = await res.json();
    assert(data.success && data.item && data.item.completed === true, 'Task completed status was not toggled');
  });

  await test('3.4 Tasks: Delete task', async () => {
    assert(createdTaskId, 'No taskId to delete');
    const res = await fetch(`${BASE}/api/tasks/${createdTaskId}`, { method: 'DELETE' });
    assert(res.ok, `HTTP ${res.status}`);
    const getRes = await fetch(`${BASE}/api/tasks`);
    const all = await getRes.json();
    assert(!all.some(t => t.id === createdTaskId), 'Deleted task still present in list');
  });

  // --- 4. DISCIPLINE & URGE DEFENSE MODULE ---
  await test('4.1 Discipline: Fetch stats', async () => {
    const res = await fetch(`${BASE}/api/discipline-stats`);
    assert(res.ok, `HTTP ${res.status}`);
    const data = await res.json();
    assert(typeof data.streak === 'number', 'streak is not a number');
    assert(typeof data.score === 'number', 'score is not a number');
    assert(typeof data.distractionsResisted === 'number', 'distractionsResisted is not a number');
  });

  await test('4.2 Discipline: Log urge defeated (+1 win)', async () => {
    const initialRes = await fetch(`${BASE}/api/discipline-stats`);
    const initial = await initialRes.json();

    const updatedStats = {
      ...initial,
      distractionsResisted: (initial.distractionsResisted || 0) + 1
    };

    const res = await fetch(`${BASE}/api/discipline-stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedStats)
    });
    assert(res.ok, `HTTP ${res.status}`);
    const saved = await res.json();
    assert(saved.success && saved.stats.distractionsResisted === initial.distractionsResisted + 1, 'Urges count did not increment');
  });

  // --- 5. ROUTINE TIMETABLE MODULE ---
  let testRoutineBlockId = `test-block-${Date.now()}`;
  await test('5.1 Routine: Fetch routine timetable', async () => {
    const res = await fetch(`${BASE}/api/routine`);
    assert(res.ok, `HTTP ${res.status}`);
    const list = await res.json();
    assert(Array.isArray(list) && list.length > 0, 'Routine list is empty or invalid');
  });

  await test('5.2 Routine: Add new routine block & save', async () => {
    const currentRes = await fetch(`${BASE}/api/routine`);
    const list = await currentRes.json();
    const newBlock = {
      id: testRoutineBlockId,
      time: '04:00 - 05:00 PM',
      title: 'E2E Routine Revision',
      category: 'Study',
      completed: false
    };
    const updatedRoutine = [...list, newBlock];

    const res = await fetch(`${BASE}/api/routine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routine: updatedRoutine })
    });
    assert(res.ok, `HTTP ${res.status}`);
    const data = await res.json();
    assert(data.success && data.routine.some(r => r.id === testRoutineBlockId), 'New block not found in routine response');
  });

  await test('5.3 Routine: Toggle block completion & cleanup', async () => {
    const currentRes = await fetch(`${BASE}/api/routine`);
    const list = await currentRes.json();
    const block = list.find(r => r.id === testRoutineBlockId);
    assert(block, 'Routine block not found');
    block.completed = true;

    const res = await fetch(`${BASE}/api/routine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routine: list })
    });
    assert(res.ok, `HTTP ${res.status}`);

    // Cleanup the test block
    const cleanedRoutine = list.filter(r => r.id !== testRoutineBlockId);
    await fetch(`${BASE}/api/routine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routine: cleanedRoutine })
    });
  });

  // --- 6. NOTES MODULE ---
  let testNoteId = null;
  await test('6.1 Notes: Create study note', async () => {
    const res = await fetch(`${BASE}/api/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'E2E Test Note', content: 'Mitochondria ATP synthesis breakdown' })
    });
    assert(res.ok, `HTTP ${res.status}`);
    const note = await res.json();
    assert(note.id && note.title === 'E2E Test Note', 'Created note payload invalid');
    testNoteId = note.id;

    const listRes = await fetch(`${BASE}/api/notes`);
    const notes = await listRes.json();
    assert(notes.some(n => n.id === testNoteId), 'Created note not found in notes list');
  });

  await test('6.2 Notes: Delete study note', async () => {
    assert(testNoteId, 'No noteId to delete');
    const res = await fetch(`${BASE}/api/notes/${testNoteId}`, { method: 'DELETE' });
    assert(res.ok, `HTTP ${res.status}`);
    const listRes = await fetch(`${BASE}/api/notes`);
    const notes = await listRes.json();
    assert(!notes.some(n => n.id === testNoteId), 'Deleted note still exists in notes list');
  });

  // --- 7. CHAT STREAMING & NEURAL ACTIONS ---
  await test('7.1 Chat Stream: Math calculation route', async () => {
    const res = await fetch(`${BASE}/api/chat-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'calculate 25 * 4 + 10' })
    });
    assert(res.ok, `HTTP ${res.status}`);
    const text = await res.text();
    assert(text.includes('110'), `Expected calculation result 110, got ${text}`);
  });

  await test('7.2 Chat Stream: Task addition via natural language', async () => {
    const res = await fetch(`${BASE}/api/chat-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'bhai checklist me add karo Electrostatics Formula Revision' })
    });
    assert(res.ok, `HTTP ${res.status}`);
    const text = await res.text();
    assert(text.length > 10, 'Chat stream response was too short');
    
    // Check if task was actually saved to tasks.json by the neural action hook
    const tasksRes = await fetch(`${BASE}/api/tasks`);
    const tasks = await tasksRes.json();
    const found = tasks.find(t => t.text.toLowerCase().includes('electrostatics'));
    assert(found, 'Task was not added to checklist by AI stream');
    
    // Cleanup
    if (found) {
      await fetch(`${BASE}/api/tasks/${found.id}`, { method: 'DELETE' });
    }
  });

  console.log('\n=================================================');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('=================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
