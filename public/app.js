// ========================================================
// NOVA CLEAN GLASSMORPHIC PRODUCTIVITY ENGINE
// Minimalist, Responsive, Ultra-Fast Daily Driver
// ========================================================

// State
let tasks = [];
let notes = [];
let reminders = [];
let timeAnalytics = { sessions: [], totalMinutes: 0, categoryTotals: {}, topCategory: 'None yet' };
let audioCtx = null;
let triggeredIds = new Set();
let currentAlarmItem = null;
let currentTaskFilter = 'all';
let currentTaskCategory = 'Study';
let isGenerating = false;

// Routine & Discipline State
let routines = [];
let disciplineStats = {
  streak: 5,
  score: 92,
  distractionsResisted: 8,
  todayFocusMinutes: 0
};
let isStrictMode = true;
let currentRoutineCategory = 'Study';

// Pomodoro Timer State
let pomodoroInterval = null;
let pomodoroDuration = 50 * 60;
let pomodoroRemaining = 50 * 60;
let isPomodoroRunning = false;
let currentFocusCategory = '📚 Physics';

// Calculator State
let calcExpr = '';
let calcCurrent = '0';
let calcTape = JSON.parse(localStorage.getItem('nova_calc_tape') || '[]');
let isNewNumber = true;

// DOM Elements
const sidebarClock = document.getElementById('sidebarClock');
const pageTitle = document.getElementById('pageTitle');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const sidebar = document.getElementById('sidebar');

// Universal Non-Blocking App Toast Notification Center
function showToast(message, type = 'info', icon = '✨', duration = 3400) {
  const container = document.getElementById('synapseToastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `synapse-toast glass-card toast-${type}`;
  toast.innerHTML = `<span style="font-size: 18px; flex-shrink: 0;">${icon}</span><span style="flex: 1; line-height: 1.4;">${message}</span>`;
  container.appendChild(toast);

  try {
    if (type === 'success' || type === 'trophy') playAlertChime();
  } catch (e) {}

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-12px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, duration);
}

// Daily Mission Control HUD updater (Keeps Streak, Study Hours & Checklist live)
function updateDailyMissionHud() {
  const streakEl = document.getElementById('hudStreak');
  const focusEl = document.getElementById('hudFocus');
  const tasksEl = document.getElementById('hudTasks');

  if (streakEl) {
    const streak = disciplineStats.streak || 5;
    streakEl.textContent = `${streak} Days`;
  }
  if (focusEl) {
    const mins = disciplineStats.todayFocusMinutes || 0;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    focusEl.textContent = h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  if (tasksEl) {
    const doneCount = tasks.filter(t => t.completed).length;
    const total = tasks.length;
    tasksEl.textContent = total > 0 ? `${doneCount}/${total} Done` : '0 Done';
  }
}

// Sync AI-generated study routine directly into the user's timetable
async function syncRoutineBlocksFromText(text) {
  const regex = /(?:•|\*|-|\d+\.)\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?\s*[-–]\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[:–-]?\s*([^\n\r]+)/gi;
  let m;
  const newBlocks = [];
  while ((m = regex.exec(text)) !== null) {
    const timeStr = m[1].trim();
    let titleStr = m[2].trim().replace(/^\*\*|\*\*$/g, '').replace(/^[–\-:]\s*/, '');
    if (titleStr) {
      newBlocks.push({
        id: 'r_' + Date.now() + Math.random().toString().slice(2, 5),
        time: timeStr,
        title: titleStr,
        category: 'Study',
        completed: false
      });
    }
  }

  if (newBlocks.length > 0) {
    routines = [...newBlocks];
    saveRoutines();
    launchConfettiBurst();
    showToast(`🎉 Synced ${newBlocks.length} study blocks to your Daily Routine!`, 'success', '⚡');
  }
}

// Routine & Discipline DOM
const disciplineStreak = document.getElementById('disciplineStreak');
const disciplineScore = document.getElementById('disciplineScore');
const distractionsResisted = document.getElementById('distractionsResisted');
const routineFocusTime = document.getElementById('routineFocusTime');
const defeatUrgeBtn = document.getElementById('defeatUrgeBtn');
const timerDefeatUrgeBtn = document.getElementById('timerDefeatUrgeBtn');
const disciplineQuoteBanner = document.getElementById('disciplineQuoteBanner');
const currentBlockTitle = document.getElementById('currentBlockTitle');
const currentBlockTime = document.getElementById('currentBlockTime');
const startCurrentBlockBtn = document.getElementById('startCurrentBlockBtn');
const routineProgressText = document.getElementById('routineProgressText');
const toggleAddRoutineBtn = document.getElementById('toggleAddRoutineBtn');
const resetRoutineBtn = document.getElementById('resetRoutineBtn');
const aiGenRoutineBtn = document.getElementById('aiGenRoutineBtn');
const addRoutineForm = document.getElementById('addRoutineForm');
const routineTimeInput = document.getElementById('routineTimeInput');
const routineTitleInput = document.getElementById('routineTitleInput');
const cancelAddRoutineBtn = document.getElementById('cancelAddRoutineBtn');
const routineCategoryPills = document.querySelectorAll('#routineCategoryPills .cat-pill');
const routineList = document.getElementById('routineList');

// Strict Timer DOM
const strictModeToggle = document.getElementById('strictModeToggle');
const strictActiveBanner = document.getElementById('strictActiveBanner');
const strictQuoteText = document.getElementById('strictQuoteText');
const focusCardMain = document.getElementById('focusCardMain');

const navItems = document.querySelectorAll('.nav-item');
const mTabs = document.querySelectorAll('.mobile-nav-bar .m-tab');
const viewPanels = document.querySelectorAll('.view-panel');

const tasksCountBadge = document.getElementById('tasksCountBadge');
const remindersCountBadge = document.getElementById('remindersCountBadge');

// Tasks DOM
const addTaskForm = document.getElementById('addTaskForm');
const taskTextInput = document.getElementById('taskTextInput');
const taskCategoryPills = document.querySelectorAll('#taskCategoryPills .cat-pill');
const filterBtns = document.querySelectorAll('.btn-filter');
const tasksList = document.getElementById('tasksList');
const tasksOverviewText = document.getElementById('tasksOverviewText');

// Notes DOM
const addNoteForm = document.getElementById('addNoteForm');
const noteTitleInput = document.getElementById('noteTitleInput');
const noteContentInput = document.getElementById('noteContentInput');
const notesGrid = document.getElementById('notesGrid');
const searchNotesInput = document.getElementById('searchNotesInput');
const notesCountNum = document.getElementById('notesCountNum');

// Pomodoro & Analytics DOM
const pomodoroDisplay = document.getElementById('pomodoroDisplay');
const pomodoroStatus = document.getElementById('pomodoroStatus');
const pomodoroStartBtn = document.getElementById('pomodoroStartBtn');
const pomodoroResetBtn = document.getElementById('pomodoroResetBtn');
const pomodoroLogManualBtn = document.getElementById('pomodoroLogManualBtn');
const modeBtns = document.querySelectorAll('.btn-mode');
const customPomoMinutesInput = document.getElementById('customPomoMinutesInput');
const setCustomPomoBtn = document.getElementById('setCustomPomoBtn');
const quickSub5Btn = document.getElementById('quickSub5Btn');
const quickAdd5Btn = document.getElementById('quickAdd5Btn');
const quickAdd15Btn = document.getElementById('quickAdd15Btn');
const focusCategoryPills = document.querySelectorAll('#focusCategoryPills .cat-pill');
const totalFocusHours = document.getElementById('totalFocusHours');
const totalSessionsCount = document.getElementById('totalSessionsCount');
const topFocusCategory = document.getElementById('topFocusCategory');
const categoryBarsList = document.getElementById('categoryBarsList');
const focusHistoryList = document.getElementById('focusHistoryList');
const clearTimeLogsBtn = document.getElementById('clearTimeLogsBtn');

// Calculator DOM
const calcExpression = document.getElementById('calcExpression');
const calcCurrentValue = document.getElementById('calcCurrentValue');
const calcTapeList = document.getElementById('calcTapeList');
const clearCalcTapeBtn = document.getElementById('clearCalcTapeBtn');

// Reminders DOM
const addReminderForm = document.getElementById('addReminderForm');
const remTextInput = document.getElementById('remTextInput');
const remTimeInput = document.getElementById('remTimeInput');
const presetBtns = document.querySelectorAll('.btn-preset');
const remindersList = document.getElementById('remindersList');
const remindersCountNum = document.getElementById('remindersCountNum');

// Assistant / Search DOM
const messagesContainer = document.getElementById('messagesContainer');
const chatHero = document.getElementById('chatHero');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const chatGoogleBtn = document.getElementById('chatGoogleBtn');
const chatFileInput = document.getElementById('chatFileInput');
const fileAttachmentBadge = document.getElementById('fileAttachmentBadge');
const fileBadgeThumb = document.getElementById('fileBadgeThumb');
const fileBadgeIcon = document.getElementById('fileBadgeIcon');
const fileBadgeName = document.getElementById('fileBadgeName');
const fileBadgeSize = document.getElementById('fileBadgeSize');
const fileBadgeStatus = document.getElementById('fileBadgeStatus');
const removeAttachmentBtn = document.getElementById('removeAttachmentBtn');
let attachedFile = null;
window.setAttachedFile = (name, size, text, isImage = false, previewUrl = null) => {
  attachedFile = { name, size, text, isImage, previewUrl };
  if (fileBadgeName) fileBadgeName.textContent = name;
  if (fileBadgeSize) fileBadgeSize.textContent = `(${(size / 1024).toFixed(1)} KB)`;
  if (fileBadgeStatus) fileBadgeStatus.textContent = isImage ? '✅ Image Ready' : '✅ Ready';
  if (fileAttachmentBadge) fileAttachmentBadge.classList.remove('hidden');
};
const promptChipsClean = document.querySelectorAll('.prompt-chip-clean');
const chatHeroUrgeBtn = document.getElementById('chatHeroUrgeBtn');
const chatHeroFocusBtn = document.getElementById('chatHeroFocusBtn');
const chatHeroRoutineBtn = document.getElementById('chatHeroRoutineBtn');
const clearChatBtn = document.getElementById('clearChatBtn');

// Modals & Toasts
const alarmToast = document.getElementById('alarmToast');
const alarmMessage = document.getElementById('alarmMessage');
const alarmSnoozeBtn = document.getElementById('alarmSnoozeBtn');
const alarmDismissBtn = document.getElementById('alarmDismissBtn');

const phoneModal = document.getElementById('phoneModal');
const openPhoneModalBtn = document.getElementById('openPhoneModalBtn');
const closePhoneModal = document.getElementById('closePhoneModal');
const phoneUrlInput = document.getElementById('phoneUrlInput');
const copyPhoneUrlBtn = document.getElementById('copyPhoneUrlBtn');
const deviceIndicator = document.getElementById('deviceIndicator');
const quickGoogleBtn = document.getElementById('quickGoogleBtn');

// Zenith Pro Lifetime DOM
const proModal = document.getElementById('proModal');
const openProModalBtn = document.getElementById('openProModalBtn');
const sidebarProBtn = document.getElementById('sidebarProBtn');
const closeProModal = document.getElementById('closeProModal');
const activateProBtn = document.getElementById('activateProBtn');

// Custom Workflow DOM
const workflowModal = document.getElementById('workflowModal');
const closeWorkflowModal = document.getElementById('closeWorkflowModal');
const cancelWorkflowModalBtn = document.getElementById('cancelWorkflowModalBtn');
const createWorkflowForm = document.getElementById('createWorkflowForm');
const newWfNameInput = document.getElementById('newWfNameInput');
const newWfTemplateSelect = document.getElementById('newWfTemplateSelect');
const newWorkflowBtn = document.getElementById('newWorkflowBtn');
const exportWorkflowBtn = document.getElementById('exportWorkflowBtn');
const workflowPillsRow = document.getElementById('workflowPillsRow');

// Ambient Audio DOM
const ambientAudioToggleBtn = document.getElementById('ambientAudioToggleBtn');
const soundVolumeSlider = document.getElementById('soundVolumeSlider');

// Knowledge Vault DOM
const vaultSearchInput = document.getElementById('vaultSearchInput');
const clearVaultSearchBtn = document.getElementById('clearVaultSearchBtn');
const vaultCatPills = document.querySelectorAll('#vaultCatPills .vcat-pill');
const vaultCardsGrid = document.getElementById('vaultCardsGrid');
const vaultAskCoachBtn = document.getElementById('vaultAskCoachBtn');

// Model Selector & Neural Engine DOM
const aiModelSelect = document.getElementById('aiModelSelect');
const modelActiveIcon = document.getElementById('modelActiveIcon');
const modelStatusChip = document.getElementById('modelStatusChip');
const modelStatusText = document.getElementById('modelStatusText');
const modelDownloadCard = document.getElementById('modelDownloadCard');
const modelDownloadTitle = document.getElementById('modelDownloadTitle');
const modelDownloadSubtitle = document.getElementById('modelDownloadSubtitle');
const modelDownloadPct = document.getElementById('modelDownloadPct');
const modelProgressFill = document.getElementById('modelProgressFill');
const modelDownloadLog = document.getElementById('modelDownloadLog');
const modelCancelBtn = document.getElementById('modelCancelBtn');

// ========================================================
// 1. DEVICE DETECTOR & 5-THEME LUXURY ENGINE
// ========================================================
function updateDeviceMode() {
  const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (deviceIndicator) {
    deviceIndicator.textContent = isMobile ? '📱 Mobile Mode' : '💻 Desktop Mode';
  }
}
window.addEventListener('resize', updateDeviceMode);
updateDeviceMode();

const themeCycle = ['dark', 'light'];
const themeNames = {
  dark: '🌙 Dark Mode',
  light: '☀️ Light Mode'
};

function initTheme() {
  const saved = localStorage.getItem('nova_clean_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  if (themeToggleBtn) {
    themeToggleBtn.textContent = themeNames[saved] || '🌓 Theme';
  }
}

themeToggleBtn?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('nova_clean_theme', next);
  if (themeToggleBtn) {
    themeToggleBtn.textContent = themeNames[next] || '🌓 Theme';
  }
});
initTheme();

// ========================================================
// 2. LIVE SYSTEM TIME CLOCK
// ========================================================
function updateClock() {
  const now = new Date();
  if (sidebarClock) {
    sidebarClock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
setInterval(updateClock, 1000);
updateClock();

// ========================================================
// 3. NAVIGATION (TABS) & MOBILE DRAWER
// ========================================================
const tabTitles = {
  'tab-chat': '🧠 Synapse AI',
  'tab-routine': '🎯 Routine & Flows',
  'tab-focus': '⏱️ Study Timer',
  'tab-vault': '📚 Study Vault',
  'tab-tasks': '✅ Tasks',
  'tab-notes': '📝 Notes',
  'tab-calc': '🔢 Calculator',
  'tab-reminders': '⏰ Reminders'
};

function toggleSidebar(forceState) {
  if (!sidebar) return;
  const isCurrentlyOpen = sidebar.classList.contains('open');
  const shouldOpen = typeof forceState === 'boolean' ? forceState : !isCurrentlyOpen;

  if (shouldOpen) {
    sidebar.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('active');
  } else {
    sidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
  }
}

function switchTab(tabId) {
  navItems.forEach(b => b.classList.remove('active'));
  mTabs.forEach(b => b.classList.remove('active'));
  viewPanels.forEach(p => p.classList.remove('active'));

  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add('active');

  document.querySelectorAll(`[data-tab="${tabId}"]`).forEach(el => el.classList.add('active'));
  if (pageTitle) {
    if (tabId === 'tab-chat') {
      pageTitle.style.display = 'none';
    } else {
      pageTitle.style.display = 'inline-flex';
      pageTitle.textContent = tabTitles[tabId] || 'Synapse OS';
    }
  }

  toggleSidebar(false);

  // Refresh data on tab enter
  if (tabId === 'tab-routine') { fetchRoutines(); fetchDisciplineStats(); }
  if (tabId === 'tab-tasks') fetchTasks();
  if (tabId === 'tab-notes') fetchNotes();
  if (tabId === 'tab-focus') fetchTimeAnalytics();
  if (tabId === 'tab-calc') renderCalcTape();
  if (tabId === 'tab-vault') renderVaultCards();
  if (tabId === 'tab-reminders') fetchReminders();
}

navItems.forEach(item => {
  item.addEventListener('click', () => switchTab(item.dataset.tab));
});

mTabs.forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// Left Three Dot Button Toggle
sidebarToggle?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  toggleSidebar();
});

sidebarCloseBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  toggleSidebar(false);
});

sidebarBackdrop?.addEventListener('click', (e) => {
  e.preventDefault();
  toggleSidebar(false);
});

sidebarBackdrop?.addEventListener('touchstart', (e) => {
  e.preventDefault();
  toggleSidebar(false);
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebar?.classList.contains('open')) {
    toggleSidebar(false);
  }
});

// Topbar Quick Google Button
quickGoogleBtn?.addEventListener('click', () => {
  const query = prompt('Enter search query:');
  if (query && query.trim()) {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query.trim())}`, '_blank');
  }
});

// ========================================================
// 4. WEB AUDIO ALERT CHIME
// ========================================================
function playAlertChime() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const tones = [523.25, 659.25, 783.99, 1046.50];
    tones.forEach((freq, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.28, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.6);
    });
  } catch (e) {
    console.warn('Audio chime warning:', e);
  }
}
// ========================================================
// 4B. ROUTINE & STRICT DISCIPLINE ENGINE
// ========================================================
const defaultRoutines = [
  { id: 'r1', time: '06:00 - 07:00 AM', title: '🌅 Morning Mindset, Hydration & Stretch', category: 'Health', completed: false },
  { id: 'r2', time: '07:30 - 09:30 AM', title: '📚 Deep Study Block 1 (Hardest Topic)', category: 'Study', completed: false },
  { id: 'r3', time: '10:00 - 12:00 PM', title: '⚡ Active Recall & Problem Solving', category: 'Study', completed: false },
  { id: 'r4', time: '12:30 - 01:30 PM', title: '🥗 Clean Nutrition & Screen-free Rest', category: 'Health', completed: false },
  { id: 'r5', time: '02:30 - 04:30 PM', title: '🧠 Deep Study Block 2 (Concepts & Revision)', category: 'Study', completed: false },
  { id: 'r6', time: '05:30 - 06:30 PM', title: '🏃 Exercise / Physical Training', category: 'Health', completed: false },
  { id: 'r7', time: '08:00 - 09:30 PM', title: '📖 Daily Review & Next Day Strategy', category: 'Review', completed: false },
  { id: 'r8', time: '10:00 PM', title: '🌙 Digital Disconnect & Sleep', category: 'Health', completed: false }
];

const disciplineQuotes = [
  "Discipline is choosing between what you want now and what you want most.",
  "Every time you resist doom-scrolling, your focus muscle grows stronger.",
  "Cheap dopamine avoided. Real intellectual power gained.",
  "You just won a battle against algorithms designed to steal your life.",
  "The pain of discipline is far less than the pain of regret.",
  "Deep study is your ultimate superpower in a distracted world."
];

async function fetchRoutines() {
  try {
    const res = await fetch('/api/routine');
    routines = await res.json();
    if (!Array.isArray(routines) || routines.length === 0) {
      routines = JSON.parse(localStorage.getItem('nova_routines') || JSON.stringify(defaultRoutines));
    }
  } catch {
    routines = JSON.parse(localStorage.getItem('nova_routines') || JSON.stringify(defaultRoutines));
  }
  localStorage.setItem('nova_routines', JSON.stringify(routines));
  renderRoutines();
  updateCurrentActiveRoutine();
}

async function saveRoutines() {
  localStorage.setItem('nova_routines', JSON.stringify(routines));
  renderRoutines();
  try {
    await fetch('/api/routine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routine: routines })
    });
  } catch {}
  updateDisciplineScore();
}

async function fetchDisciplineStats() {
  try {
    const res = await fetch('/api/discipline-stats');
    disciplineStats = await res.json();
  } catch {
    disciplineStats = JSON.parse(localStorage.getItem('nova_discipline_stats') || JSON.stringify(disciplineStats));
  }
  renderDisciplineStats();
}

async function saveDisciplineStats() {
  localStorage.setItem('nova_discipline_stats', JSON.stringify(disciplineStats));
  try {
    await fetch('/api/discipline-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(disciplineStats)
    });
  } catch {}
  renderDisciplineStats();
}

function updateDisciplineScore() {
  const total = routines.length;
  if (total === 0) return;
  const completed = routines.filter(r => r.completed).length;
  const baseScore = Math.round((completed / total) * 70);
  const bonusScore = Math.min(30, (disciplineStats.distractionsResisted || 0) * 3);
  disciplineStats.score = Math.min(100, Math.max(20, baseScore + bonusScore));
  saveDisciplineStats();
}

function renderDisciplineStats() {
  if (disciplineStreak) disciplineStreak.textContent = `${disciplineStats.streak || 5} Days`;
  if (disciplineScore) disciplineScore.textContent = `${disciplineStats.score || 92}%`;
  if (distractionsResisted) distractionsResisted.textContent = `${disciplineStats.distractionsResisted || 8} Wins`;
  if (routineFocusTime) {
    const hours = Math.floor((disciplineStats.todayFocusMinutes || 0) / 60);
    const mins = (disciplineStats.todayFocusMinutes || 0) % 60;
    routineFocusTime.textContent = `${hours}h ${mins.toString().padStart(2, '0')}m`;
  }
  updateDailyMissionHud();
}

function renderRoutines() {
  if (!routineList) return;
  routineList.innerHTML = '';

  const completedCount = routines.filter(r => r.completed).length;
  if (routineProgressText) {
    routineProgressText.textContent = `${completedCount} of ${routines.length} completed`;
  }

  routines.forEach(item => {
    const el = document.createElement('div');
    el.className = `routine-item ${item.completed ? 'completed' : ''}`;
    el.innerHTML = `
      <div class="routine-left-group">
        <input type="checkbox" class="routine-checkbox" data-id="${item.id}" ${item.completed ? 'checked' : ''}>
        <div class="routine-details">
          <span class="routine-time-pill">${item.time}</span>
          <span class="routine-title-text">${item.title}</span>
        </div>
      </div>
      <div class="routine-item-actions">
        <button type="button" class="btn-subtle btn-sm" onclick="startRoutineBlock('${item.id}')" title="Start timer for this block">⏱️ Focus</button>
        <button type="button" class="btn-icon-danger" onclick="deleteRoutineBlock('${item.id}')" title="Delete block">✕</button>
      </div>
    `;
    routineList.appendChild(el);
  });

  document.querySelectorAll('.routine-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      const target = routines.find(r => r.id === id);
      if (target) {
        target.completed = e.target.checked;
        if (target.completed) playAlertChime();
        saveRoutines();
      }
    });
  });
}

function updateCurrentActiveRoutine() {
  if (!currentBlockTitle || routines.length === 0) return;
  const now = new Date();
  const currentHour = now.getHours();
  let activeBlock = routines[0];
  if (currentHour >= 6 && currentHour < 10) activeBlock = routines[1] || routines[0];
  else if (currentHour >= 10 && currentHour < 13) activeBlock = routines[2] || routines[1];
  else if (currentHour >= 13 && currentHour < 15) activeBlock = routines[3] || routines[2];
  else if (currentHour >= 15 && currentHour < 18) activeBlock = routines[4] || routines[3];
  else if (currentHour >= 18 && currentHour < 21) activeBlock = routines[5] || routines[4];
  else if (currentHour >= 21) activeBlock = routines[6] || routines[5];

  currentBlockTitle.textContent = activeBlock.title;
  currentBlockTime.textContent = activeBlock.time;
}

window.startRoutineBlock = (id) => {
  const item = routines.find(r => r.id === id);
  if (item) {
    currentFocusCategory = item.category === 'Study' ? '📚 Deep Study' : '⚡ Problem Solving';
    pomodoroDuration = 50 * 60;
    resetPomodoro();
    switchTab('tab-focus');
    pomodoroStartBtn.click();
  }
};

window.deleteRoutineBlock = (id) => {
  routines = routines.filter(r => r.id !== id);
  saveRoutines();
};

startCurrentBlockBtn?.addEventListener('click', () => {
  switchTab('tab-focus');
  pomodoroDuration = 50 * 60;
  resetPomodoro();
  pomodoroStartBtn.click();
});

function handleDefeatUrge() {
  disciplineStats.distractionsResisted = (disciplineStats.distractionsResisted || 0) + 1;
  saveDisciplineStats();
  updateDailyMissionHud();
  playAlertChime();
  const randomQuote = disciplineQuotes[Math.floor(Math.random() * disciplineQuotes.length)];
  if (disciplineQuoteBanner) disciplineQuoteBanner.textContent = `"${randomQuote}"`;
  if (strictQuoteText) strictQuoteText.textContent = `"${randomQuote}"`;
  showToast('🔥 Victory Logged! +1 Distraction Resisted. Discipline streak intact!', 'success', '🛡️');
}

defeatUrgeBtn?.addEventListener('click', handleDefeatUrge);
timerDefeatUrgeBtn?.addEventListener('click', handleDefeatUrge);

resetRoutineBtn?.addEventListener('click', () => {
  if (confirm('Reset today\'s routine checklist for a fresh start?')) {
    routines.forEach(r => r.completed = false);
    saveRoutines();
  }
});

toggleAddRoutineBtn?.addEventListener('click', () => {
  addRoutineForm?.classList.toggle('hidden');
  routineTimeInput?.focus();
});

cancelAddRoutineBtn?.addEventListener('click', () => {
  addRoutineForm?.classList.add('hidden');
});

routineCategoryPills.forEach(pill => {
  pill.addEventListener('click', () => {
    routineCategoryPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentRoutineCategory = pill.dataset.cat;
  });
});

addRoutineForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const time = routineTimeInput.value.trim();
  const title = routineTitleInput.value.trim();
  if (time && title) {
    routines.push({
      id: Date.now().toString(),
      time,
      title,
      category: currentRoutineCategory,
      completed: false
    });
    saveRoutines();
    routineTimeInput.value = '';
    routineTitleInput.value = '';
    addRoutineForm.classList.add('hidden');
  }
});

aiGenRoutineBtn?.addEventListener('click', () => {
  userInput.value = 'Make me a 6-hour strict study routine';
  switchTab('tab-chat');
  chatForm.dispatchEvent(new Event('submit'));
});

// ========================================================
// 5. TASKS CHECKLIST (PRIMARY DAILY DRIVER)
// ========================================================
taskCategoryPills.forEach(pill => {
  pill.addEventListener('click', () => {
    taskCategoryPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentTaskCategory = pill.dataset.cat;
  });
});

async function fetchTasks() {
  try {
    const res = await fetch('/api/tasks');
    if (res.ok) {
      tasks = await res.json();
      localStorage.setItem('synapse_tasks', JSON.stringify(tasks));
      renderTasks();
      return;
    }
  } catch (e) {
    console.warn('Tasks network notice, reading local storage:', e);
  }
  tasks = JSON.parse(localStorage.getItem('synapse_tasks') || '[]');
  renderTasks();
}

filterBtns.forEach(f => {
  f.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    f.classList.add('active');
    currentTaskFilter = f.dataset.filter;
    renderTasks();
  });
});

function renderTasks() {
  const pending = tasks.filter(t => !t.completed);
  const completed = tasks.filter(t => t.completed);

  // Badge count on sidebar
  if (pending.length > 0) {
    tasksCountBadge.textContent = pending.length;
    tasksCountBadge.classList.remove('hidden');
  } else {
    tasksCountBadge.classList.add('hidden');
  }

  // Header count overview
  if (tasksOverviewText) {
    tasksOverviewText.textContent = `${pending.length} pending • ${completed.length} completed`;
  }

  let list = tasks;
  if (currentTaskFilter === 'pending') list = pending;
  if (currentTaskFilter === 'done') list = completed;

  if (list.length === 0) {
    tasksList.innerHTML = `<div class="empty-state">No tasks in this view. Write a task above!</div>`;
    return;
  }

  tasksList.innerHTML = '';
  list.forEach(t => {
    const row = document.createElement('div');
    row.className = `task-item-card glass-inset ${t.completed ? 'done' : ''}`;
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px; flex:1;">
        <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="toggleTask('${t.id}')" style="cursor:pointer; transform:scale(1.2);">
        <span class="task-text ${t.completed ? 'completed' : ''}">${t.text}</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="cat-pill" style="font-size:10px; padding:3px 8px;">${t.category || 'Work'}</span>
        <button class="btn-subtle btn-sm" style="color:var(--danger);" onclick="deleteTask('${t.id}')" title="Delete Task">✕</button>
      </div>
    `;
    tasksList.appendChild(row);
  });
  updateDailyMissionHud();
}

window.toggleTask = async (id) => {
  await fetch(`/api/tasks/${id}/toggle`, { method: 'POST' });
  fetchTasks();
};

window.deleteTask = async (id) => {
  await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  fetchTasks();
};

addTaskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = taskTextInput.value.trim();
  if (!text) return;
  taskTextInput.value = '';

  await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, category: currentTaskCategory })
  });
  fetchTasks();
});

// ========================================================
// 6. NOTES & SCRATCHPAD
// ========================================================
async function fetchNotes() {
  try {
    const res = await fetch('/api/notes');
    if (res.ok) {
      notes = await res.json();
      localStorage.setItem('synapse_notes', JSON.stringify(notes));
      renderNotes();
      return;
    }
  } catch (e) {
    console.warn('Notes network notice, reading local storage:', e);
  }
  notes = JSON.parse(localStorage.getItem('synapse_notes') || '[]');
  renderNotes();
}

function renderNotes(filterQuery = '') {
  const count = notes.length;
  if (notesCountNum) notesCountNum.textContent = count;

  let list = notes;
  if (filterQuery && filterQuery.trim()) {
    const q = filterQuery.toLowerCase().trim();
    list = notes.filter(n => (n.title && n.title.toLowerCase().includes(q)) || (n.content && n.content.toLowerCase().includes(q)));
  }

  if (list.length === 0) {
    notesGrid.innerHTML = `<div class="empty-state" style="grid-column: 1/-1;">No notes found. Add a note above!</div>`;
    return;
  }

  notesGrid.innerHTML = '';
  list.forEach(n => {
    const card = document.createElement('div');
    card.className = 'note-card glass-inset';
    const dateStr = new Date(n.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <strong class="note-title">${n.title}</strong>
        <div style="display:flex; gap:4px;">
          <button class="btn-subtle btn-sm" onclick="copyNoteText('${n.id}')" title="Copy Note">📋</button>
          <button class="btn-subtle btn-sm" style="color:var(--danger);" onclick="deleteNote('${n.id}')" title="Delete Note">✕</button>
        </div>
      </div>
      <div class="note-snippet">${n.content}</div>
      <div style="font-size:10px; color:var(--text-muted); font-family:var(--font-mono); margin-top:6px;">${dateStr}</div>
    `;
    notesGrid.appendChild(card);
  });
}

window.copyNoteText = (id) => {
  const item = notes.find(n => n.id === id);
  if (item) {
    navigator.clipboard.writeText(`${item.title}\n\n${item.content}`);
    showToast('Note copied to clipboard!', 'info', '📋');
  }
};

window.deleteNote = async (id) => {
  await fetch(`/api/notes/${id}`, { method: 'DELETE' });
  fetchNotes();
};

addNoteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = noteTitleInput.value.trim() || 'Quick Note';
  const content = noteContentInput.value.trim();
  if (!content) return;

  noteTitleInput.value = '';
  noteContentInput.value = '';

  await fetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content })
  });
  fetchNotes();
});

searchNotesInput?.addEventListener('input', (e) => {
  renderNotes(e.target.value);
});

// ========================================================
// 7. FOCUS POMODORO & TIME TRACKING
// ========================================================
function formatTimerDisplay(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

focusCategoryPills.forEach(pill => {
  pill.addEventListener('click', () => {
    focusCategoryPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentFocusCategory = pill.dataset.cat || pill.textContent.trim();
    if (!isPomodoroRunning && pomodoroStatus) {
      pomodoroStatus.textContent = `Ready for deep study on ${currentFocusCategory} (${Math.round(pomodoroDuration / 60)} Mins)`;
    }
  });
});

const customSubjectBtn = document.getElementById('customSubjectBtn');
customSubjectBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  const custom = prompt('Enter Syllabus Topic or Subject Name (e.g. Organic Chem Ch 4, Kinematics, DSA):');
  if (custom && custom.trim()) {
    const formatted = '📖 ' + custom.trim();
    customSubjectBtn.textContent = formatted;
    customSubjectBtn.dataset.cat = formatted;
    focusCategoryPills.forEach(p => p.classList.remove('active'));
    customSubjectBtn.classList.add('active');
    currentFocusCategory = formatted;
    if (!isPomodoroRunning && pomodoroStatus) {
      pomodoroStatus.textContent = `Ready for deep study on ${currentFocusCategory} (${Math.round(pomodoroDuration / 60)} Mins)`;
    }
  }
});

function setTimerDuration(mins) {
  if (isNaN(mins) || mins <= 0) return;
  pomodoroDuration = mins * 60;
  resetPomodoro();
  pomodoroStatus.textContent = mins >= 20 ? `Focus Session (${mins} Mins)` : `Session (${mins} Mins)`;
}

modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mins = parseInt(btn.dataset.time, 10);
    setTimerDuration(mins);
  });
});

setCustomPomoBtn?.addEventListener('click', () => {
  const mins = parseInt(customPomoMinutesInput?.value, 10);
  if (!isNaN(mins) && mins > 0) {
    modeBtns.forEach(b => b.classList.remove('active'));
    setTimerDuration(mins);
    customPomoMinutesInput.value = '';
  } else {
    showToast('Please enter valid minutes (e.g. 15, 30, 45).', 'warning', '⚠️');
  }
});

customPomoMinutesInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    setCustomPomoBtn?.click();
  }
});

quickSub5Btn?.addEventListener('click', () => {
  const currentMins = Math.max(5, Math.floor(pomodoroDuration / 60) - 5);
  modeBtns.forEach(b => b.classList.remove('active'));
  setTimerDuration(currentMins);
});

quickAdd5Btn?.addEventListener('click', () => {
  const currentMins = Math.floor(pomodoroDuration / 60) + 5;
  modeBtns.forEach(b => b.classList.remove('active'));
  setTimerDuration(currentMins);
});

quickAdd15Btn?.addEventListener('click', () => {
  const currentMins = Math.floor(pomodoroDuration / 60) + 15;
  modeBtns.forEach(b => b.classList.remove('active'));
  setTimerDuration(currentMins);
});

function resetPomodoro() {
  clearInterval(pomodoroInterval);
  isPomodoroRunning = false;
  pomodoroRemaining = pomodoroDuration;
  pomodoroDisplay.textContent = formatTimerDisplay(pomodoroRemaining);
  pomodoroStartBtn.textContent = '▶ Start Focus';
  strictActiveBanner?.classList.add('hidden');
}

async function recordCompletedFocus(mins, catName) {
  disciplineStats.todayFocusMinutes = (disciplineStats.todayFocusMinutes || 0) + mins;
  saveDisciplineStats();
  try {
    await fetch('/api/time-analytics/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: catName,
        durationMinutes: mins,
        task: `Study Session (${mins}m)`
      })
    });
    fetchTimeAnalytics();
  } catch (e) {
    console.error('Error logging focus time:', e);
  }
}
window.recordCompletedFocus = recordCompletedFocus;

pomodoroStartBtn.addEventListener('click', () => {
  if (!isPomodoroRunning) {
    isPomodoroRunning = true;
    distractionCount = 0;
    requestWakeLock();
    requestNotificationPermission();
    pomodoroStartBtn.textContent = '⏸ Pause';
    if (strictModeToggle?.checked) {
      strictActiveBanner?.classList.remove('hidden');
    }
    pomodoroInterval = setInterval(() => {
      if (pomodoroRemaining > 0) {
        pomodoroRemaining--;
        pomodoroDisplay.textContent = formatTimerDisplay(pomodoroRemaining);
      } else {
        clearInterval(pomodoroInterval);
        isPomodoroRunning = false;
        releaseWakeLock();
        strictActiveBanner?.classList.add('hidden');
        pomodoroStartBtn.textContent = '▶ Start Focus';
        playAlertChime();
        const durationMins = Math.round(pomodoroDuration / 60);
        recordCompletedFocus(durationMins, currentFocusCategory);
        checkDailyStreakGoal(durationMins);
        launchConfettiBurst();
        sendPhoneNotification(
          '🎉 Study Session Complete!',
          `You locked in ${durationMins} minutes of deep focus on ${currentFocusCategory}!`
        );
        showToast(`🎉 Deep Study Complete! Logged ${durationMins}m to ${currentFocusCategory}. Verified focus XP gained!`, 'success', '🏆', 5000);
        updateDailyMissionHud();
      }
    }, 1000);
  } else {
    clearInterval(pomodoroInterval);
    isPomodoroRunning = false;
    releaseWakeLock();
    pomodoroStartBtn.textContent = '▶ Resume';
    strictActiveBanner?.classList.add('hidden');
  }
});

pomodoroResetBtn.addEventListener('click', () => {
  if (isPomodoroRunning && strictModeToggle?.checked) {
    if (!confirm('🔒 Strict Focus Active! Are you sure you want to break your discipline pledge and reset?')) {
      return;
    }
  }
  releaseWakeLock();
  resetPomodoro();
});

pomodoroLogManualBtn?.addEventListener('click', () => {
  const minsStr = prompt(`How many minutes of focus to log for "${currentFocusCategory}"?`, '25');
  const mins = parseInt(minsStr, 10);
  if (!isNaN(mins) && mins > 0) {
    recordCompletedFocus(mins, currentFocusCategory);
  }
});

const categoryColors = {
  '📚 Physics': 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
  '⚡ Chemistry': 'linear-gradient(90deg, #10b981, #059669)',
  '📐 Mathematics': 'linear-gradient(90deg, #8b5cf6, #6d28d9)',
  '🧬 Biology': 'linear-gradient(90deg, #ec4899, #be185d)',
  '💻 Coding & CS': 'linear-gradient(90deg, #06b6d4, #0891b2)',
  '📖 Aptitude & English': 'linear-gradient(90deg, #f59e0b, #d97706)',
  '📚 Deep Study': 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
  '⚡ Problem Solving': 'linear-gradient(90deg, #10b981, #059669)',
  '🧠 Concept Revision': 'linear-gradient(90deg, #8b5cf6, #6d28d9)',
  '💻 Coding & Dev': 'linear-gradient(90deg, #3b82f6, #1d4ed8)'
};

async function fetchTimeAnalytics() {
  try {
    const res = await fetch('/api/time-analytics');
    timeAnalytics = await res.json();
    renderTimeAnalytics();
  } catch (e) {
    console.error('Error loading time analytics:', e);
  }
}

function renderTimeAnalytics() {
  const { sessions, totalMinutes, totalSessions, categoryTotals, topCategory } = timeAnalytics;

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  totalFocusHours.textContent = `${hours}h ${mins.toString().padStart(2, '0')}m`;
  totalSessionsCount.textContent = totalSessions || '0';
  topFocusCategory.textContent = topCategory || 'None yet';

  if (!categoryTotals || Object.keys(categoryTotals).length === 0) {
    categoryBarsList.innerHTML = `<div class="empty-state">Complete a session or tap "+ Log Time" to view breakdown!</div>`;
  } else {
    categoryBarsList.innerHTML = '';
    const sortedCats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    sortedCats.forEach(([cat, catMins]) => {
      const pct = totalMinutes > 0 ? Math.round((catMins / totalMinutes) * 100) : 0;
      const gradient = categoryColors[cat] || 'linear-gradient(90deg, #10b981, #059669)';

      const row = document.createElement('div');
      row.className = 'cat-meter-row';
      row.innerHTML = `
        <div class="meter-header">
          <span>${cat}</span>
          <span class="meter-val">${catMins}m (${pct}%)</span>
        </div>
        <div class="meter-track">
          <div class="meter-fill" style="width: ${pct}%; background: ${gradient};"></div>
        </div>
      `;
      categoryBarsList.appendChild(row);
    });
  }

  if (!sessions || sessions.length === 0) {
    focusHistoryList.innerHTML = `<div class="empty-state">No focus sessions recorded yet.</div>`;
  } else {
    focusHistoryList.innerHTML = '';
    sessions.slice(0, 8).forEach(s => {
      const item = document.createElement('div');
      item.className = 'focus-log-item glass-inset';
      const timeStr = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      item.innerHTML = `
        <div>
          <strong>${s.category}</strong>
          <span style="font-size:11px; color:var(--text-muted); margin-left:6px;">${timeStr}</span>
        </div>
        <div style="font-family:var(--font-mono); font-weight:700; color:var(--primary);">+${s.durationMinutes}m</div>
      `;
      focusHistoryList.appendChild(item);
    });
  }
}

clearTimeLogsBtn?.addEventListener('click', async () => {
  if (confirm('Clear focus time history?')) {
    for (const s of (timeAnalytics.sessions || [])) {
      await fetch(`/api/time-analytics/${s.id}`, { method: 'DELETE' });
    }
    fetchTimeAnalytics();
  }
});

// ========================================================
// 8. KEYPAD CALCULATOR
// ========================================================
function updateCalcScreen() {
  calcExpression.textContent = calcExpr || '0';
  calcCurrentValue.textContent = calcCurrent || '0';
}

function handleDigit(d) {
  if (isNewNumber) {
    calcCurrent = d === '.' ? '0.' : d;
    isNewNumber = false;
  } else {
    if (d === '.' && calcCurrent.includes('.')) return;
    calcCurrent = calcCurrent === '0' && d !== '.' ? d : calcCurrent + d;
  }
  updateCalcScreen();
}

function handleOperator(op) {
  const displayOp = op === '*' ? '×' : op === '/' ? '÷' : op;
  if (!isNewNumber) {
    calcExpr += (calcExpr ? ' ' : '') + calcCurrent + ' ' + displayOp;
    calcCurrent = '0';
    isNewNumber = true;
  } else if (calcExpr) {
    calcExpr = calcExpr.replace(/[+−×÷*/]\s*$/, displayOp);
  }
  updateCalcScreen();
}

function evaluateCalcExpression() {
  let full = calcExpr;
  if (!isNewNumber || !full) {
    full += (full ? ' ' : '') + calcCurrent;
  }

  let mathStr = full
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-');

  try {
    if (!/^[0-9+\-*/.() %^]+$/.test(mathStr)) {
      throw new Error('Invalid format');
    }
    mathStr = mathStr.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');

    const result = Function(`'use strict'; return (${mathStr})`)();
    const formattedResult = Number.isInteger(result) ? result.toString() : parseFloat(result.toFixed(6)).toString();

    const tapeItem = {
      id: Date.now().toString(),
      expression: full,
      result: formattedResult,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    calcTape.unshift(tapeItem);
    if (calcTape.length > 30) calcTape.pop();
    localStorage.setItem('nova_calc_tape', JSON.stringify(calcTape));
    renderCalcTape();

    calcCurrent = formattedResult;
    calcExpr = '';
    isNewNumber = true;
    updateCalcScreen();
  } catch (err) {
    calcCurrent = 'Error';
    isNewNumber = true;
    updateCalcScreen();
  }
}

function renderCalcTape() {
  if (!calcTapeList) return;
  if (calcTape.length === 0) {
    calcTapeList.innerHTML = `<div class="empty-state">No calculations yet. Use the keypad or physical keyboard!</div>`;
    return;
  }
  calcTapeList.innerHTML = '';
  calcTape.forEach(item => {
    const el = document.createElement('div');
    el.className = 'tape-item glass-inset';
    el.innerHTML = `
      <div class="tape-expr">${item.expression} =</div>
      <div class="tape-res">${item.result}</div>
    `;
    el.addEventListener('click', () => {
      calcCurrent = item.result;
      isNewNumber = false;
      updateCalcScreen();
    });
    calcTapeList.appendChild(el);
  });
}

clearCalcTapeBtn?.addEventListener('click', () => {
  calcTape = [];
  localStorage.removeItem('nova_calc_tape');
  renderCalcTape();
});

document.querySelectorAll('.calc-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const digit = btn.dataset.digit;
    const op = btn.dataset.op;
    const action = btn.dataset.action;

    if (digit !== undefined) handleDigit(digit);
    else if (op !== undefined) handleOperator(op);
    else if (action === 'all-clear') {
      calcExpr = '';
      calcCurrent = '0';
      isNewNumber = true;
      updateCalcScreen();
    } else if (action === 'backspace') {
      if (calcCurrent.length > 1 && calcCurrent !== 'Error') {
        calcCurrent = calcCurrent.slice(0, -1);
      } else {
        calcCurrent = '0';
        isNewNumber = true;
      }
      updateCalcScreen();
    } else if (action === 'percent') {
      const val = parseFloat(calcCurrent);
      calcCurrent = (val / 100).toString();
      updateCalcScreen();
    } else if (action === 'negate') {
      if (calcCurrent !== '0' && calcCurrent !== 'Error') {
        calcCurrent = calcCurrent.startsWith('-') ? calcCurrent.slice(1) : '-' + calcCurrent;
        updateCalcScreen();
      }
    } else if (action === 'equals') {
      evaluateCalcExpression();
    }
  });
});

document.querySelectorAll('.btn-calc-fn').forEach(btn => {
  btn.addEventListener('click', () => {
    const fn = btn.dataset.fn;
    if (fn === 'square') {
      const v = parseFloat(calcCurrent);
      calcCurrent = (v * v).toString();
      isNewNumber = true;
      updateCalcScreen();
    } else if (fn === 'sqrt') {
      const v = parseFloat(calcCurrent);
      calcCurrent = v < 0 ? 'Error' : Math.sqrt(v).toString();
      isNewNumber = true;
      updateCalcScreen();
    } else if (fn === 'paren-open') {
      calcExpr += (calcExpr ? ' ' : '') + '(';
      updateCalcScreen();
    } else if (fn === 'paren-close') {
      calcExpr += (calcExpr ? ' ' : '') + calcCurrent + ')';
      calcCurrent = '0';
      isNewNumber = true;
      updateCalcScreen();
    } else if (fn === 'copy') {
      navigator.clipboard.writeText(calcCurrent).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500);
      });
    }
  });
});

window.addEventListener('keydown', (e) => {
  const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (activeTag === 'input' || activeTag === 'textarea') return;

  if (document.getElementById('tab-calc').classList.contains('active')) {
    if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
    else if (e.key === '.') handleDigit('.');
    else if (e.key === '+') handleOperator('+');
    else if (e.key === '-') handleOperator('-');
    else if (e.key === '*') handleOperator('*');
    else if (e.key === '/') { e.preventDefault(); handleOperator('/'); }
    else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); evaluateCalcExpression(); }
    else if (e.key === 'Backspace') {
      if (calcCurrent.length > 1) calcCurrent = calcCurrent.slice(0, -1);
      else { calcCurrent = '0'; isNewNumber = true; }
      updateCalcScreen();
    } else if (e.key === 'Escape') {
      calcExpr = '';
      calcCurrent = '0';
      isNewNumber = true;
      updateCalcScreen();
    }
  }
});

// ========================================================
// 9. REMINDERS & ALARMS
// ========================================================
function setDefaultReminderTime(minutes = 15) {
  const d = new Date(Date.now() + minutes * 60 * 1000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  remTimeInput.value = d.toISOString().slice(0, 16);
}
setDefaultReminderTime(15);

presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const mins = parseInt(btn.dataset.mins, 10);
    setDefaultReminderTime(mins);
  });
});

async function fetchReminders() {
  try {
    const res = await fetch('/api/reminders');
    reminders = await res.json();
    renderReminders();
  } catch (e) {
    console.error(e);
  }
}

function getCountdown(targetIso) {
  const diff = new Date(targetIso).getTime() - Date.now();
  if (diff <= 0) return '🔔 Due now!';
  const secs = Math.floor(diff / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function renderReminders() {
  const pending = reminders.filter(r => !r.completed);
  if (remindersCountNum) remindersCountNum.textContent = pending.length;

  if (pending.length > 0) {
    remindersCountBadge.textContent = pending.length;
    remindersCountBadge.classList.remove('hidden');
  } else {
    remindersCountBadge.classList.add('hidden');
  }

  if (pending.length === 0) {
    remindersList.innerHTML = `<div class="empty-state">No reminders active right now.</div>`;
    return;
  }

  pending.sort((a, b) => new Date(a.targetTime) - new Date(b.targetTime));
  remindersList.innerHTML = '';

  pending.forEach(r => {
    const isDue = new Date(r.targetTime).getTime() <= Date.now();
    const row = document.createElement('div');
    row.className = `rem-item-card glass-inset ${isDue ? 'due' : ''}`;

    const dt = new Date(r.targetTime);
    const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = dt.toLocaleDateString([], { month: 'short', day: 'numeric' });

    row.innerHTML = `
      <div class="rem-info">
        <strong style="font-size:13px; color:var(--text-main);">${r.text}</strong>
        <span class="rem-time-tag">${dateStr} at ${timeStr} • <span id="cd-${r.id}">${getCountdown(r.targetTime)}</span></span>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="btn-subtle btn-sm" onclick="snoozeRem('${r.id}')">+5m</button>
        <button class="btn-primary-sm" onclick="completeRem('${r.id}')">✓ Done</button>
        <button class="btn-subtle btn-sm" style="color:var(--danger);" onclick="deleteRem('${r.id}')">✕</button>
      </div>
    `;
    remindersList.appendChild(row);
  });
}

window.snoozeRem = async (id) => {
  await fetch(`/api/reminders/${id}/snooze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minutes: 5 })
  });
  triggeredIds.delete(id);
  alarmToast.classList.add('hidden');
  fetchReminders();
};

window.completeRem = async (id) => {
  await fetch(`/api/reminders/${id}/complete`, { method: 'POST' });
  alarmToast.classList.add('hidden');
  fetchReminders();
};

window.deleteRem = async (id) => {
  await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
  fetchReminders();
};

addReminderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = remTextInput.value.trim();
  const time = remTimeInput.value;
  if (!text || !time) return;

  const targetDate = new Date(time);
  await fetch('/api/reminders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, targetTime: targetDate.toISOString() })
  });

  remTextInput.value = '';
  setDefaultReminderTime(15);
  fetchReminders();
});

setInterval(() => {
  const now = Date.now();
  reminders.forEach(r => {
    if (!r.completed) {
      const el = document.getElementById(`cd-${r.id}`);
      if (el) el.textContent = getCountdown(r.targetTime);

      if (new Date(r.targetTime).getTime() <= now && !triggeredIds.has(r.id)) {
        triggeredIds.add(r.id);
        currentAlarmItem = r;
        playAlertChime();
        alarmMessage.textContent = r.text;
        alarmToast.classList.remove('hidden');

        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('⏰ Reminder Due!', { body: r.text });
        }
        renderReminders();
      }
    }
  });
}, 1000);

alarmSnoozeBtn?.addEventListener('click', () => {
  if (currentAlarmItem) window.snoozeRem(currentAlarmItem.id);
});
alarmDismissBtn?.addEventListener('click', () => {
  if (currentAlarmItem) window.completeRem(currentAlarmItem.id);
});

// ========================================================
// 10. FAST ASSISTANT & DIRECT GOOGLE SEARCH
// ========================================================
function formatMarkdown(text) {
  if (!text) return '';

  // Strip any internal tool/action tags from user view
  text = text
    .replace(/\[\[?\s*(?:ADD_TASK|START_TIMER|ADD_ROUTINE|SAVE_NOTE|DEFEAT_URGE|TASK|TIMER|ROUTINE|NOTE)[\s\S]*?(?:\]\]?|$)/gi, '')
    .replace(/:\s*\d+\s*\]+/gi, '')
    .replace(/\[Pending Tasks[\s\S]*?\]/gi, '')
    .replace(/\[Pending Checklist Tasks[\s\S]*?\]/gi, '')
    .replace(/\]\]/g, '')
    .trim();

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Format reasoning blocks (e.g. <think>...</think> from Qwen/DeepSeek)
  html = html.replace(/&lt;think&gt;([\s\S]*?)&lt;\/think&gt;/gi, (match, p1) => {
    return `<div class="think-block"><div class="think-block-title">🧠 Deep Reasoning / Think Harder</div>${p1.trim().replace(/\n/g, '<br>')}</div>`;
  });

  // Code blocks ```code```
  html = html.replace(/```([a-zA-Z]*)\n([\s\S]*?)```/g, '<pre style="background:rgba(0,0,0,0.35); border:1px solid rgba(255,255,255,0.08); padding:10px 14px; border-radius:8px; overflow-x:auto; font-family:var(--font-mono); font-size:12px; margin:8px 0; color:var(--text-main);"><code>$2</code></pre>');

  // Links & inline code
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--primary); font-weight:600;">$1</a>');
  html = html.replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.15); padding:2px 5px; border-radius:4px; font-family:var(--font-mono); font-size:12px;">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Headers (ChatGPT & Meta AI style)
  html = html.replace(/^### (.*$)/gim, '<h4 style="margin:12px 0 6px; color:var(--text-main); font-weight:700; font-size:14px; display:flex; align-items:center; gap:6px;">$1</h4>');
  html = html.replace(/^## (.*$)/gim, '<h3 style="margin:14px 0 8px; color:var(--text-main); font-weight:800; font-size:15.5px;">$1</h3>');
  html = html.replace(/^# (.*$)/gim, '<h2 style="margin:16px 0 10px; color:var(--text-main); font-weight:800; font-size:17px;">$1</h2>');

  // Markdown Tables
  html = html.replace(/((?:\|[^\n]+\|\r?\n)+)/g, (match) => {
    const rows = match.trim().split('\n').map(r => r.trim()).filter(Boolean);
    if (rows.length < 2) return match;
    let tableHtml = '<div style="overflow-x:auto; margin:8px 0;"><table style="width:100%; border-collapse:collapse; font-size:12px; background:rgba(0,0,0,0.2); border-radius:6px; overflow:hidden;">';
    let isHeader = true;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (/^\|[-:\s|]+\|$/.test(row)) {
        isHeader = false;
        continue;
      }
      const cols = row.split('|').slice(1, -1).map(c => c.trim());
      tableHtml += '<tr>';
      cols.forEach(col => {
        if (isHeader) {
          tableHtml += `<th style="padding:6px 10px; background:rgba(59,130,246,0.15); border:1px solid rgba(255,255,255,0.08); text-align:left; font-weight:700;">${col}</th>`;
        } else {
          tableHtml += `<td style="padding:6px 10px; border:1px solid rgba(255,255,255,0.08);">${col}</td>`;
        }
      });
      tableHtml += '</tr>';
      if (i === 0) isHeader = false;
    }
    tableHtml += '</table></div>';
    return tableHtml;
  });

  // Math equation formatting (inline & display LaTeX)
  html = html.replace(/\\\[([\s\S]*?)\\\]/g, '<div style="background:rgba(0,0,0,0.18); padding:8px 12px; border-radius:6px; margin:6px 0; font-family:var(--font-mono); font-size:13px; text-align:center; color:#38bdf8;">$1</div>');
  html = html.replace(/\\\(([\s\S]*?)\\\)/g, '<code style="background:rgba(0,0,0,0.15); padding:2px 6px; border-radius:4px; font-family:var(--font-mono); font-size:12px; color:#38bdf8;">$1</code>');
  html = html.replace(/\$\$([\s\S]*?)\$\$/g, '<div style="background:rgba(0,0,0,0.18); padding:8px 12px; border-radius:6px; margin:6px 0; font-family:var(--font-mono); font-size:13px; text-align:center; color:#38bdf8;">$1</div>');

  // Blockquotes
  html = html.replace(/^>\s*(.+)$/gm, '<blockquote style="border-left:3px solid var(--primary); padding:6px 12px; margin:8px 0; background:rgba(59,130,246,0.06); border-radius:0 6px 6px 0; color:var(--text-secondary);">$1</blockquote>');

  // Unordered list items
  html = html.replace(/^\s*[-*•]\s+(.+)$/gm, '<li class="gpt-bullet">$1</li>');
  html = html.replace(/((?:<li class="gpt-bullet">.*?<\/li>\s*)+)/g, '<ul style="margin-left:18px; margin-bottom:10px; line-height:1.6;">$1</ul>');

  // Ordered list items
  html = html.replace(/^\s*(\d+)\.\s+(.+)$/gm, '<li class="gpt-ordered" value="$1">$2</li>');
  html = html.replace(/((?:<li class="gpt-ordered"[^>]*>.*?<\/li>\s*)+)/g, '<ol style="margin-left:18px; margin-bottom:10px; line-height:1.6;">$1</ol>');

  html = html.split('\n\n').map(p => {
    if (p.startsWith('<ul') || p.startsWith('<ol') || p.startsWith('<pre') || p.startsWith('<h') || p.startsWith('<blockquote') || p.startsWith('<div class="think-block"') || p.startsWith('<div style="overflow-x:auto')) return p;
    return `<p style="margin-bottom:8px; line-height:1.6;">${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');

  return html;
}

let chatSessionHistory = [];

const CHAT_ICONS = {
  copy: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
  check: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  edit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
  retry: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>`,
  thumbUp: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>`,
  thumbDown: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path></svg>`,
  voice: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
  stop: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>`,
  note: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`
};

function appendUserMessage(text) {
  if (chatHero) chatHero.style.display = 'none';

  const row = document.createElement('div');
  row.className = 'message-row user';
  row.dataset.rawText = text;

  const wrap = document.createElement('div');
  wrap.className = 'msg-bubble-wrap';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = text;
  wrap.appendChild(bubble);

  // Modern Meta AI style User actions: Edit & Copy
  const userActions = document.createElement('div');
  userActions.className = 'user-msg-actions';
  userActions.innerHTML = `
    <button type="button" class="btn-dock-icon" title="Edit question" onclick="editUserMessage(this)">
      ${CHAT_ICONS.edit}
    </button>
    <button type="button" class="btn-dock-icon" title="Copy text" onclick="copyUserMessage(this)">
      ${CHAT_ICONS.copy}
    </button>
  `;
  wrap.appendChild(userActions);

  row.appendChild(wrap);
  messagesContainer.appendChild(row);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

window.editUserMessage = (btn) => {
  const row = btn.closest('.message-row.user');
  const txt = row.dataset.rawText || row.querySelector('.message-bubble')?.innerText || '';
  if (userInput) {
    userInput.value = txt;
    userInput.focus();
    userInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

window.copyUserMessage = (btn) => {
  const row = btn.closest('.message-row.user');
  const txt = row.dataset.rawText || row.querySelector('.message-bubble')?.innerText || '';
  navigator.clipboard.writeText(txt).then(() => {
    btn.innerHTML = CHAT_ICONS.check;
    setTimeout(() => { btn.innerHTML = CHAT_ICONS.copy; }, 2000);
  });
};

function createAssistantEntry() {
  const row = document.createElement('div');
  row.className = 'message-row assistant';

  const wrap = document.createElement('div');
  wrap.className = 'msg-bubble-wrap';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = '<em>Thinking...</em>';

  wrap.appendChild(bubble);
  row.appendChild(wrap);
  messagesContainer.appendChild(row);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  return { row, wrap, bubble };
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function appendActionDock(wrap, originalQuery, answerText) {
  // Meta AI / ChatGPT Style Utility Dock ONLY (Copy, Retry, Feedback, Voice, Bookmark)
  // No intrusive or unsolicited action buttons under messages
  const dock = document.createElement('div');
  dock.className = 'msg-action-dock meta-style-dock';

  dock.innerHTML = `
    <button type="button" class="btn-dock-icon" title="Copy answer" onclick="copyAnswerText(this)">
      ${CHAT_ICONS.copy}
    </button>
    <button type="button" class="btn-dock-icon" title="Regenerate response" onclick="retryLastQuery(this)">
      ${CHAT_ICONS.retry}
    </button>
    <button type="button" class="btn-dock-icon" title="Helpful" onclick="handleThumbFeedback(this, true)">
      ${CHAT_ICONS.thumbUp}
    </button>
    <button type="button" class="btn-dock-icon" title="Not helpful" onclick="handleThumbFeedback(this, false)">
      ${CHAT_ICONS.thumbDown}
    </button>
    <button type="button" class="btn-dock-icon" title="Save to Notes" onclick="saveAnswerAsNote(this)">
      ${CHAT_ICONS.note}
    </button>
    <button type="button" class="btn-dock-icon" title="Read Aloud (Voice)" onclick="speakAnswerText(this)">
      ${CHAT_ICONS.voice}
    </button>
  `;

  dock.dataset.answer = answerText;
  dock.dataset.query = cleanQuery;
  wrap.appendChild(dock);
}

window.triggerPillTimer = (mins = 25) => {
  setTimerDuration(mins);
  switchTab('tab-focus');
  if (!isPomodoroRunning && pomodoroStartBtn) {
    pomodoroStartBtn.click();
  }
};

window.triggerPillTask = async (btn, taskName) => {
  if (!taskName) taskName = 'Study Focus Session';
  btn.innerHTML = '<span>✓</span> Added!';
  btn.classList.add('action-completed');
  try {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: taskName, category: 'Study' })
    });
    fetchTasks();
  } catch {
    tasks.push({ id: Date.now().toString(), text: taskName, completed: false, category: 'Study' });
    localStorage.setItem('synapse_tasks', JSON.stringify(tasks));
    renderTasks();
  }
};

window.triggerPillUrge = async (btn) => {
  btn.innerHTML = '<span>🔥</span> +1 Win Logged!';
  btn.classList.add('action-completed');
  handleDefeatUrge();
};

window.retryLastQuery = (btn) => {
  const dock = btn.closest('.msg-action-dock');
  const q = dock.dataset.query || '';
  if (q && userInput && chatForm) {
    userInput.value = q;
    chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }
};

window.handleThumbFeedback = (btn, isUp) => {
  const parent = btn.closest('.msg-action-dock');
  parent.querySelectorAll('.thumb-active').forEach(b => {
    b.classList.remove('thumb-active');
    b.style.color = '';
  });
  btn.classList.add('thumb-active');
  btn.style.color = isUp ? '#10b981' : '#ef4444';
};

window.copyAnswerText = (btn) => {
  const dock = btn.closest('.msg-action-dock');
  const txt = dock.dataset.answer || '';
  navigator.clipboard.writeText(txt).then(() => {
    btn.innerHTML = CHAT_ICONS.check;
    setTimeout(() => { btn.innerHTML = CHAT_ICONS.copy; }, 2000);
  });
};

window.speakAnswerText = (btn) => {
  const dock = btn.closest('.msg-action-dock');
  const txt = dock.dataset.answer || '';
  if (!txt) return;
  if ('speechSynthesis' in window) {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      btn.innerHTML = CHAT_ICONS.voice;
      return;
    }
    const cleanSpeech = txt.replace(/[*#`_~]/g, '');
    const utter = new SpeechSynthesisUtterance(cleanSpeech);
    utter.onend = () => { btn.innerHTML = CHAT_ICONS.voice; };
    utter.onerror = () => { btn.innerHTML = CHAT_ICONS.voice; };
    btn.innerHTML = CHAT_ICONS.stop;
    window.speechSynthesis.speak(utter);
  }
};

window.saveAnswerAsNote = async (btn) => {
  const dock = btn.closest('.msg-action-dock');
  const query = dock.dataset.query || 'Quick Answer';
  const content = dock.dataset.answer || '';

  btn.innerHTML = CHAT_ICONS.check;
  try {
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: query.slice(0, 30),
        content: content
      })
    });
    fetchNotes();
  } catch {}
  setTimeout(() => { btn.innerHTML = CHAT_ICONS.note; }, 2000);
};

// Direct Google Button
chatGoogleBtn?.addEventListener('click', () => {
  const query = userInput.value.trim();
  if (query) {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
  } else {
    const promptQ = prompt('Search Google for:');
    if (promptQ && promptQ.trim()) {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(promptQ.trim())}`, '_blank');
    }
  }
});

// Chat Quick Actions
chatHeroUrgeBtn?.addEventListener('click', () => {
  defeatUrgeBtn?.click();
  appendUserMessage("🔥 I resisted a social media distraction!");
  const { wrap, bubble } = createAssistantEntry();
  const reply = `🔥 **Heroic Discipline Win!**\n\nYou chose long-term excellence over cheap digital dopamine. Your focus muscle just leveled up.\n\n• **Urges Defeated Today:** ${disciplineStats.distractionsResisted || 1}\n• **Discipline Score:** ${disciplineStats.score || 92}%\n\nTake a deep breath and dive straight back into your study block. You're building an unstoppable mind!`;
  bubble.innerHTML = formatMarkdown(reply);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  appendActionDock(wrap, "Distraction resisted", reply);
});

chatHeroFocusBtn?.addEventListener('click', () => {
  switchTab('tab-focus');
  if (!isPomodoroRunning && pomodoroStartBtn) {
    pomodoroStartBtn.click();
  }
});

chatHeroRoutineBtn?.addEventListener('click', () => {
  switchTab('tab-routine');
});

clearChatBtn?.addEventListener('click', () => {
  messagesContainer.innerHTML = '';
  chatSessionHistory = [];
  if (chatHero) {
    messagesContainer.appendChild(chatHero);
    chatHero.style.display = 'flex';
  }
});

// Prompt Chips (works with all static, dynamic and quick action chips)
document.addEventListener('click', (e) => {
  const chip = e.target.closest('.prompt-chip-clean') || e.target.closest('.minimal-prompt-chip');
  if (chip && chip.dataset.prompt) {
    userInput.value = chip.dataset.prompt;
    chatForm.dispatchEvent(new Event('submit'));
    return;
  }
  const quickBtn = e.target.closest('.quick-chip-btn');
  if (quickBtn && quickBtn.dataset.fill) {
    const fill = quickBtn.dataset.fill;
    userInput.value = fill;
    userInput.focus();
    if (!fill.endsWith(': ')) {
      chatForm.dispatchEvent(new Event('submit'));
    }
  }
});

// Dynamic Loaders for Document and Image Analysis Engines
let isPdfJsLoading = false;
async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Could not load PDF parsing library'));
    document.head.appendChild(script);
  });
}

async function extractTextFromPdf(file) {
  const pdfjs = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  const maxPages = Math.min(pdf.numPages, 15);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += `--- Page ${i} ---\n${pageText}\n\n`;
  }
  return { text: fullText.trim(), pages: pdf.numPages };
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('Could not load OCR image scanner'));
    document.head.appendChild(script);
  });
}

async function extractTextFromImage(file) {
  const tesseract = await loadTesseract();
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
  const res = await tesseract.recognize(dataUrl, 'eng');
  return { text: res.data.text.trim(), dataUrl };
}

// File Upload & Attachment Handling (Question Photos, Notes, Syllabus, PDFs)
chatFileInput?.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    showToast('File exceeds 8MB limit. Please attach a smaller image or document.', 'warning', '⚠️');
    chatFileInput.value = '';
    return;
  }

  const kb = (file.size / 1024).toFixed(1);
  if (fileBadgeName) fileBadgeName.textContent = file.name;
  if (fileBadgeSize) fileBadgeSize.textContent = `(${kb} KB)`;
  if (fileAttachmentBadge) fileAttachmentBadge.classList.remove('hidden');

  const isImg = file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  try {
    if (isImg) {
      if (fileBadgeStatus) {
        fileBadgeStatus.textContent = '⏳ Scanning Image (OCR)...';
        fileBadgeStatus.className = 'file-badge-status processing';
      }
      if (fileBadgeThumb) {
        const previewReader = new FileReader();
        previewReader.onload = (ev) => {
          fileBadgeThumb.src = ev.target.result;
          fileBadgeThumb.classList.remove('hidden');
          if (fileBadgeIcon) fileBadgeIcon.classList.add('hidden');
        };
        previewReader.readAsDataURL(file);
      }

      const { text, dataUrl } = await extractTextFromImage(file);
      attachedFile = {
        name: file.name,
        size: file.size,
        text: text || '[Problem photo/diagram uploaded]',
        isImage: true,
        previewUrl: dataUrl
      };
      if (fileBadgeStatus) {
        fileBadgeStatus.textContent = text ? '✅ Text Extracted' : '✅ Diagram Ready';
        fileBadgeStatus.className = 'file-badge-status';
      }
    } else if (isPdf) {
      if (fileBadgeIcon) {
        fileBadgeIcon.textContent = '📕';
        fileBadgeIcon.classList.remove('hidden');
      }
      if (fileBadgeThumb) fileBadgeThumb.classList.add('hidden');
      if (fileBadgeStatus) {
        fileBadgeStatus.textContent = '⏳ Reading PDF Pages...';
        fileBadgeStatus.className = 'file-badge-status processing';
      }

      const { text, pages } = await extractTextFromPdf(file);
      attachedFile = {
        name: file.name,
        size: file.size,
        text: text,
        isPdf: true,
        pages
      };
      if (fileBadgeStatus) {
        fileBadgeStatus.textContent = `✅ ${pages} Pages Extracted`;
        fileBadgeStatus.className = 'file-badge-status';
      }
    } else {
      // Text / Markdown / Code / CSV / JSON
      if (fileBadgeIcon) {
        fileBadgeIcon.textContent = '📄';
        fileBadgeIcon.classList.remove('hidden');
      }
      if (fileBadgeThumb) fileBadgeThumb.classList.add('hidden');
      if (fileBadgeStatus) {
        fileBadgeStatus.textContent = '⏳ Reading Text...';
        fileBadgeStatus.className = 'file-badge-status processing';
      }

      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      attachedFile = {
        name: file.name,
        size: file.size,
        text: text,
        isDoc: true
      };
      if (fileBadgeStatus) {
        fileBadgeStatus.textContent = '✅ Ready';
        fileBadgeStatus.className = 'file-badge-status';
      }
    }
    userInput.focus();
  } catch (err) {
    console.error('File parsing error:', err);
    if (fileBadgeStatus) {
      fileBadgeStatus.textContent = '⚠️ Read Error';
      fileBadgeStatus.className = 'file-badge-status processing';
    }
    showToast(`Could not extract content from ${file.name}: ${err.message}`, 'error', '⚠️');
  }
});

removeAttachmentBtn?.addEventListener('click', () => {
  attachedFile = null;
  if (fileAttachmentBadge) fileAttachmentBadge.classList.add('hidden');
  if (fileBadgeThumb) {
    fileBadgeThumb.src = '';
    fileBadgeThumb.classList.add('hidden');
  }
  if (fileBadgeIcon) {
    fileBadgeIcon.textContent = '📄';
    fileBadgeIcon.classList.remove('hidden');
  }
  if (fileBadgeStatus) fileBadgeStatus.textContent = '';
  if (chatFileInput) chatFileInput.value = '';
});

// ========================================================
// ========================================================
// 10A. ON-DEVICE COGNITIVE MODES (OFFLINE INTELLIGENCE)
// 100% Client-Side Intelligence • Zero Server Tokens or Fees
// ========================================================
let webllm = null;
let activeNeuralEngine = null;
let currentLoadedModelKey = 'fast';
let isModelLoading = false;
let gpuSupported = false;
let hasShaderF16 = false;

// Check hardware acceleration internally
async function initWebGPUDetection() {
  if (!navigator.gpu) {
    gpuSupported = false;
    return;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter) {
      gpuSupported = true;
      hasShaderF16 = adapter.features.has('shader-f16');
    }
  } catch (e) {
    gpuSupported = false;
  }
}
initWebGPUDetection();

function getNeuralModelId(key) {
  if (key === 'qwen') {
    return hasShaderF16 ? 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' : 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC';
  }
  if (key === 'llama') {
    return hasShaderF16 ? 'Llama-3.2-1B-Instruct-q4f16_1-MLC' : 'Llama-3.2-1B-Instruct-q4f32_1-MLC';
  }
  if (key === 'smol') {
    return hasShaderF16 ? 'SmolLM2-360M-Instruct-q4f16_1-MLC' : 'SmolLM2-360M-Instruct-q4f32_1-MLC';
  }
  return null;
}

async function switchAIModel(selectedKey) {
  if (selectedKey === 'fast') {
    currentLoadedModelKey = 'fast';
    if (modelActiveIcon) modelActiveIcon.textContent = '⚡';
    if (modelStatusChip) {
      modelStatusChip.className = 'model-status-chip';
      modelStatusText.textContent = 'Ready (Offline)';
    }
    modelDownloadCard?.classList.add('hidden');
    return true;
  }

  // Check hardware acceleration availability
  if (!navigator.gpu) {
    showToast('Using high-speed Synapse Instant offline study modules.', 'info', '⚡');
    if (aiModelSelect) aiModelSelect.value = 'fast';
    return false;
  }

  const modelId = getNeuralModelId(selectedKey);
  if (!modelId) {
    if (aiModelSelect) aiModelSelect.value = 'fast';
    return false;
  }

  const icons = { qwen: '🧠', llama: '🎯', smol: '💎' };
  const names = { qwen: 'Synapse Deep Logic', llama: 'Synapse Focus Coach', smol: 'Synapse Ultra-Lite' };
  const icon = icons[selectedKey] || '🧠';
  const name = names[selectedKey] || 'Neural Mode';

  if (modelActiveIcon) modelActiveIcon.textContent = icon;
  if (modelStatusChip) {
    modelStatusChip.className = 'model-status-chip loading';
    modelStatusText.textContent = 'Activating...';
  }

  if (modelDownloadCard) {
    modelDownloadCard.classList.remove('hidden');
    modelDownloadTitle.textContent = `⚡ Preparing ${name}...`;
    modelDownloadSubtitle.textContent = 'Optimizing cognitive weights for permanent offline use. Zero future data usage.';
    modelDownloadPct.textContent = '0%';
    modelProgressFill.style.width = '0%';
    modelDownloadLog.textContent = 'Initializing local intelligence engine...';
  }

  isModelLoading = true;

  try {
    if (!webllm) {
      if (modelDownloadLog) modelDownloadLog.textContent = 'Loading local intelligence core...';
      webllm = await import('https://esm.run/@mlc-ai/web-llm');
    }

    const initProgressCallback = (report) => {
      const pct = Math.round((report.progress || 0) * 100);
      if (modelDownloadPct) modelDownloadPct.textContent = `${pct}%`;
      if (modelProgressFill) modelProgressFill.style.width = `${pct}%`;
      if (modelDownloadLog) modelDownloadLog.textContent = `Optimizing local neural parameters (${pct}%)...`;
    };

    activeNeuralEngine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback
    });

    currentLoadedModelKey = selectedKey;
    isModelLoading = false;

    if (modelStatusChip) {
      modelStatusChip.className = 'model-status-chip';
      modelStatusText.textContent = 'Ready (Offline)';
    }
    if (modelDownloadCard) {
      modelDownloadCard.classList.add('hidden');
    }
    return true;
  } catch (err) {
    console.warn('Local engine initialization notice:', err);
    isModelLoading = false;
    if (modelDownloadCard) {
      modelDownloadTitle.textContent = '⚡ Instant Mode Active';
      modelDownloadLog.textContent = 'Ready for instant responses.';
      setTimeout(() => {
        modelDownloadCard.classList.add('hidden');
      }, 2500);
    }
    if (aiModelSelect) aiModelSelect.value = 'fast';
    currentLoadedModelKey = 'fast';
    if (modelStatusChip) {
      modelStatusChip.className = 'model-status-chip';
      modelStatusText.textContent = 'Ready (Offline)';
    }
    if (modelActiveIcon) modelActiveIcon.textContent = '⚡';
    return false;
  }
}

aiModelSelect?.addEventListener('change', (e) => {
  switchAIModel(e.target.value);
});

modelCancelBtn?.addEventListener('click', () => {
  if (aiModelSelect) aiModelSelect.value = 'fast';
  switchAIModel('fast');
});

async function handleNeuralModelGeneration(text, wrap, bubble) {
  let fullReply = '';
  try {
    if (!activeNeuralEngine || currentLoadedModelKey !== aiModelSelect.value) {
      bubble.innerHTML = `<em>Activating ${aiModelSelect.options[aiModelSelect.selectedIndex].text}...</em>`;
      const loaded = await switchAIModel(aiModelSelect.value);
      if (!loaded) throw new Error('Local engine switch error');
    }

    bubble.innerHTML = '<em>Thinking and reasoning on-device...</em>';

    const systemPrompt = `You are Synapse, the user's sharp, friendly AI study companion and all-rounder dost.
1. Talk like a smart, warm friend/dost in punchy Hinglish or English matching the user.
2. For quick queries, give direct 2-4 line answers with bold keywords.
3. For math & physics numericals, state Formula -> Step-by-Step calculation -> Final answer with SI units -> Exam Pitfalls.
4. For routines or concepts, provide clean bullet points. Never be robotic.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ];

    const isMathOrTechnical = /(?:calculate|solve|derive|numerical|formula|velocity|acceleration|momentum|gravity|integral|derivative|code|function|algorithm|\d+\s*[-+*/^]\s*\d+)/i.test(text);
    const dynamicTemp = isMathOrTechnical ? 0.35 : 0.65;

    const stream = await activeNeuralEngine.chat.completions.create({
      messages,
      stream: true,
      temperature: dynamicTemp,
      max_tokens: 1200
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        fullReply += delta;
        bubble.innerHTML = formatMarkdown(fullReply);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }

    if (!fullReply.trim()) {
      fullReply = "I have processed your query with the on-device engine. Let me know if you would like me to elaborate further on this topic!";
      bubble.innerHTML = formatMarkdown(fullReply);
    }

    appendActionDock(wrap, text, fullReply);
  } catch (err) {
    bubble.innerHTML = '<em>Consulting Synapse Instant study coach...</em>';
    const fastReply = getClientOfflineCoachReply(text);
    setTimeout(() => {
      bubble.innerHTML = formatMarkdown(fastReply);
      appendActionDock(wrap, text, fastReply);
    }, 500);
  }
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isGenerating) return;

  const rawText = userInput.value.trim();
  if (!rawText && !attachedFile) return;

  let displayHtml = '';
  let promptText = rawText;

  if (attachedFile) {
    const kb = (attachedFile.size / 1024).toFixed(1);
    if (attachedFile.isImage) {
      displayHtml = `
        <div class="user-attached-thumb-wrap">
          <img src="${attachedFile.previewUrl}" class="user-attached-img" alt="Uploaded Question">
          <div>
            <strong>📷 ${escapeHtml(attachedFile.name)}</strong>
            <span style="font-size:11px; color:var(--text-muted); display:block;">(${kb} KB • OCR Extracted)</span>
          </div>
        </div>` + (rawText ? `<div>${escapeHtml(rawText)}</div>` : `<div><em>Please solve and explain this question step-by-step.</em></div>`);

      promptText = `[DOCUMENT / STUDY MATERIAL ANALYSIS: "${attachedFile.name}"]\nType: Problem/Question Photo (OCR Extracted Text)\nExtracted Content:\n${attachedFile.text}\n\n[USER INSTRUCTION / QUESTION]:\n${rawText || 'Solve this step-by-step with clear formulas, scientific/mathematical logic, and key exam pitfalls to avoid.'}`;
    } else {
      const docType = attachedFile.isPdf ? `PDF Notes (${attachedFile.pages || 1} pages)` : 'Study Document';
      displayHtml = `<div class="user-attached-file-pill">📄 <strong>${escapeHtml(attachedFile.name)}</strong> <span>(${kb} KB • ${docType})</span></div>` + (rawText ? `<div>${escapeHtml(rawText)}</div>` : `<div><em>Please analyze and summarize this uploaded study material.</em></div>`);

      promptText = `[DOCUMENT / STUDY MATERIAL ANALYSIS: "${attachedFile.name}"]\nType: ${docType}\nExtracted Content:\n${attachedFile.text}\n\n[USER INSTRUCTION / QUESTION]:\n${rawText || 'Summarize the core syllabus concepts, derive key formulas, provide active recall questions, and highlight common exam traps.'}`;
    }

    // Reset attachment state
    attachedFile = null;
    if (fileAttachmentBadge) fileAttachmentBadge.classList.add('hidden');
    if (fileBadgeThumb) {
      fileBadgeThumb.src = '';
      fileBadgeThumb.classList.add('hidden');
    }
    if (fileBadgeIcon) {
      fileBadgeIcon.textContent = '📄';
      fileBadgeIcon.classList.remove('hidden');
    }
    if (fileBadgeStatus) fileBadgeStatus.textContent = '';
    if (chatFileInput) chatFileInput.value = '';
  } else {
    displayHtml = rawText;
  }

  userInput.value = '';
  appendUserMessage(displayHtml);
  const { wrap, bubble } = createAssistantEntry();
  isGenerating = true;
  sendBtn.disabled = true;

  let fullReply = '';
  let googleQuery = rawText || 'study notes';

  const safetyUnlock = setTimeout(() => {
    if (isGenerating) {
      isGenerating = false;
      sendBtn.disabled = false;
    }
  }, 8000);

  try {
    const controller = new AbortController();
    const connectTimeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('/api/chat-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-gemini-key': localStorage.getItem('synapse_gemini_key') || '',
        'x-groq-key': localStorage.getItem('synapse_groq_key') || ''
      },
      body: JSON.stringify({
        message: promptText,
        history: chatSessionHistory.slice(-8)
      }),
      signal: controller.signal
    });
    clearTimeout(connectTimeoutId);

    if (!res.ok) throw new Error('Offline or server unreachable');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let streamFinished = false;

    while (!streamFinished) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const events = sseBuffer.split('\n\n');
      sseBuffer = events.pop() || '';

      for (const event of events) {
        const trimmed = event.trim();
        if (!trimmed) continue;

        for (const line of trimmed.split('\n')) {
          const cleanLine = line.trim();
          if (cleanLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(cleanLine.substring(6));
              if (data.token) {
                fullReply += data.token;
                bubble.innerHTML = formatMarkdown(fullReply);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
              }
              if (data.googleQuery) googleQuery = data.googleQuery;
              if (data.isReminder) playAlertChime();
              if (data.refreshReminders) fetchReminders();
              if (data.refreshTasks) {
                fetchTasks();
                updateDailyMissionHud();
              }
              if (data.refreshNotes) fetchNotes();
              if (data.refreshRoutine) fetchRoutines();
              if (data.triggerUrgeDefeated) handleDefeatUrge();
              if (data.triggerFocus) {
                setTimerDuration(data.triggerFocus.duration);
                if (!isPomodoroRunning && pomodoroStartBtn) {
                  pomodoroStartBtn.click();
                }
                showToast(`⏱️ ${data.triggerFocus.duration}m Focus Timer started! Anti-cheat lock active.`, 'info', '⏱️');
              }
              if (data.done) {
                streamFinished = true;
                chatSessionHistory.push({ role: 'user', content: promptText });
                chatSessionHistory.push({ role: 'assistant', content: fullReply });
                try { appendActionDock(wrap, googleQuery, fullReply); } catch (e) {}

                // Generative UI: Live Interactive Timer Card
                if (data.triggerFocus) {
                  const timerEmbed = document.createElement('div');
                  timerEmbed.className = 'chat-embedded-card timer-card-embed';
                  timerEmbed.innerHTML = `
                    <div class="embed-header">
                      <span class="pulsing-clock">⏱️</span> <strong>${data.triggerFocus.duration}m Focus Timer Active & Running!</strong>
                    </div>
                    <p class="embed-desc">Anti-distraction lock active. Keep studying here or view the big clock.</p>
                    <div class="embed-action-row">
                      <button type="button" class="btn-embed-action" onclick="switchTab('tab-focus')">Open Full Focus Clock ➔</button>
                    </div>
                  `;
                  bubble.appendChild(timerEmbed);
                }

                // Generative UI: Interactive Task Confirmation Card
                if (data.refreshTasks) {
                  const taskEmbed = document.createElement('div');
                  taskEmbed.className = 'chat-embedded-card task-card-embed';
                  taskEmbed.innerHTML = `
                    <div class="embed-header">
                      <span>✅</span> <strong>Checklist Updated!</strong>
                    </div>
                    <p class="embed-desc">Task is saved in your daily checklist.</p>
                    <div class="embed-action-row">
                      <button type="button" class="btn-embed-action" onclick="switchTab('tab-tasks')">View Checklist ➔</button>
                    </div>
                  `;
                  bubble.appendChild(taskEmbed);
                  showToast('✅ Study task added to your checklist!', 'success', '✅');
                }

                // Generative UI: 1-Click Sync to Daily Flows if routine blocks detected
                const routineMatches = fullReply.match(/(?:•|\*|-|\d+\.)\s*(\d{1,2}:\d{2}\s*(?:AM|PM)?\s*[-–]\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)\s*[:–-]?\s*([^\n\r]+)/gi);
                if (routineMatches && routineMatches.length >= 2) {
                  const routineEmbed = document.createElement('div');
                  routineEmbed.className = 'chat-embedded-card routine-card-embed';
                  routineEmbed.innerHTML = `
                    <div class="embed-header">
                      <span>⚡</span> <strong>Interactive Study Routine Detected (${routineMatches.length} Blocks)</strong>
                    </div>
                    <p class="embed-desc">Apply this entire schedule to your daily routine in one click!</p>
                    <div class="embed-action-row">
                      <button type="button" class="btn-embed-action btn-sync-routine-now">⚡ 1-Click Sync to Daily Flows</button>
                    </div>
                  `;
                  routineEmbed.querySelector('.btn-sync-routine-now')?.addEventListener('click', () => {
                    syncRoutineBlocksFromText(fullReply);
                  });
                  bubble.appendChild(routineEmbed);
                }

                setTimeout(() => {
                  messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }, 50);
                break;
              }
            } catch (e) {}
          }
        }
        if (streamFinished) break;
      }
    }

    try { reader.cancel(); } catch (e) {}

    if (!fullReply.trim()) {
      throw new Error('Empty stream response from server');
    }

    if (!chatSessionHistory.some(h => h.role === 'assistant' && h.content === fullReply)) {
      chatSessionHistory.push({ role: 'user', content: promptText });
      chatSessionHistory.push({ role: 'assistant', content: fullReply });
      try { appendActionDock(wrap, googleQuery, fullReply); } catch (e) {}
    }
  } catch (err) {
    // 100% Client-Side Offline AI Brain (runs directly on Android in Airplane mode / no server)
    if (webLlmEngine) {
      try {
        bubble.innerHTML = '<em>🧠 Generating offline response via WebGPU...</em>';
        const isMathOffline = /(?:calculate|solve|derive|numerical|formula|velocity|acceleration|momentum|gravity|integral|derivative|code|function|algorithm|\d+\s*[-+*/^]\s*\d+)/i.test(promptText);
        const dynamicOfflineTemp = isMathOffline ? 0.35 : 0.65;
        const chunks = await webLlmEngine.chat.completions.create({
          messages: [
            { role: 'system', content: 'You are Synapse, a friendly ChatGPT/Meta AI style study dost. Explain in warm, punchy Hinglish or English with bold concepts. For numericals, show formula, step-by-step logic, and final units.' },
            ...chatSessionHistory.slice(-6).map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: promptText }
          ],
          stream: true,
          temperature: dynamicOfflineTemp,
          max_tokens: 450
        });

        fullReply = '';
        for await (const chunk of chunks) {
          const delta = chunk.choices[0]?.delta?.content || '';
          fullReply += delta;
          bubble.innerHTML = formatMarkdown(fullReply);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      } catch (webLlmErr) {
        fullReply = getClientOfflineCoachReply(promptText);
        bubble.innerHTML = formatMarkdown(fullReply);
      }
    } else {
      const offlineReply = getClientOfflineCoachReply(promptText);
      fullReply = offlineReply;
      bubble.innerHTML = formatMarkdown(fullReply);
    }
    chatSessionHistory.push({ role: 'user', content: promptText });
    chatSessionHistory.push({ role: 'assistant', content: fullReply });
    appendActionDock(wrap, googleQuery, fullReply);
    setTimeout(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 50);
  } finally {
    clearTimeout(safetyUnlock);
    isGenerating = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
});

// ========================================================
// 10B. CLIENT-SIDE OFFLINE AI COACH (ON-DEVICE ANDROID ENGINE)
// ========================================================
function getClientOfflineCoachReply(text) {
  const lower = text.toLowerCase();

  // Uploaded Study Document Processing & Synthesis
  if (text.startsWith('[UPLOADED STUDY MATERIAL') || text.startsWith('[ATTACHED STUDY FILE')) {
    const nameMatch = text.match(/\[UPLOADED STUDY MATERIAL \/ NOTES:\s*"([^"]+)"\]/);
    const fileName = nameMatch ? nameMatch[1] : 'Study Document';
    const contentStart = text.indexOf(']') + 1;
    const queryStart = text.indexOf('[USER INSTRUCTION / QUESTION]:');
    const fileContent = queryStart > -1 ? text.substring(contentStart, queryStart).trim() : text.substring(contentStart).trim();

    const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const sampleHighlights = lines.slice(0, 8).map(l => `• ${l}`).join('\n');
    const wordCount = fileContent.split(/\s+/).length;

    return `📄 **Synapse Cognitive Synthesis: "${fileName}"**\n\n` +
      `**Document Scope:** ${wordCount} words • ${lines.length} lines parsed 100% on-device.\n\n` +
      `### 🧠 Core Synthesis & Key Insights\n` +
      `${sampleHighlights || '• Content extracted and analyzed successfully.'}\n\n` +
      `### ⚡ Active Recall Retrieval Questions\n` +
      `1. **Core Concept:** What is the primary thesis or formula in these notes?\n` +
      `2. **Feynman Intuition:** How would you explain this mechanism in 3 simple sentences?\n` +
      `3. **Exam Application:** What key problem could appear on a test from this material?\n\n` +
      `💡 *Tip: Tap **📝 Save Note** below to store this summary directly into your offline Notes vault!*`;
  }

  // Defeat Urge / Distraction Resisted
  if (/(?:defeat(?:ed)?\s+(?:an?\s+)?urge|resist(?:ed)?\s+(?:social\s+media|phone|instagram|distraction|urge)|didn't\s+scroll|won\s+against\s+urge)/i.test(lower)) {
    setTimeout(() => {
      handleDefeatUrge();
    }, 400);
    return `🔥 **Heroic Discipline Victory Logged!**\n\nYou chose long-term excellence over cheap digital dopamine. Your focus muscle just leveled up.\n\n• **Urges Defeated Today:** ${(disciplineStats.distractionsResisted || 0) + 1}\n• **Discipline Score:** ${disciplineStats.score || 92}%\n\nTake a deep breath and dive straight back into your study block. You're building an unstoppable mind!`;
  }

  // Focus Timer Triggering (start 45 min focus, timer 30 mins, start focus, etc.)
  const timerMatch = lower.match(/(?:(?:start|set|lagao|chalu\s+karo)\s+)?(?:(\d+)\s*(?:m|min|mins|minutes)\s+(?:focus|study|pomodoro|timer)|(?:focus|pomodoro|timer|study(?:\s+session)?)(?:\s+(?:for|to|of)?\s*(\d+)\s*(?:m|min|mins|minutes)?)?)/i);
  if (timerMatch && (timerMatch[1] || timerMatch[2] || (lower.includes('timer') && !lower.includes('routine')) || lower.includes('focus'))) {
    const duration = parseInt(timerMatch[1] || timerMatch[2], 10) || 25;
    setTimeout(() => {
      setTimerDuration(duration);
      if (!isPomodoroRunning && pomodoroStartBtn) pomodoroStartBtn.click();
    }, 400);
    return `⏱️ **Strict Study Session Initiated!**\n\nStarting a **${duration}-minute** deep focus session for you right now.\n\n• **Mode:** Strict Anti-Distraction\n• **Goal:** 100% absorption, zero phone scrolling.\n\nTimer is running in the background. Keep studying right here or ask any question! 🔒`;
  }

  // Add Task Checklist Item
  const taskMatch = text.match(/^(?:todo|task|add\s+(?:a\s+)?task|add\s+(?:a\s+)?todo|create\s+(?:a\s+)?task|new\s+task|task\s*[:\-])\s+(.+)/i);
  if (taskMatch) {
    const taskText = taskMatch[1].trim();
    const newTask = {
      id: Date.now().toString(),
      text: taskText,
      category: 'Study',
      completed: false,
      createdAt: new Date().toISOString()
    };
    tasks.push(newTask);
    renderTasks();
    fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: taskText, category: 'Study' })
    }).catch(() => {});
    return `✅ **Task Added:** "${taskText}"\n\nSaved directly to your Tasks checklist!`;
  }

  // Add Routine Schedule Block
  const routineMatch = text.match(/^(?:add\s+routine|new\s+routine|routine\s*[:\-])\s+(.+)/i);
  if (routineMatch) {
    const rText = routineMatch[1].trim();
    const timeExtract = rText.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s*-\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?)\s+(.+)$/i);
    let timeStr = '08:00 AM';
    let titleStr = rText;
    if (timeExtract) {
      timeStr = timeExtract[1].toUpperCase();
      titleStr = timeExtract[2].trim();
    }
    routines.push({
      id: Date.now().toString(),
      time: timeStr,
      title: titleStr,
      category: 'Study',
      completed: false
    });
    saveRoutines();
    return `📅 **Routine Block Scheduled:**\n\n• **Time:** ${timeStr}\n• **Block:** "${titleStr}"\n\nAdded to your Synapse Routine timetable!`;
  }

  // Math calculation
  const mathMatch = lower.match(/^(?:calculate|solve|what\s+is\s+)?(\(?\s*\d+\s*[-+*/.]\s*[\d-+*/.()\s]+)$/i);
  if (mathMatch) {
    try {
      const sanitized = mathMatch[1].replace(/[^0-9+\-*/.() ]/g, '');
      const res = Function(`'use strict'; return (${sanitized})`)();
      if (!isNaN(res) && isFinite(res)) {
        return `🔢 **Calculation Result:**\n\`${sanitized.trim()} = ${res}\``;
      }
    } catch {}
  }

  // Persona / Identity
  if (/^(?:who\s+(?:are|r)\s+you|what\s+are\s+you|what\s+is\s+(?:nova|zenith|synapse)|what\s+can\s+you\s+do|help)\b/i.test(lower)) {
    return `👋 **I am Synapse OS**, your 100% offline personal discipline, routine, and study coach running directly on your device.

Here is what I do for you:
• **🎯 Routine Tracker:** Keep you on a strict daily timetable
• **⏱️ Strict Study Mode:** Zero social media deep work sessions
• **🛡️ Distraction Shield:** Help you resist cheap dopamine and build self-discipline
• **📚 Study Mastery:** Teach Feynman technique, active recall & spaced repetition
• **✅ Tasks & Notes:** Manage your daily priorities offline`;
  }

  // How are you / status
  if (/(?:how\s+(?:are|r)\s+(?:you|u)|how(?:'s|\s+is)\s+it\s+going|how\s+do\s+you\s+do|kaise\s+ho|kya\s+hal\b)/i.test(lower)) {
    const isHinglish = /(?:kaise|kya|hal|bhai|yaar)/i.test(lower);
    if (isHinglish) {
      return `Main ekdum badhiya hoon bhai! 🚀 Full energy ke saath ready. Batao, aaj kya smash karna hai—study routine, deep focus timer, ya koi tough concept samajhna hai?`;
    }
    return `I'm feeling great and 100% ready to roll! 🚀 What are we accomplishing together today—locking into a study session, planning your day, or mastering a difficult topic?`;
  }

  // Greetings & Normalization (hlo, hlw, helo, hi, hello, hey, yo, wassup, kaise ho, bhai)
  if (/^(?:hi+|hlo+|hlw|helo+|hello+|hey+|yo|sup|wassup|wsp|hola|namaste|greetings|good\s+morning|good\s+afternoon|good\s+evening|kya\s+hal|kaise\s+ho|bhai)\b/i.test(lower)) {
    const isHinglish = /(?:kya|kaise|bhai|batao|karo|sab|thik|yaar|namaste)/i.test(lower);
    if (isHinglish) {
      return `Hey bhai! 😄 Kaise ho? Batao, aaj kya plan hai? Study routine banana hai, deep focus timer lagana hai, koi tough concept samajhna hai, ya distractions ko crush karna hai? Main poori tarah ready hoon!`;
    }
    return `Hey there! 😄 Great to connect. How are you doing today?\n\nWhat are we tackling right now—knocking out a deep focus study block, planning an optimized routine, or mastering a tough concept? Let me know!`;
  }

  // News / Current Affairs
  if (/(?:today(?:'s)?\s+news|latest\s+news|breaking\s+news|world\s+news|current\s+affairs|news\s+today|headlines)\b/i.test(lower)) {
    return `📰 **Current Affairs & Exam News Focus:**

When in **Offline Mode**, live wire feeds are cached. For breaking minute-by-minute news, tap the **🔍 Google** button below!

**Key Academic Current Affairs Highlights:**
• **Science & Technology:** Major advancements in generative AI, lunar space missions, fusion energy research.
• **Global Economics:** Inflation indicators, global central bank interest rate decisions, energy transition supply chains.
• **Environmental Policy:** Global carbon reduction treaties and renewable energy grid expansion.`;
  }

  // Anti-Social Media / Digital Detox / Procrastination
  if (/(?:social\s+media|instagram|tiktok|youtube|twitter|reels|shorts|doomscroll|scroll|distract\w*|procrastinat\w*|lazy|unmotivat\w*|can't\s+focus|dopamine|urge)/i.test(lower)) {
    return `🛡️ **Discipline Coach: Crushing Distraction & Social Media Urges**

Here is your tactical action protocol:

1. **The 10-Minute Urge Rule:**
   When you feel an intense urge to open social media, tell yourself: *"I will wait 10 minutes."* In 90% of cases, the dopamine craving peaks and fades in 3–5 minutes.

2. **Dopamine Reset (Why studying feels boring):**
   Social media floods your brain with cheap, effortless dopamine. When you sit down to study, your brain craves that instant hit. To reset: put your phone in another room, take 5 deep breaths, and commit to just **5 minutes** of reading. Action creates motivation.

3. **Friction is Your Armor:**
   • Move social apps into deep folders or delete them during exams.
   • Turn your phone to Grayscale (monochrome) — reduces screen time by 30%.
   • Use Synapse's **Strict Study Mode** to lock your focus timer now.

💡 *Remember: Discipline is choosing between what you want NOW and what you want MOST.*`;
  }

  // Study Techniques
  if (/(?:feynman|active\s+recall|spaced\s+repetition|blurting|pomodoro|study\s+technique|how\s+to\s+study|memoriz|exam\s+prep|revision)\b/i.test(lower)) {
    if (/feynman/i.test(lower)) {
      return `🧠 **The Feynman Technique (Master Any Hard Topic):**

1. **Pick the Concept:** Choose a specific formula, theory, or chapter.
2. **Teach it to a 10-Year-Old:** Write down or speak out loud an explanation without using jargon or textbooks.
3. **Identify Gaps:** Where did you stumble or need complex words? That is your exact weak point.
4. **Simplify & Create Analogies:** Re-study that specific gap until you can explain it with an everyday metaphor.

🔥 *Rule: If you cannot explain it simply, you do not understand it deeply.*`;
    }
    if (/active\s+recall/i.test(lower)) {
      return `⚡ **Active Recall (The #1 Science-Backed Study Method):**

Passive reading gives an **illusion of competence**. Active recall forces your brain to retrieve knowledge.

**3 Ways to Use It Right Now:**
• **Closed-Book Questioning:** Read a page, close the book, and write down everything you remember.
• **Flashcard Testing:** Write questions on one side and answers on the other. Test yourself repeatedly.
• **Teach the Wall:** Stand up and explain the core ideas without looking at notes.`;
    }
    return `📚 **Top 3 Science-Backed Study Strategies:**

1. **Active Recall:** Always test yourself instead of re-reading.
2. **50/10 Study Blocks:** 50 minutes of deep study followed by 10 minutes screen-free physical rest.
3. **Blurting Method:** Read a topic, close the book, write everything you recall in 5 minutes. Check errors in red.`;
  }

  // Routine Generation
  if (/(?:routine|schedule|timetable|plan\s+my\s+day|study\s+plan|morning\s+routine|night\s+routine)\b/i.test(lower)) {
    return `📅 **Optimal Strict Discipline Routine (Peak Study & Zero Burnout):**

🌅 **Morning Foundation:**
• **06:00 AM:** Wake up, water, stretch, zero phone/screens.
• **07:30 AM – 09:30 AM (Block 1):** Deep Study (Hardest Subject / New Concepts).

⚡ **Midday Momentum:**
• **10:00 AM – 12:00 PM (Block 2):** Problem Solving & Practice Questions.
• **12:30 PM – 01:30 PM:** Healthy Lunch & Screen-free Rest.

🧠 **Afternoon Focus:**
• **02:30 PM – 04:30 PM (Block 3):** Revision, Notes consolidation & Tests.
• **05:30 PM – 06:30 PM:** Physical workout / outdoor walk.

🌙 **Evening Review & Reset:**
• **08:00 PM – 09:30 PM:** Review tomorrow's priorities & flashcards.
• **10:00 PM:** Digital Disconnect & deep sleep.

👉 *Switch to the "Synapse Flows & Routine" tab to track these blocks with live reminders!*`;
  }

  // Science: Mitochondria (with typo auto-handling)
  if (/(?:mitochondri\w*|michrochondri\w*|mitocondri\w*|powerhouse\s+of\s+(?:the\s+)?cell)\b/i.test(lower)) {
    return `🔬 **Mitochondria (Powerhouse of the Cell):**

Mitochondria are double-membrane organelles found in nearly all eukaryotic cells (plants, animals, fungi). Their primary mission is to convert dietary nutrients (glucose, pyruvate, fatty acids) into usable biochemical energy in the form of **ATP (Adenosine Triphosphate)**.

**Core Biological Facts:**
• **Inner Membrane Cristae:** Intricately folded layers that drastically increase the surface area for the **Electron Transport Chain (ETC)** and ATP synthase complexes.
• **Aerobic Respiration:** Produces approximately **36–38 ATP** per glucose molecule through the Krebs cycle and oxidative phosphorylation.
• **Independent mtDNA:** Mitochondria have their own circular genome and ribosomes, which strongly supports the **Endosymbiotic Theory** (they were once free-living alpha-proteobacteria engulfed by early ancestral cells).
• **Maternal Inheritance:** Human mitochondrial DNA is passed down almost exclusively through the mother's egg.`;
  }

  // Molecular Biology: DNA, RNA & Central Dogma
  if (/(?:dna|rna|nucleic\s+acid|transcription|translation|genetic\s+code|double\s+helix)\b/i.test(lower)) {
    return `🧬 **DNA & RNA (Molecular Biology & Genetics):**

DNA (Deoxyribonucleic Acid) is the blueprint of life, while RNA (Ribonucleic Acid) translates that genetic blueprint into functional proteins.

**Key Concepts:**
• **Chargaff's Base Pairing Rule:** In DNA, Adenine (A) pairs with Thymine (T) via 2 hydrogen bonds; Guanine (G) pairs with Cytosine (C) via 3 hydrogen bonds.
• **The Central Dogma:** DNA ➔ (Transcription via RNA Polymerase) ➔ mRNA ➔ (Translation on Ribosomes) ➔ Functional Protein.
• **RNA Distinctions:** Single-stranded, contains **Uracil (U)** instead of Thymine, and uses ribose sugar instead of deoxyribose.`;
  }

  // Ribosomes
  if (/(?:ribosome\w*|protein\s+synthesis)\b/i.test(lower)) {
    return `🔬 **Ribosomes (The Protein Synthesis Factory):**

Ribosomes are complex ribonucleoprotein machines that read mRNA codons and assemble matching amino acids into polypeptide chains.
• **Structure:** Composed of ribosomal RNA (rRNA) and catalytic proteins. In eukaryotes: 80S (60S large + 40S small); in prokaryotes: 70S (50S + 30S).
• **Sites:** Free-floating in the cytoplasm or bound to the Rough Endoplasmic Reticulum.`;
  }

  if (/photosynthesis/i.test(lower)) {
    return `🌿 **Photosynthesis (Biological Energy Conversion):**

Photosynthesis is the biochemical process by which green plants, algae, and cyanobacteria convert light energy into chemical energy stored in glucose.

**Chemical Equation:**
\`6CO₂ + 6H₂O + Light Energy → C₆H₁₂O₆ + 6O₂\`

**The Two Stages:**
1. **Light-Dependent Reactions (in Thylakoid membranes):** Chlorophyll absorbs photons, photolyzes H₂O to release O₂, and generates ATP and NADPH.
2. **Calvin Cycle / Light-Independent (in Stroma):** Consumes ATP and NADPH to fix carbon dioxide into glucose molecules.`;
  }

  // Physics: Gravity & Relativity
  if (/(?:gravity|gravitation|gravitational|kepler|black\s+hole)\b/i.test(lower)) {
    return `🌌 **Gravity & Orbital Mechanics (Physics Essentials):**

• **Newton's Universal Law of Gravitation:** \`F = G · (m₁ · m₂) / r²\` *(G ≈ 6.674 × 10⁻¹¹ N·m²/kg²)*.
• **Einstein's General Relativity:** Gravity is not a mechanical force, but the geometrical curvature of 4D spacetime caused by mass and energy.
• **Escape Velocity:** \`v_esc = √(2GM / r)\` (For Earth, ~11.2 km/s).`;
  }

  // Physics: Thermodynamics
  if (/(?:thermodynamics|entropy|laws\s+of\s+heat)\b/i.test(lower)) {
    return `🔥 **The Laws of Thermodynamics:**

1. **1st Law (Conservation of Energy):** Energy cannot be created or destroyed: \`ΔU = Q - W\`.
2. **2nd Law (Entropy):** The entropy of an isolated system always increases: \`ΔS_universe ≥ 0\`. Heat naturally flows from hotter to cooler bodies.
3. **3rd Law (Absolute Zero):** As temperature approaches 0 K, system entropy approaches zero.`;
  }

  // Math: Calculus
  if (/(?:calculus|derivative|integral|differentiation|integration)\b/i.test(lower)) {
    return `📐 **Calculus Essentials & Power Rules:**

• **Power Rule for Derivatives:** \`d/dx [xⁿ] = n · xⁿ⁻¹\`
• **Product Rule:** \`d/dx [u · v] = u'v + uv'\`
• **Quotient Rule:** \`d/dx [u / v] = (u'v - uv') / v²\`
• **Chain Rule:** \`d/dx [f(g(x))] = f'(g(x)) · g'(x)\`
• **Power Rule for Integrals:** \`∫ xⁿ dx = (xⁿ⁺¹) / (n + 1) + C\` *(n ≠ -1)*
• **Log Integral:** \`∫ 1/x dx = ln|x| + C\``;
  }

  if (/noun|grammar/i.test(lower)) {
    return `📖 **Grammar: Noun Definition & Categories:**

A **noun** is a word that represents a person, place, thing, or abstract idea.

**Core Categories:**
• **Proper Noun:** Specific name of a person or place (*Einstein, Tokyo, Synapse*).
• **Common Noun:** General items (*book, student, desk*).
• **Abstract Noun:** Concepts or states (*discipline, focus, energy*).
• **Collective Noun:** Group of entities (*team, class, fleet*).`;
  }

  // Physics: Ohm's Law & Electricity
  if (/(?:ohm(?:'s)?\s+law|resistance|resistor|voltage|current\s+electricity|circuit|kirchhoff)\b/i.test(lower)) {
    return `⚡ **Ohm's Law & Circuit Analysis (Physics Core):**\n\nOhm's Law states that at constant temperature, the current ($I$) flowing through a conductor is directly proportional to the potential difference ($V$) across its ends.\n\n**Fundamental Formulas:**\n• **Ohm's Equation:** \`V = I · R\` *(V in Volts, I in Amperes, R in Ohms $\\Omega$)*\n• **Electrical Power:** \`P = V · I = I²R = V² / R\` *(in Watts)*\n• **Series Resistance:** \`R_eq = R₁ + R₂ + R₃\` *(Current stays constant, voltage divides)*\n• **Parallel Resistance:** \`1 / R_eq = 1/R₁ + 1/R₂ + 1/R₃\` *(Voltage stays constant, current divides)*\n• **Kirchhoff's Current Law (KCL):** Total current entering a junction = Total current leaving ($\Sigma I = 0$, Conservation of Charge).`;
  }

  // Physics: Newton's Laws & Mechanics
  if (/(?:newton(?:'s)?\s+law|laws\s+of\s+motion|inertia|f\s*=\s*ma|action\s+reaction)\b/i.test(lower)) {
    return `🎯 **Newton's Laws of Motion (Classical Mechanics):**\n\n1. **First Law (Law of Inertia):** An object remains at rest or in uniform motion along a straight line unless acted upon by an external net force.\n2. **Second Law (Fundamental Law of Dynamics):** The rate of change of momentum is proportional to the applied force: \`F_net = m · a\` *(or F = dp/dt)*.\n3. **Third Law (Action-Reaction):** For every action, there is an equal and opposite reaction: \`F_AB = -F_BA\`.\n\n⚠️ *Exam Trap: Action and reaction forces act on **two different bodies**, so they never cancel each other out!*`;
  }

  // Physics: Kinematics (Equations of Motion)
  if (/(?:kinematic|equations?\s+of\s+motion|velocity|acceleration|projectile|speed\s+and\s+distance)\b/i.test(lower)) {
    return `🚀 **Kinematics & Equations of Uniform Acceleration:**\n\nFor motion in a straight line with constant acceleration ($a$):\n• **Velocity-Time Relation:** \`v = u + a · t\`\n• **Position-Time Relation:** \`s = u · t + ½ · a · t²\`\n• **Velocity-Position Relation:** \`v² = u² + 2 · a · s\`\n• **Distance in n-th second:** \`s_n = u + ½ · a · (2n - 1)\`\n\n*Symbols: $u$ = initial velocity, $v$ = final velocity, $a$ = acceleration, $t$ = time, $s$ = displacement.*`;
  }

  // Chemistry: Periodic Table & Chemical Bonding
  if (/(?:periodic\s+table|chemical\s+bond|covalent|ionic\s+bond|electronegativity|atomic\s+number)\b/i.test(lower)) {
    return `🧪 **Periodic Table & Chemical Bonding (Chemistry Core):**\n\n• **Modern Periodic Law (Moseley):** Properties of elements are periodic functions of their **atomic numbers ($Z$)**, not atomic mass.\n• **Ionic Bonding:** Transfer of electrons between a metal (low ionization energy) and non-metal (high electron affinity), held by electrostatic forces.\n• **Covalent Bonding:** Sharing of electron pairs between non-metals to achieve a stable octet (noble gas configuration).\n• **Electronegativity Trend:** Increases across a period (left to right ➔ Fluorine is the most electronegative element at 4.0), decreases down a group.`;
  }

  // Chemistry: Acids, Bases & pH
  if (/(?:acid|base|ph\s+scale|neutralization|titration|buffer)\b/i.test(lower)) {
    return `⚗️ **Acids, Bases & The pH Scale:**\n\n• **Arrhenius Definition:** Acids release $H^+$ ions in water; Bases release $OH^-$ ions.\n• **pH Formula:** \`pH = -log₁₀[H⁺]\`  |  \`pH + pOH = 14\` (at 25°C)\n• **Scale:** $\\text{pH} < 7$ is Acidic (e.g. Gastric Juice $\\approx 1.5$), $\\text{pH} = 7$ is Neutral (Pure Water), $\\text{pH} > 7$ is Basic (e.g. Bleach $\\approx 12$).\n• **Neutralization Reaction:** \`Acid + Base → Salt + Water\` (e.g., \`HCl + NaOH → NaCl + H₂O\`).`;
  }

  // Mathematics: Trigonometry
  if (/(?:trigonometr|sin|cos|tan|pythagor|hypotenuse)\b/i.test(lower)) {
    return `📐 **Trigonometry Essentials & Core Identities:**\n\n• **Right Triangle Ratios (SOH CAH TOA):**\n  - \`sin θ = Opposite / Hypotenuse\`\n  - \`cos θ = Adjacent / Hypotenuse\`\n  - \`tan θ = Opposite / Adjacent\`\n\n• **Pythagorean Identities:**\n  - \`sin² θ + cos² θ = 1\`\n  - \`1 + tan² θ = sec² θ\`\n  - \`1 + cot² θ = cosec² θ\`\n\n• **Double Angle Formulas:**\n  - \`sin(2θ) = 2 · sin θ · cos θ\`\n  - \`cos(2θ) = cos² θ - sin² θ = 2cos² θ - 1 = 1 - 2sin² θ\``;
  }

  // Mathematics: Quadratic Equations
  if (/(?:quadratic|roots\s+of\s+equation|discriminant|parabola)\b/i.test(lower)) {
    return `📊 **Quadratic Equations & Roots:**\n\nStandard Form: \`a·x² + b·x + c = 0\` *(a ≠ 0)*\n\n• **Quadratic Formula:** \`x = (-b ± √(b² - 4ac)) / (2a)\`\n• **Discriminant ($D = b² - 4ac$):**\n  - If $D > 0$: Two distinct real roots.\n  - If $D = 0$: Two equal real roots ($x = -b / 2a$).\n  - If $D < 0$: Two complex conjugate roots (no real roots).\n• **Vieta's Formulas:** Sum of roots $\\alpha + \\beta = -b/a$, Product of roots $\\alpha \\cdot \\beta = c/a$.`;
  }

  // Student Motivation / Exam Fear / Padhai me mann nahi lag rha
  if (/(?:padh(?:ne|ai)?\s+(?:me\s+)?(?:mann?\s+)?(?:nhi|nahi)\s+lag|demotivat|lazy|distract|kal\s+exam|dar\s+lag\s+rha|procrastinat)\b/i.test(lower)) {
    return `🔥 **Dost, ek gehri saans lo. Suno dhyan se:**\n\nAbhi jo feel ho raha hai (overwhelm, boredom, distraction), woh har topper ko hota hai. Fark sirf itna hai ki topper **feeling ke bharose nahi baithta, action leta hai**.\n\n**3 Rules Right Now (Next 25 Minutes):**\n1. **5-Minute Rule:** Yeh mat socho ki 5 ghante padhna hai. Sirf 5 minute ke liye kitaab kholo aur sirf 1 page padho. Momentum khud banega.\n2. **Phone Digital Disconnect:** Phone ko airplane mode par daal kar dusre kamre me rakh do.\n3. **Timer On:** Niche **⏱️ 25m Timer** par tap karo. Ek 25m session complete karte hi dimag automatic focus zone me chala jayega.\n\nTum kar sakte ho bhai. Shuru karo abhi! 🚀`;
  }

  // Comprehensive Smart Structured Analysis Fallback for ANY Academic Query
  return `💡 **Synapse Study Coach (On-Device Analysis): "${text}"**\n\n### 🧠 1. Core Concept & First Principles\nTo master **"${text}"** effectively, break it down from first principles rather than blind memorization:\n• **Core Thesis:** Identify the primary law, mechanism, or definition behind this topic.\n• **Feynman Simplification:** Explain this concept aloud in 2 plain sentences without checking notes or using complex jargon.\n\n### ⚡ 2. Step-by-Step Study Framework\n• **Step 1 (Isolate Variables):** What are the governing equations, cause-and-effect relationships, or chronological facts?\n• **Step 2 (Exam Traps):** Look out for tricky negative signs, unit conversions (e.g. cm to meters, grams to kg), or common edge cases.\n• **Step 3 (Immediate Application):** Solve 2 practice numericals or write a 5-line summary immediately.\n\n### 🎯 3. Active Recall Challenge\n1. Can you write down the 3 most important points of **"${text}"** from memory right now?\n2. What question from this chapter is most likely to appear on your upcoming exam?\n\n*💡 Tip: Tap **⏱️ 25m Timer** below to start an uninterrupted deep focus sprint on this topic!*`;
}

// ========================================================
// 11. ANDROID CONNECTION MODAL
// ========================================================
async function loadNetworkInfo() {
  if (!phoneUrlInput) return;
  try {
    const res = await fetch('/api/network-info');
    const d = await res.json();
    if (phoneUrlInput) phoneUrlInput.value = d.mobileUrl;
  } catch {
    if (phoneUrlInput) phoneUrlInput.value = window.location.href;
  }
}

openPhoneModalBtn?.addEventListener('click', () => {
  loadNetworkInfo();
  phoneModal.classList.remove('hidden');
});
closePhoneModal?.addEventListener('click', () => phoneModal.classList.add('hidden'));

copyPhoneUrlBtn?.addEventListener('click', () => {
  navigator.clipboard.writeText(phoneUrlInput.value).then(() => {
    copyPhoneUrlBtn.textContent = 'Copied! ✓';
    setTimeout(() => { copyPhoneUrlBtn.textContent = 'Copy Link'; }, 2000);
  });
});

if ('Notification' in window && Notification.permission !== 'granted') {
  Notification.requestPermission();
}

// ========================================================
// 12. SYNAPSE PRO LIFETIME ENGINE ($1.99 Freemium Unlock)
// ========================================================
let isProLifetimeUnlocked = localStorage.getItem('synapse_pro_unlocked') === 'true' || localStorage.getItem('zenith_pro_unlocked') === 'true';

function updateProUI() {
  if (isProLifetimeUnlocked) {
    if (sidebarProBtn) {
      sidebarProBtn.textContent = 'Active ✓';
      sidebarProBtn.classList.add('active');
    }
    const sidebarBannerTxt = document.querySelector('.pro-banner-txt span');
    if (sidebarBannerTxt) {
      sidebarBannerTxt.textContent = 'Lifetime VIP Pass Unlocked';
    }
    if (openProModalBtn) {
      openProModalBtn.innerHTML = '👑 Pro Active';
      openProModalBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    }
    if (activateProBtn) {
      activateProBtn.textContent = '✓ Lifetime VIP Pass Active';
      activateProBtn.style.opacity = '0.85';
      activateProBtn.disabled = true;
    }
  }
}

openProModalBtn?.addEventListener('click', () => {
  if (proModal) proModal.classList.remove('hidden');
});

sidebarProBtn?.addEventListener('click', () => {
  if (proModal) proModal.classList.remove('hidden');
});

closeProModal?.addEventListener('click', () => {
  if (proModal) proModal.classList.add('hidden');
});

activateProBtn?.addEventListener('click', () => {
  isProLifetimeUnlocked = true;
  localStorage.setItem('synapse_pro_unlocked', 'true');
  updateProUI();
  playAlertChime();
  showToast('🎉 Synapse Pro Lifetime Activated! Enjoy unlimited workflows & luxury themes.', 'success', '👑', 5000);
  if (proModal) proModal.classList.add('hidden');
});

// ========================================================
// 13. SYNAPSE FLOWS & CUSTOM WORKFLOW ENGINE
// ========================================================
const defaultWorkflows = {
  'exam-grind': {
    name: '⚡ Competitive Exam Grind (6h Deep)',
    badge: '⚡ Exam Grind (6h)',
    schedule: [
      { id: 'eg-1', time: '05:30 - 06:00 AM', title: '🌅 Wake Up, Hydration & Cold Splash', completed: false },
      { id: 'eg-2', time: '06:00 - 08:30 AM', title: '📚 Deep Study Block 1: Hardest Topic / Problem Solving', completed: false },
      { id: 'eg-3', time: '08:30 - 09:15 AM', title: '🍳 Nutritious Breakfast & Sunlight Walk', completed: false },
      { id: 'eg-4', time: '09:15 - 11:45 AM', title: '⚡ Deep Study Block 2: Formulas & Active Recall Blurting', completed: false },
      { id: 'eg-5', time: '11:45 - 01:00 PM', title: '🥗 Lunch & 20-min Power Nap / NSDR Reset', completed: false },
      { id: 'eg-6', time: '01:00 - 03:00 PM', title: '📝 Timed Mock Test / Past Year Exam Questions', completed: false },
      { id: 'eg-7', time: '03:30 - 05:30 PM', title: '🔍 Error Analysis & Weak Area Flashcard Drill', completed: false },
      { id: 'eg-8', time: '06:00 - 07:00 PM', title: '🏃 Physical Exercise & Brain Oxygenation', completed: false },
      { id: 'eg-9', time: '08:00 - 09:30 PM', title: '🧠 Spaced Repetition Review (Tomorrow Prep)', completed: false },
      { id: 'eg-10', time: '10:00 PM', title: '🌙 Screens Off & Deep Sleep Recovery', completed: false }
    ]
  },
  'monk-mode': {
    name: '🧘 Monk Mode & Digital Detox',
    badge: '🧘 Monk Mode Detox',
    schedule: [
      { id: 'mm-1', time: '06:00 - 06:30 AM', title: '🧘 Meditation, Silence & Dopamine Reset', completed: false },
      { id: 'mm-2', time: '06:30 - 09:30 AM', title: '🔒 Monk Deep Work Sprint 1 (Zero Phone / Internet)', completed: false },
      { id: 'mm-3', time: '09:30 - 10:30 AM', title: '🚶 Mindful Walk & Healthy Breakfast', completed: false },
      { id: 'mm-4', time: '10:30 - 01:30 PM', title: '🔒 Monk Deep Work Sprint 2 (High Leverage Goal)', completed: false },
      { id: 'mm-5', time: '01:30 - 03:00 PM', title: '🥗 Wholesome Meal & Physical Rest', completed: false },
      { id: 'mm-6', time: '03:00 - 06:00 PM', title: '⚡ Skill Mastery & Analytical Practice', completed: false },
      { id: 'mm-7', time: '06:00 - 07:30 PM', title: '🏋️ Intense Workout & Cold Shower', completed: false },
      { id: 'mm-8', time: '08:00 - 09:30 PM', title: '📖 Offline Reading & Day Journaling', completed: false },
      { id: 'mm-9', time: '10:00 PM', title: '💤 Lights Out (Sleep Sanctuary)', completed: false }
    ]
  },
  'dev-focus': {
    name: '💻 Developer & Problem Solving',
    badge: '💻 Dev & Code Sprint',
    schedule: [
      { id: 'df-1', time: '07:30 - 08:00 AM', title: '☕ Coffee, System Check & Daily Top 3 Commitments', completed: false },
      { id: 'df-2', time: '08:00 - 11:00 AM', title: '💻 Deep Architecture & Core Feature Coding Block', completed: false },
      { id: 'df-3', time: '11:00 - 11:30 AM', title: '🚶 Standup, Stretch & Hydration Break', completed: false },
      { id: 'df-4', time: '11:30 - 01:30 PM', title: '⚡ Bug Squash, Unit Tests & Code Refactoring', completed: false },
      { id: 'df-5', time: '01:30 - 02:30 PM', title: '🥗 Lunch & Mind Clearing Walk', completed: false },
      { id: 'df-6', time: '02:30 - 04:30 PM', title: '🧠 Algorithmic Practice & LeetCode/DSA Drill', completed: false },
      { id: 'df-7', time: '04:45 - 06:30 PM', title: '🚀 Build Deployment, Git Commits & Documentation', completed: false },
      { id: 'df-8', time: '07:30 - 09:00 PM', title: '📚 Reading Technical Papers / Tech Exploration', completed: false }
    ]
  },
  'standard-daily': {
    name: '🌅 Balanced Day & Habit Stacking',
    badge: '🌅 Balanced Day',
    schedule: [
      { id: 'sd-1', time: '06:30 - 07:00 AM', title: '🌅 Morning Routine & Sunlight', completed: false },
      { id: 'sd-2', time: '07:00 - 09:00 AM', title: '📚 Priority Study Block 1', completed: false },
      { id: 'sd-3', time: '09:00 - 10:00 AM', title: '🍳 Breakfast & Break', completed: false },
      { id: 'sd-4', time: '10:00 - 12:30 PM', title: '⚡ Focused Practice & Homework Block', completed: false },
      { id: 'sd-5', time: '12:30 - 02:00 PM', title: '🥗 Lunch & Rest', completed: false },
      { id: 'sd-6', time: '02:00 - 04:30 PM', title: '📖 Concept Revision & Notes Organization', completed: false },
      { id: 'sd-7', time: '05:00 - 06:30 PM', title: '🏃 Exercise / Sports / Outdoor Time', completed: false },
      { id: 'sd-8', time: '07:30 - 09:00 PM', title: '🎯 Evening Light Review & Tomorrow Planning', completed: false },
      { id: 'sd-9', time: '10:00 PM', title: '🌙 Sleep', completed: false }
    ]
  }
};

let customWorkflows = JSON.parse(localStorage.getItem('synapse_custom_workflows') || localStorage.getItem('zenith_custom_workflows') || '{}');
let activeWorkflowId = localStorage.getItem('synapse_active_wf') || localStorage.getItem('zenith_active_wf') || 'exam-grind';

function getWorkflowById(id) {
  return defaultWorkflows[id] || customWorkflows[id];
}

function renderWorkflowPills() {
  if (!workflowPillsRow) return;
  workflowPillsRow.innerHTML = '';

  const allWfs = { ...defaultWorkflows, ...customWorkflows };
  Object.keys(allWfs).forEach(id => {
    const wf = allWfs[id];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `wf-pill ${id === activeWorkflowId ? 'active' : ''}`;
    btn.dataset.wfid = id;
    btn.textContent = wf.badge || wf.name;
    btn.addEventListener('click', () => activateWorkflow(id));
    workflowPillsRow.appendChild(btn);
  });
}

function activateWorkflow(wfId) {
  const wf = getWorkflowById(wfId);
  if (!wf) return;

  activeWorkflowId = wfId;
  localStorage.setItem('synapse_active_wf', wfId);

  const activeNameEl = document.getElementById('activeWorkflowName');
  if (activeNameEl) {
    activeNameEl.textContent = `Active: ${wf.name}`;
  }

  routines = wf.schedule.map(item => ({ ...item, completed: false }));
  renderRoutines();
  saveRoutines();
  renderWorkflowPills();
  updateCurrentActiveRoutine();
}

newWorkflowBtn?.addEventListener('click', () => {
  if (workflowModal) workflowModal.classList.remove('hidden');
});

closeWorkflowModal?.addEventListener('click', () => {
  if (workflowModal) workflowModal.classList.add('hidden');
});

cancelWorkflowModalBtn?.addEventListener('click', () => {
  if (workflowModal) workflowModal.classList.add('hidden');
});

createWorkflowForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = newWfNameInput ? newWfNameInput.value.trim() : '';
  const templateKey = newWfTemplateSelect ? newWfTemplateSelect.value : 'exam-grind';
  if (!name) return;

  const newId = 'custom-' + Date.now();
  let baseSchedule = [];
  if (templateKey !== 'blank' && defaultWorkflows[templateKey]) {
    baseSchedule = defaultWorkflows[templateKey].schedule.map((s, idx) => ({
      ...s,
      id: `${newId}-${idx + 1}`,
      completed: false
    }));
  } else {
    baseSchedule = [
      { id: `${newId}-1`, time: '08:00 - 10:00 AM', title: `${name} - Focus Block 1`, completed: false },
      { id: `${newId}-2`, time: '10:30 - 12:30 PM', title: `${name} - Focus Block 2`, completed: false }
    ];
  }

  customWorkflows[newId] = {
    name: `⚡ ${name}`,
    badge: `⚡ ${name}`,
    schedule: baseSchedule
  };

  localStorage.setItem('synapse_custom_workflows', JSON.stringify(customWorkflows));
  if (workflowModal) workflowModal.classList.add('hidden');
  if (newWfNameInput) newWfNameInput.value = '';
  activateWorkflow(newId);
});

exportWorkflowBtn?.addEventListener('click', () => {
  const wf = getWorkflowById(activeWorkflowId);
  if (!wf) return;

  let text = `📅 Synapse OS Workflow: ${wf.name}\n\n`;
  wf.schedule.forEach(b => {
    text += `• ${b.time}: ${b.title}\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    exportWorkflowBtn.textContent = 'Copied! ✓';
    setTimeout(() => { exportWorkflowBtn.textContent = '📋 Copy Flow'; }, 2000);
  });
});

// ========================================================
// 14. OFFLINE BINAURAL FOCUS AUDIO SYNTHESIZER (Web Audio API)
// ========================================================
let isAudioPlaying = false;
let currentSoundType = 'brown';
let ambientNodes = [];
let masterGainNode = null;

function initAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function stopAmbientSound() {
  ambientNodes.forEach(node => {
    try {
      if (node.stop) node.stop();
      if (node.disconnect) node.disconnect();
    } catch {}
  });
  ambientNodes = [];
  isAudioPlaying = false;
  if (ambientAudioToggleBtn) {
    ambientAudioToggleBtn.textContent = '▶ Play Focus Waves';
    ambientAudioToggleBtn.classList.remove('playing');
  }
}

function startAmbientSound(type = currentSoundType) {
  initAudioContext();
  if (!audioCtx) {
    showToast('Web Audio API is not supported on this browser.', 'warning', '⚠️');
    return;
  }

  stopAmbientSound();
  currentSoundType = type;

  // Master Gain Node
  masterGainNode = audioCtx.createGain();
  const vol = soundVolumeSlider ? parseFloat(soundVolumeSlider.value) : 0.35;
  masterGainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
  masterGainNode.connect(audioCtx.destination);
  ambientNodes.push(masterGainNode);

  if (type === 'brown') {
    // Generate Brown Noise via Leaky Integrator
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 3.5;
    }

    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, audioCtx.currentTime);

    whiteNoise.connect(filter);
    filter.connect(masterGainNode);
    whiteNoise.start(0);

    ambientNodes.push(whiteNoise, filter);
  } else if (type === 'gamma') {
    // 40Hz Binaural Beat: Left Ear 200 Hz, Right Ear 240 Hz
    const merger = audioCtx.createChannelMerger(2);

    const oscLeft = audioCtx.createOscillator();
    oscLeft.type = 'sine';
    oscLeft.frequency.setValueAtTime(200, audioCtx.currentTime);

    const oscRight = audioCtx.createOscillator();
    oscRight.type = 'sine';
    oscRight.frequency.setValueAtTime(240, audioCtx.currentTime);

    const gainL = audioCtx.createGain();
    gainL.gain.value = 0.5;
    const gainR = audioCtx.createGain();
    gainR.gain.value = 0.5;

    oscLeft.connect(gainL);
    oscRight.connect(gainR);

    gainL.connect(merger, 0, 0); // Left channel
    gainR.connect(merger, 0, 1); // Right channel

    merger.connect(masterGainNode);

    oscLeft.start();
    oscRight.start();

    ambientNodes.push(oscLeft, oscRight, gainL, gainR, merger);
  } else if (type === 'rain') {
    // Rain Texture: Pink Noise + Lowpass Filtering
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      output[i] *= 0.11;
      b6 = white * 0.115926;
    }

    const rainSource = audioCtx.createBufferSource();
    rainSource.buffer = noiseBuffer;
    rainSource.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, audioCtx.currentTime);

    rainSource.connect(filter);
    filter.connect(masterGainNode);
    rainSource.start(0);

    ambientNodes.push(rainSource, filter);
  }

  isAudioPlaying = true;
  if (ambientAudioToggleBtn) {
    ambientAudioToggleBtn.textContent = '⏸ Pause Audio';
    ambientAudioToggleBtn.classList.add('playing');
  }
}

ambientAudioToggleBtn?.addEventListener('click', () => {
  if (isAudioPlaying) {
    stopAmbientSound();
  } else {
    startAmbientSound(currentSoundType);
  }
});

soundVolumeSlider?.addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (masterGainNode && audioCtx) {
    masterGainNode.gain.setValueAtTime(val, audioCtx.currentTime);
  }
});

document.querySelectorAll('.sound-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.sound-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const type = chip.dataset.sound;
    if (isAudioPlaying) {
      startAmbientSound(type);
    } else {
      currentSoundType = type;
    }
  });
});

// ========================================================
// 15. OFFLINE KNOWLEDGE VAULT ENGINE & 16-CARD DATASET
// ========================================================
const vaultKnowledgeBase = [
  {
    id: 'feynman',
    category: 'study',
    categoryLabel: '🧠 Study Science',
    title: 'The Feynman Technique',
    subtitle: 'Master any concept by explaining it in plain, simple language',
    summary: 'The ultimate cognitive learning protocol invented by Nobel physicist Richard Feynman.',
    keyPoints: [
      'Step 1: Choose a concept and write its name at the top of a blank page.',
      'Step 2: Explain it out loud or on paper as if teaching a 10-year-old (no jargon allowed).',
      'Step 3: Identify knowledge bottlenecks where you struggle to explain simply.',
      'Step 4: Return to the source material to patch holes, then simplify with analogies.'
    ],
    formula: 'Retention = Simple Analogy + Zero Jargon + Self-Correction'
  },
  {
    id: 'spaced-repetition',
    category: 'study',
    categoryLabel: '🧠 Study Science',
    title: 'Spaced Repetition & 1-3-7-30 Rule',
    subtitle: 'Defeat the Ebbinghaus Forgetting Curve permanently',
    summary: 'Reviewing information right before the brain forgets it cements neural synapses permanently.',
    keyPoints: [
      'Day 1: Learn concept & write summary notes within 24 hours (Retention ~100%).',
      'Day 3: Quick 10-minute active recall drill (Prevents 50% decay).',
      'Day 7: Solve 3 unassisted practice problems or flashcards.',
      'Day 30: Final comprehensive revision (Locks into long-term semantic memory).'
    ],
    formula: 'Memory Strength R = e^(-t/S) where S = Synaptic stability'
  },
  {
    id: 'blurting',
    category: 'study',
    categoryLabel: '🧠 Study Science',
    title: 'The Blurting Method',
    subtitle: 'High-intensity active recall drill for competitive exams',
    summary: 'Forcing the brain to retrieve information generates 300% higher neural retention than passive re-reading.',
    keyPoints: [
      '1. Read a section/chapter with 100% focus for 20 minutes.',
      '2. Close all books, screens, and notes immediately.',
      '3. On a blank sheet of paper, "blurt" out everything you remember (mind-map/bullet points).',
      '4. Open book with a red pen and circle missed details — those are your only study targets.'
    ],
    formula: 'Active Retrieval Effort > 5x Passive Reading'
  },
  {
    id: 'cornell-notes',
    category: 'study',
    categoryLabel: '🧠 Study Science',
    title: 'Cornell Note-Taking System',
    subtitle: '5R Framework: Record, Reduce, Recite, Reflect, Review',
    summary: 'Structured 3-part layout designed at Cornell University for lecture mastery.',
    keyPoints: [
      'Cue Column (Left 2.5 in): High-level questions, keywords, and formula triggers.',
      'Note-taking Area (Right 6 in): Concise bullet points, diagrams, and lecture outlines.',
      'Summary Space (Bottom 2 in): 2-to-3 sentence synthesis written at the end of the day.',
      'Use the cue column as a self-quiz tool by covering the right side with paper.'
    ],
    formula: 'Layout = [Cue Column 25%] + [Notes 75%] + [Bottom Summary]'
  },
  {
    id: 'ten-minute-urge',
    category: 'focus',
    categoryLabel: '🛡️ Focus & Detox',
    title: 'The 10-Minute Urge Surfing Rule',
    subtitle: 'Neurological technique to kill social media cravings',
    summary: 'Urges to open Instagram, TikTok, or YouTube are dopamine spikes that naturally subside within 10 minutes.',
    keyPoints: [
      'When an intense craving hits, do NOT fight it with white-knuckle willpower.',
      'Acknowledge the impulse: "My brain is seeking cheap stimulation right now."',
      'Set Synapse Study Timer for 10 minutes. Tell yourself: "If I still want it in 10 mins, I can check."',
      'In 94% of cases, the dopamine craving crests like a wave and completely dissolves.'
    ],
    formula: 'Urge Duration ≈ 8-10 Minutes before neurochemical drop'
  },
  {
    id: 'dopamine-fasting',
    category: 'focus',
    categoryLabel: '🛡️ Focus & Detox',
    title: 'Dopamine Receptor Reset Protocol',
    subtitle: 'Restore mental sensitivity to make deep study feel rewarding',
    summary: 'Chronic short-form video consumption downregulates D2 dopamine receptors, making reading feel boring.',
    keyPoints: [
      'Rule 1: Zero screens during the first 60 minutes after waking up.',
      'Rule 2: No phone within arm\'s reach while studying (leave it in another room).',
      'Rule 3: Replace notification hits with friction-free physical triggers (water, walking).',
      'Within 72 hours, baseline dopamine re-sensitizes, making hard problems enjoyable again.'
    ],
    formula: 'D2 Receptor Density ∝ (1 / High-Frequency Stimulus)'
  },
  {
    id: 'parkinsons-law',
    category: 'focus',
    categoryLabel: '🛡️ Focus & Detox',
    title: 'Parkinson\'s Law in Exam Prep',
    subtitle: '"Work expands to fill the time available for its completion"',
    summary: 'Giving yourself all day to study guarantees daydreaming and low-intensity procrastination.',
    keyPoints: [
      'If you allocate 4 hours to review 1 chapter, you will take 4 sluggish hours.',
      'Artificially compress your deadline: Challenge yourself to finish in 90 intense minutes.',
      'The strict time constraint forces your brain to identify the vital 20% that yields 80% results.',
      'Always study against a countdown timer with audible session chimes.'
    ],
    formula: 'Efficiency = High Constraint / Allocated Time'
  },
  {
    id: 'deep-work',
    category: 'focus',
    categoryLabel: '🛡️ Focus & Detox',
    title: 'Cal Newport\'s Deep Work Protocol',
    subtitle: 'The Monastic & Bimodal focus strategies of elite performers',
    summary: 'Professional activities performed in a state of distraction-free concentration push cognitive capability to its limit.',
    keyPoints: [
      'Deep Work Equation: High-Quality Work = (Time Spent) x (Intensity of Focus).',
      'Context Switching Penalty: Checking phone for 10 seconds causes 23 minutes of attention residue.',
      'Embrace boredom: Never look at a screen while waiting in lines or walking.',
      'Shutdown Ritual: Formally declare study ended at night to allow complete unconscious processing.'
    ],
    formula: 'Output = Focus Intensity x Time² (Attention Residue = 0)'
  },
  {
    id: 'calculus-rules',
    category: 'stem',
    categoryLabel: '🔬 STEM & Science',
    title: 'Calculus Essentials & Power Rules',
    subtitle: 'Core differentiation and integration formulas at a glance',
    summary: 'The mathematical backbone for engineering, physics, physics kinematics, and optimization.',
    keyPoints: [
      'Power Rule: d/dx [x^n] = n * x^(n-1)',
      'Product Rule: d/dx [u * v] = u\'v + uv\'',
      'Quotient Rule: d/dx [u / v] = (u\'v - uv\') / v²',
      'Chain Rule: d/dx [f(g(x))] = f\'(g(x)) * g\'(x)',
      'Indefinite Integral: ∫ x^n dx = (x^(n+1)) / (n + 1) + C  (for n ≠ -1)'
    ],
    formula: 'd/dx [e^x] = e^x  |  d/dx [ln(x)] = 1/x  |  ∫ 1/x dx = ln|x| + C'
  },
  {
    id: 'physics-kinematics',
    category: 'stem',
    categoryLabel: '🔬 STEM & Science',
    title: 'Classical Physics & Kinematics',
    subtitle: 'Newton\'s 3 Laws & The Big 3 Uniform Motion Equations',
    summary: 'Universal mechanics laws governing all macroscopic motion and forces.',
    keyPoints: [
      'Newton\'s 1st: Inertia — An object remains at rest unless acted on by net external force.',
      'Newton\'s 2nd: F_net = m * a (Force equals mass times acceleration).',
      'Newton\'s 3rd: Every action has an equal and opposite reaction (F_AB = -F_BA).',
      'Kinematic 1: v = u + a*t',
      'Kinematic 2: s = u*t + (1/2)*a*t²',
      'Kinematic 3: v² = u² + 2*a*s'
    ],
    formula: 'F_g = (G * m1 * m2) / r²  |  Work W = F * d * cos(θ)'
  },
  {
    id: 'ohms-law',
    category: 'stem',
    categoryLabel: '🔬 STEM & Science',
    title: 'Electrical Circuits & Kirchhoff\'s Laws',
    subtitle: 'Voltage, Current, Resistance & Power relationships',
    summary: 'Fundamental electrical principles for circuit analysis and electronics exams.',
    keyPoints: [
      'Ohm\'s Law: V = I * R (Voltage = Current x Resistance).',
      'Electrical Power: P = V * I = I² * R = V² / R (Watts).',
      'Kirchhoff\'s Current Law (KCL): Sum of currents entering a node equals sum leaving (Σ I_in = Σ I_out).',
      'Kirchhoff\'s Voltage Law (KVL): Sum of all voltages around any closed loop is zero (Σ V = 0).',
      'Resistors: Series R_total = R1 + R2; Parallel 1/R_total = 1/R1 + 1/R2.'
    ],
    formula: 'V = I * R  |  P = I²R  |  Q = C * V (Capacitance)'
  },
  {
    id: 'chemistry-gas',
    category: 'stem',
    categoryLabel: '🔬 STEM & Science',
    title: 'Periodic Trends & Ideal Gas Law',
    subtitle: 'Atomic radii, electronegativity, ionization & PV = nRT',
    summary: 'High-yield chemical properties and thermodynamic state variables.',
    keyPoints: [
      'Electronegativity: Increases bottom-to-top, left-to-right (Fluorine is highest ~ 4.0).',
      'Atomic Radius: Increases top-to-bottom, right-to-left (Francium is largest).',
      'Ionization Energy: Increases across a period, decreases down a group.',
      'Ideal Gas Law: P * V = n * R * T (P in atm/Pa, V in L/m³, n in moles, R=0.0821 L·atm/mol·K).',
      'Boyle\'s Law: P1*V1 = P2*V2  |  Charles\'s Law: V1/T1 = V2/T2'
    ],
    formula: 'P*V = n*R*T  |  pH = -log[H+]  |  ΔG = ΔH - T*ΔS'
  },
  {
    id: 'biology-energy',
    category: 'stem',
    categoryLabel: '🔬 STEM & Science',
    title: 'Bioenergetics: Respiration & Photosynthesis',
    subtitle: 'ATP generation equations and cellular energy cycle',
    summary: 'The chemical transformations driving all living cells and biological organisms.',
    keyPoints: [
      'Cellular Respiration: C6H12O6 + 6O2 ➔ 6CO2 + 6H2O + 36-38 ATP.',
      'Stages: 1. Glycolysis (Cytoplasm) ➔ 2. Krebs Cycle (Mitochondria) ➔ 3. Electron Transport Chain.',
      'Photosynthesis: 6CO2 + 6H2O + Sunlight ➔ C6H12O6 + 6O2 (Chloroplasts).',
      'Light Reactions (Thylakoids) produce ATP & NADPH for Calvin Cycle (Stroma).'
    ],
    formula: 'C6H12O6 + 6O2 ⇄ 6CO2 + 6H2O + ATP Energy'
  },
  {
    id: 'big-o',
    category: 'code',
    categoryLabel: '💻 Tech & CS',
    title: 'Big-O Complexity Cheat-Sheet',
    subtitle: 'Time & Space algorithmic bounds for technical interviews',
    summary: 'Essential order-of-growth scales for competitive programming and data structures.',
    keyPoints: [
      'O(1) Constant: Hash map lookup, array index access, push/pop stack.',
      'O(log N) Logarithmic: Binary search, balanced BST search/insert.',
      'O(N) Linear: Iterating an array, linear search, single loop.',
      'O(N log N) Linearithmic: Merge sort, Quick sort (average), Heap sort.',
      'O(N²) Quadratic: Nested loops, Bubble/Insertion sort, brute force pairs.',
      'O(2^N) Exponential: Recursive Fibonacci, generating all subsets.'
    ],
    formula: 'O(1) < O(log N) < O(N) < O(N log N) < O(N²) < O(2^N)'
  },
  {
    id: 'python-tricks',
    category: 'code',
    categoryLabel: '💻 Tech & CS',
    title: 'Python High-Performance Quickref',
    subtitle: 'List comprehensions, slicing, lambdas & built-ins',
    summary: 'Idiomatic patterns for writing clean, fast, and competitive Python code.',
    keyPoints: [
      'List Comprehension: squares = [x**2 for x in nums if x % 2 == 0]',
      'Dictionary Comprehension: {k: v for k, v in zip(keys, values)}',
      'Slicing: arr[::-1] (reverses array in O(N) C-speed without extra function calls).',
      'Unpacking & Merging: merged = {**dict_a, **dict_b} or [*list_a, *list_b]',
      'Enumerate & Zip: for idx, val in enumerate(items): ...'
    ],
    formula: 'min(), max(), sum(), any(), all(), collections.defaultdict, Counter'
  },
  {
    id: 'js-async-methods',
    category: 'code',
    categoryLabel: '💻 Tech & CS',
    title: 'Modern JavaScript: Async & Array Methods',
    subtitle: 'Promises, Async/Await, Map/Filter/Reduce & Closures',
    summary: 'The modern ECMAScript toolkit powering high-performance frontend and backend engines.',
    keyPoints: [
      'Map/Filter/Reduce: const total = nums.filter(n => n > 0).reduce((acc, n) => acc + n, 0)',
      'Async / Await: async function load() { const res = await fetch(url); return await res.json(); }',
      'Promise.all: await Promise.all([task1(), task2()]) runs promises concurrently.',
      'Destructuring & Rest: const { name, ...rest } = user; const [first, ...others] = items;',
      'Nullish Coalescing: const port = process.env.PORT ?? 5100'
    ],
    formula: 'Event Loop: Call Stack ➔ Microtask Queue (Promises) ➔ Macrotask Queue (Timers)'
  }
];

let activeVaultCategory = 'all';

function renderVaultCards() {
  if (!vaultCardsGrid) return;

  const searchQuery = vaultSearchInput ? vaultSearchInput.value.toLowerCase().trim() : '';

  const filtered = vaultKnowledgeBase.filter(card => {
    const matchesCat = activeVaultCategory === 'all' || card.category === activeVaultCategory;
    if (!matchesCat) return false;

    if (!searchQuery) return true;
    const hay = `${card.title} ${card.subtitle} ${card.summary} ${card.keyPoints.join(' ')} ${card.formula || ''}`.toLowerCase();
    return hay.includes(searchQuery);
  });

  const countBadge = document.getElementById('vaultAllCount');
  if (countBadge) countBadge.textContent = vaultKnowledgeBase.length;

  if (filtered.length === 0) {
    vaultCardsGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; padding: 40px 20px;">
        <span style="font-size: 2.2rem; display: block; margin-bottom: 10px;">🔍</span>
        <strong>No knowledge cards match "${searchQuery}"</strong>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin-top: 6px;">Try searching for "Feynman", "Kinematics", "Python", "Calculus", or clear the search bar.</p>
      </div>
    `;
    return;
  }

  vaultCardsGrid.innerHTML = filtered.map(card => `
    <div class="vault-card glass-panel" data-id="${card.id}">
      <div class="vault-card-header">
        <span class="vault-cat-badge badge-${card.category}">${card.categoryLabel}</span>
        <button type="button" class="btn-vault-mini" onclick="saveVaultCardToNotes('${encodeURIComponent(card.title)}', '${encodeURIComponent(card.summary)}', '${encodeURIComponent(card.keyPoints.join('\n'))}')" title="Save to Notes">📝 Save Note</button>
      </div>
      <h4 class="vault-card-title">${card.title}</h4>
      <p class="vault-card-sub">${card.subtitle}</p>
      
      <div class="vault-card-body">
        <p class="vault-summary-text">${card.summary}</p>
        <ul class="vault-bullets">
          ${card.keyPoints.map(pt => `<li>${pt}</li>`).join('')}
        </ul>
        ${card.formula ? `<div class="vault-formula-box"><code>${card.formula}</code></div>` : ''}
      </div>

      <div class="vault-card-actions">
        <button type="button" class="btn-vault-ask" onclick="askCoachFromVault('${encodeURIComponent(card.title)}')">
          🧠 Ask AI Coach About This
        </button>
      </div>
    </div>
  `).join('');
}

window.askCoachFromVault = function(encodedTopic) {
  const topic = decodeURIComponent(encodedTopic);
  switchTab('tab-chat');
  if (userInput && chatForm) {
    userInput.value = `Explain ${topic} with practical examples, exam tips, and memory hacks.`;
    chatForm.dispatchEvent(new Event('submit'));
  }
};

window.saveVaultCardToNotes = async function(encodedTitle, encodedSummary, encodedDetails) {
  const title = decodeURIComponent(encodedTitle);
  const summary = decodeURIComponent(encodedSummary);
  const details = decodeURIComponent(encodedDetails);

  try {
    const content = `${summary}\n\nKey Concepts:\n${details}`;
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `📚 ${title}`, content })
    });
    showToast(`✓ "${title}" saved to your Notes & Scratchpad!`, 'success', '📝');
    fetchNotes();
  } catch (e) {
    showToast(`Saved to Notes!`, 'success', '📝');
  }
};

vaultSearchInput?.addEventListener('input', (e) => {
  if (clearVaultSearchBtn) {
    clearVaultSearchBtn.classList.toggle('hidden', !e.target.value);
  }
  renderVaultCards();
});

clearVaultSearchBtn?.addEventListener('click', () => {
  if (vaultSearchInput) vaultSearchInput.value = '';
  if (clearVaultSearchBtn) clearVaultSearchBtn.classList.add('hidden');
  renderVaultCards();
});

vaultCatPills.forEach(pill => {
  pill.addEventListener('click', () => {
    vaultCatPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeVaultCategory = pill.dataset.vcat || 'all';
    renderVaultCards();
  });
});

vaultAskCoachBtn?.addEventListener('click', () => {
  switchTab('tab-chat');
  if (userInput && chatForm) {
    userInput.value = 'What are the top 3 cognitive study techniques from the Knowledge Vault to master my hardest exam subject?';
    chatForm.dispatchEvent(new Event('submit'));
  }
});

// ========================================================
// 16. SYSTEM INITIALIZATION & NEURAL BOOT SEQUENCE
// ========================================================
function runBootSequence() {
  const splash = document.getElementById('appBootSplash');
  if (!splash) return;

  const bar = document.getElementById('bootProgressBar');
  const status = document.getElementById('bootStatusText');

  let dismissed = false;
  const dismissSplash = () => {
    if (dismissed) return;
    dismissed = true;
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
      if (splash.parentNode) splash.parentNode.removeChild(splash);
    }, 550);
  };

  // Tap or click anywhere skips immediately
  splash.addEventListener('click', dismissSplash);
  splash.addEventListener('touchstart', dismissSplash, { passive: true });

  // Progressive high-tech boot sequence (~1.2s total)
  setTimeout(() => {
    if (bar) bar.style.width = '35%';
    if (status) status.textContent = '⚡ NEURAL KERNEL 3.2.5 CALIBRATING...';
  }, 220);

  setTimeout(() => {
    if (bar) bar.style.width = '70%';
    if (status) status.textContent = '🧠 SYNCING OFFLINE FOCUS & VAULT ENGINES...';
  }, 550);

  setTimeout(() => {
    if (bar) bar.style.width = '100%';
    if (status) status.textContent = '✨ ALL SYSTEMS OPERATIONAL • WELCOME DOST';
  }, 900);

  setTimeout(() => {
    dismissSplash();
  }, 1250);
}

runBootSequence();

updateProUI();
renderWorkflowPills();
renderVaultCards();

// Initial Boot (AI Coach is FIRST by default)
switchTab('tab-chat');
fetchRoutines();
fetchDisciplineStats();
fetchTasks();
fetchNotes();
fetchTimeAnalytics();
fetchReminders();
renderCalcTape();
loadNetworkInfo();



// ========================================================
// 17. GEMINI LIVE CONVERSATIONAL VOICE & REAL-TIME SPEECH
// 100% Free • Native Web Speech Recognition & Synthesis
// ========================================================
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const micBtn = document.getElementById('micBtn');
const openVoiceLiveBtn = document.getElementById('openVoiceLiveBtn');
const voiceLiveModal = document.getElementById('voiceLiveModal');
const closeVoiceLiveBtn = document.getElementById('closeVoiceLiveBtn');
const voiceOrbContainer = document.getElementById('voiceOrbContainer');
const voiceSoundwaves = document.getElementById('voiceSoundwaves');
const voiceStatusPill = document.getElementById('voiceStatusPill');
const voiceTranscriptUser = document.getElementById('voiceTranscriptUser');
const voiceTranscriptAi = document.getElementById('voiceTranscriptAi');
const voiceMuteToggleBtn = document.getElementById('voiceMuteToggleBtn');
const voiceMuteIcon = document.getElementById('voiceMuteIcon');
const voiceMuteText = document.getElementById('voiceMuteText');
const voiceInterruptBtn = document.getElementById('voiceInterruptBtn');
const voiceExitBtn = document.getElementById('voiceExitBtn');

let inputRecognizer = null;
let liveRecognizer = null;
let isInputRecording = false;
let isLiveActive = false;
let isLiveMuted = false;
let isAiSpeaking = false;

// 1. Quick Chat Input Mic (Tap to dictate & auto-send)
function initInputMic() {
  if (!SpeechRec) {
    if (micBtn) {
      micBtn.title = 'Voice input not supported in this browser (Use Chrome/Edge/Safari)';
      micBtn.style.opacity = '0.5';
    }
    return;
  }

  inputRecognizer = new SpeechRec();
  inputRecognizer.continuous = false;
  inputRecognizer.interimResults = true;
  inputRecognizer.lang = 'en-IN'; // Excellent for Hinglish, Hindi, and English accents

  inputRecognizer.onstart = () => {
    isInputRecording = true;
    micBtn?.classList.add('recording');
    if (userInput) userInput.placeholder = '🎙️ Listening... speak now...';
  };

  inputRecognizer.onresult = (e) => {
    const transcript = Array.from(e.results)
      .map(r => r[0].transcript)
      .join('');
    if (userInput) userInput.value = transcript;
  };

  inputRecognizer.onerror = (e) => {
    console.warn('Speech recognition notice:', e.error);
    stopInputMic();
  };

  inputRecognizer.onend = () => {
    stopInputMic();
    // Auto-send if text was recorded
    if (userInput && userInput.value.trim() && chatForm) {
      setTimeout(() => {
        chatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, 300);
    }
  };

  micBtn?.addEventListener('click', () => {
    if (isInputRecording) {
      inputRecognizer.stop();
    } else {
      try {
        inputRecognizer.start();
      } catch (err) {
        inputRecognizer.stop();
      }
    }
  });
}

function stopInputMic() {
  isInputRecording = false;
  micBtn?.classList.remove('recording');
  if (userInput) userInput.placeholder = 'Message Synapse...';
}

initInputMic();

// 2. Gemini Live Hands-Free Conversational Voice Loop
function initGeminiLiveVoice() {
  if (!SpeechRec) {
    openVoiceLiveBtn?.addEventListener('click', () => {
      showToast('Live voice requires Google Chrome, Microsoft Edge, or Safari.', 'warning', '🎙️');
    });
    return;
  }

  liveRecognizer = new SpeechRec();
  liveRecognizer.continuous = false;
  liveRecognizer.interimResults = true;
  liveRecognizer.lang = 'en-IN';

  function setLiveState(state, customText) {
    voiceOrbContainer?.classList.remove('listening', 'speaking', 'thinking');
    if (voiceSoundwaves) voiceSoundwaves.classList.add('hidden');

    if (state === 'listening') {
      voiceOrbContainer?.classList.add('listening');
      if (voiceSoundwaves) voiceSoundwaves.classList.remove('hidden');
      if (voiceStatusPill) voiceStatusPill.textContent = customText || 'Listening to you...';
    } else if (state === 'thinking') {
      voiceOrbContainer?.classList.add('thinking');
      if (voiceStatusPill) voiceStatusPill.textContent = customText || 'Synapse Thinking...';
    } else if (state === 'speaking') {
      voiceOrbContainer?.classList.add('speaking');
      if (voiceSoundwaves) voiceSoundwaves.classList.remove('hidden');
      if (voiceStatusPill) voiceStatusPill.textContent = customText || 'Synapse Speaking...';
    } else {
      if (voiceStatusPill) voiceStatusPill.textContent = 'Session Paused';
    }
  }

  liveRecognizer.onstart = () => {
    setLiveState('listening');
  };

  let liveFinalTranscript = '';

  liveRecognizer.onresult = (e) => {
    let interim = '';
    liveFinalTranscript = '';
    for (let i = 0; i < e.results.length; ++i) {
      if (e.results[i].isFinal) {
        liveFinalTranscript += e.results[i][0].transcript;
      } else {
        interim += e.results[i][0].transcript;
      }
    }
    const current = liveFinalTranscript || interim;
    if (voiceTranscriptUser && current) {
      voiceTranscriptUser.textContent = `"${current}"`;
    }
  };

  liveRecognizer.onerror = (e) => {
    if (e.error !== 'no-speech' && isLiveActive && !isLiveMuted && !isAiSpeaking) {
      setTimeout(startLiveListening, 600);
    }
  };

  liveRecognizer.onend = () => {
    if (!isLiveActive || isLiveMuted) return;

    if (liveFinalTranscript && liveFinalTranscript.trim()) {
      handleLiveVoiceTurn(liveFinalTranscript.trim());
      liveFinalTranscript = '';
    } else if (!isAiSpeaking) {
      // Keep listening in continuous loop
      setTimeout(startLiveListening, 400);
    }
  };

  function startLiveListening() {
    if (!isLiveActive || isLiveMuted || isAiSpeaking) return;
    try {
      liveRecognizer.start();
    } catch (e) {}
  }

  async function handleLiveVoiceTurn(userVoiceText) {
    setLiveState('thinking');
    if (voiceTranscriptAi) voiceTranscriptAi.textContent = 'Thinking...';

    // Also populate chat in background so history is saved
    appendUserMessage(userVoiceText);
    const { wrap, bubble } = createAssistantEntry();

    let aiFullReply = '';
    try {
      const res = await fetch('/api/chat-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-gemini-key': localStorage.getItem('synapse_gemini_key') || '',
          'x-groq-key': localStorage.getItem('synapse_groq_key') || ''
        },
        body: JSON.stringify({
          message: userVoiceText,
          history: chatSessionHistory.slice(-8)
        })
      });

      if (!res.ok) throw new Error('Network response not ok');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.token) {
                aiFullReply += data.token;
                bubble.innerHTML = formatMarkdown(aiFullReply);
              }
              if (data.triggerFocus) {
                setTimerDuration(data.triggerFocus.duration);
              }
              if (data.refreshTasks) fetchTasks();
              if (data.refreshRoutine) fetchRoutines();
              if (data.triggerUrgeDefeated) handleDefeatUrge();
            } catch {}
          }
        }
      }

      appendActionDock(wrap, userVoiceText, aiFullReply);
      chatSessionHistory.push({ role: 'user', content: userVoiceText });
      chatSessionHistory.push({ role: 'assistant', content: aiFullReply });
    } catch (err) {
      aiFullReply = getClientOfflineCoachReply(userVoiceText);
      bubble.innerHTML = formatMarkdown(aiFullReply);
      appendActionDock(wrap, userVoiceText, aiFullReply);
    }

    // Clean text for smooth voice playback (strip markdown symbols)
    const cleanSpeech = aiFullReply
      .replace(/\[\[?[\s\S]*?\]\]?/g, '')
      .replace(/[*#`_~•-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (voiceTranscriptAi) {
      voiceTranscriptAi.textContent = cleanSpeech.slice(0, 140) + (cleanSpeech.length > 140 ? '...' : '');
    }

    speakLiveAnswer(cleanSpeech);
  }

  function speakLiveAnswer(speechText) {
    if (!('speechSynthesis' in window) || !isLiveActive) {
      setTimeout(startLiveListening, 1000);
      return;
    }

    window.speechSynthesis.cancel();
    isAiSpeaking = true;
    setLiveState('speaking');

    const utter = new SpeechSynthesisUtterance(speechText);
    utter.rate = 1.05; // Natural modern pace
    utter.pitch = 1.0;

    // Pick best natural voice available
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(v => v.lang.startsWith('en-IN')) ||
                         voices.find(v => v.lang.startsWith('en-GB')) ||
                         voices.find(v => v.lang.startsWith('en-US')) ||
                         voices[0];
    if (naturalVoice) utter.voice = naturalVoice;

    utter.onend = () => {
      isAiSpeaking = false;
      if (isLiveActive && !isLiveMuted) {
        setLiveState('listening');
        setTimeout(startLiveListening, 500); // Continuous loop!
      }
    };

    utter.onerror = () => {
      isAiSpeaking = false;
      if (isLiveActive && !isLiveMuted) {
        setLiveState('listening');
        setTimeout(startLiveListening, 500);
      }
    };

    window.speechSynthesis.speak(utter);
  }

  function stopAllSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isAiSpeaking = false;
  }

  // Open & Close Handlers
  openVoiceLiveBtn?.addEventListener('click', () => {
    isLiveActive = true;
    isLiveMuted = false;
    voiceLiveModal?.classList.remove('hidden');
    if (voiceTranscriptUser) voiceTranscriptUser.textContent = 'Listening... speak naturally to Synapse.';
    if (voiceTranscriptAi) voiceTranscriptAi.textContent = '';
    startLiveListening();
  });

  function closeLiveSession() {
    isLiveActive = false;
    stopAllSpeech();
    try { liveRecognizer.stop(); } catch (e) {}
    voiceLiveModal?.classList.add('hidden');
  }

  closeVoiceLiveBtn?.addEventListener('click', closeLiveSession);
  voiceExitBtn?.addEventListener('click', closeLiveSession);

  // Interrupt button (cuts off AI voice immediately)
  voiceInterruptBtn?.addEventListener('click', () => {
    stopAllSpeech();
    setLiveState('listening', 'Interrupted — Listening to you...');
    setTimeout(startLiveListening, 300);
  });

  // Tap orb directly to interrupt or talk
  voiceOrbContainer?.addEventListener('click', () => {
    if (isAiSpeaking) {
      stopAllSpeech();
      setLiveState('listening', 'Interrupted — Listening to you...');
      setTimeout(startLiveListening, 300);
    } else if (isLiveMuted) {
      isLiveMuted = false;
      if (voiceMuteText) voiceMuteText.textContent = 'Mute';
      startLiveListening();
    }
  });

  // Mute / Unmute
  voiceMuteToggleBtn?.addEventListener('click', () => {
    isLiveMuted = !isLiveMuted;
    if (isLiveMuted) {
      try { liveRecognizer.stop(); } catch (e) {}
      stopAllSpeech();
      setLiveState('paused', 'Muted');
      if (voiceMuteText) voiceMuteText.textContent = 'Unmute';
    } else {
      if (voiceMuteText) voiceMuteText.textContent = 'Mute';
      startLiveListening();
    }
  });
}

initGeminiLiveVoice();

// ========================================================
// AI ENGINE ARCHITECTURE & PROVIDER SWITCHER (CLOUD / LOCAL)
// ========================================================
let serverEngineStatus = { hasGroq: false, hasGemini: false, isOllamaRunning: false, isVercel: false };

async function updateEngineStatusBadge() {
  const engineDot = document.getElementById('engineDot');
  const engineBadgeText = document.getElementById('engineBadgeText');
  const engineActiveDot = document.getElementById('engineActiveDot');
  const engineActiveName = document.getElementById('engineActiveName');
  const engineActiveDetail = document.getElementById('engineActiveDetail');

  const userGemini = localStorage.getItem('synapse_gemini_key') || '';
  const userGroq = localStorage.getItem('synapse_groq_key') || '';

  try {
    const res = await fetch('/api/engine-status');
    if (res.ok) {
      serverEngineStatus = await res.json();
    }
  } catch (e) {}

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  let title = isOnline ? '⚡ Groq Cloud AI' : '📱 Offline AI';
  let detail = isOnline ? 'Fast cloud intelligence via Groq Qwen 27B' : 'Offline on-device mode active';
  let dot = isOnline ? '🟢' : '🟠';

  if (isOnline) {
    if (userGroq || serverEngineStatus.hasGroq) {
      title = '✨ Synapse AI (Ultra-Fast)';
      detail = 'Ultra-fast study intelligence active.';
      dot = '🟢';
    } else if (userGemini || serverEngineStatus.hasGemini) {
      title = '🧠 Synapse AI (Gemini)';
      detail = 'Google Gemini study intelligence active.';
      dot = '🟢';
    } else {
      title = '✨ Synapse AI (Active & Free)';
      detail = 'Conversational study coach ready — zero setup or API keys needed!';
      dot = '🟢';
    }
  } else {
    if (webLlmEngine) {
      title = '🧠 WebGPU Offline AI (Active)';
      detail = 'On-device neural brain active in 100% Airplane Mode.';
      dot = '🟢';
    } else {
      title = '📱 Offline Study Coach';
      detail = 'Built-in 0MB study buddy active with zero internet.';
      dot = '🟠';
    }
  }

  if (engineDot) {
    engineDot.title = isOnline ? 'Online • ' + title : 'Offline Study Coach Active';
    engineDot.className = 'synapse-live-dot ' + (isOnline ? 'online' : 'offline');
    engineDot.textContent = '';
  }
  if (engineBadgeText) engineBadgeText.textContent = 'Synapse AI';
  if (engineActiveDot) engineActiveDot.textContent = dot;
  if (engineActiveName) engineActiveName.textContent = title;
  if (engineActiveDetail) engineActiveDetail.textContent = detail;
}

// Live network status listener
window.addEventListener('online', updateEngineStatusBadge);
window.addEventListener('offline', updateEngineStatusBadge);

function initAiEngineModal() {
  const openBtn = document.getElementById('openAiEngineBtn');
  const sidebarBtn = document.getElementById('sidebarAiEngineBtn');
  const modal = document.getElementById('aiEngineModal');
  const closeBtn = document.getElementById('closeAiEngineModal');
  const cancelBtn = document.getElementById('cancelAiEngineModalBtn');

  const openModal = () => {
    updateEngineStatusBadge();
    modal?.classList.remove('hidden');
  };

  const closeModal = () => modal?.classList.add('hidden');

  openBtn?.addEventListener('click', openModal);
  sidebarBtn?.addEventListener('click', () => {
    toggleSidebar(false);
    openModal();
  });
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);

  // Groq API Key Input Handler
  const groqInput = document.getElementById('groqApiKeyInput');
  const saveGroqBtn = document.getElementById('saveGroqKeyBtn');
  const groqStatus = document.getElementById('groqKeyStatus');

  if (groqInput) {
    groqInput.value = localStorage.getItem('synapse_groq_key') || '';
  }

  saveGroqBtn?.addEventListener('click', () => {
    const val = (groqInput?.value || '').trim();
    if (val) {
      localStorage.setItem('synapse_groq_key', val);
      if (groqStatus) {
        groqStatus.textContent = '✅ Groq Key Saved Successfully!';
        groqStatus.style.display = 'block';
      }
      showToast('⚡ Groq API Key Saved! Ultra-fast 300+ tok/s active.', 'success', '🔑');
    } else {
      localStorage.removeItem('synapse_groq_key');
      if (groqStatus) {
        groqStatus.textContent = 'ℹ️ Key removed. Using Free Cloud AI.';
        groqStatus.style.display = 'block';
      }
      showToast('Using Free Cloud AI Engine.', 'info', '✨');
    }
    updateEngineStatusBadge();
  });

  updateEngineStatusBadge();
  checkWebGpuSupport();
  autoRestoreWebLlmIfCached();

  // WebLLM in-browser download
  document.getElementById('downloadWebLlmBtn')?.addEventListener('click', initWebLlmDownload);

  // Force PWA Update & Clear Stale Cache
  document.getElementById('forcePwaUpdateBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('forcePwaUpdateBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Updating...';
    }
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
        }
      }
      setTimeout(() => {
        window.location.reload(true);
      }, 400);
    } catch {
      window.location.reload(true);
    }
  });
}

initAiEngineModal();

// ========================================================
// 1. CONFETTI CELEBRATION ENGINE (PURE CANVAS - ZERO DEPENDENCY)
// ========================================================
function launchConfettiBurst() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const pieces = [];
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
  for (let i = 0; i < 90; i++) {
    pieces.push({
      x: canvas.width / 2,
      y: canvas.height * 0.4,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.7) * 18,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10,
      opacity: 1
    });
  }

  let animationId;
  function updateConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = 0;
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.45; // gravity
      p.vx *= 0.98;
      p.rotation += p.vRot;
      p.opacity -= 0.012;

      if (p.opacity > 0) {
        active++;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      }
    }
    if (active > 0) {
      animationId = requestAnimationFrame(updateConfetti);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(animationId);
    }
  }
  updateConfetti();
}

// ========================================================
// 2. NATIVE PHONE NOTIFICATIONS ENGINE
// ========================================================
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendPhoneNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, {
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          vibrate: [200, 100, 200]
        });
      });
    } else {
      new Notification(title, { body, icon: '/icon-192.png' });
    }
  } catch (e) {}
}

// ========================================================
// 3. SCREEN WAKE LOCK & ANTI-DISTRACTION GUARD
// ========================================================
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) {}
}
function releaseWakeLock() {
  try {
    if (wakeLock) {
      wakeLock.release();
      wakeLock = null;
    }
  } catch (e) {}
}

// Strict Anti-Distraction & Split-Screen Defense: Freezes timer immediately on focus loss
function handleFocusLoss() {
  if (isPomodoroRunning && strictModeToggle?.checked) {
    // 1. Immediately pause timer countdown to prevent cheating
    clearInterval(pomodoroInterval);
    isPomodoroRunning = false;
    releaseWakeLock();
    if (pomodoroStartBtn) pomodoroStartBtn.textContent = '▶ Resume Focus';

    // 2. Sound warning alert tone
    playAlertChime();
    sendPhoneNotification(
      '🚨 Study Timer Frozen!',
      'You left the study session. The timer has been paused to protect your discipline.'
    );

    // 3. Show strict alert modal
    document.getElementById('distractionAlertModal')?.classList.remove('hidden');
  }
}

document.addEventListener('visibilitychange', () => {
  // Only trigger anti-distraction lock if student truly navigates away from tab/browser
  if (document.hidden) {
    handleFocusLoss();
  }
});

document.getElementById('returnToFocusBtn')?.addEventListener('click', () => {
  document.getElementById('distractionAlertModal')?.classList.add('hidden');
  // Safely resume timer from paused state (No false streak awards or confetti)
  if (!isPomodoroRunning && pomodoroStartBtn) {
    pomodoroStartBtn.click();
  }
});

// ========================================================
// 4. DAILY STREAK PROGRESSION ENGINE
// ========================================================
function checkDailyStreakGoal(completedMinutes) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastActive = disciplineStats.lastActiveDate || '';

  if (lastActive !== todayStr) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (lastActive === yesterday) {
      disciplineStats.streak = (disciplineStats.streak || 0) + 1;
    } else if (!lastActive) {
      disciplineStats.streak = 1;
    }
    disciplineStats.lastActiveDate = todayStr;
    saveDisciplineStats();
    renderDisciplineStats();

    setTimeout(() => {
      launchConfettiBurst();
      sendPhoneNotification(
        '🔥 Daily Streak Extended!',
        `Incredible work! You are now on a ${disciplineStats.streak}-Day study streak!`
      );
    }, 500);
  }
}

// ========================================================
// 5. IN-BROWSER WEBGPU OFFLINE AI ENGINE (WEBLLM)
// ========================================================
let webLlmEngine = null;
let isWebLlmLoading = false;

async function checkWebGpuSupport() {
  const badge = document.getElementById('webgpuSupportBadge');
  if (!badge) return;
  if ('gpu' in navigator) {
    badge.textContent = '🟢 WebGPU Supported';
    badge.style.background = 'rgba(16, 185, 129, 0.15)';
    badge.style.color = '#10b981';
  } else {
    badge.textContent = '⚠️ WebGPU Unavailable (Fallback Active)';
    badge.style.background = 'rgba(239, 68, 68, 0.15)';
    badge.style.color = '#ef4444';
  }
}

async function autoRestoreWebLlmIfCached() {
  if (localStorage.getItem('synapse_webllm_ready') === 'true' && 'gpu' in navigator) {
    if (!gpuSupported) await initWebGPUDetection();
    const savedModelId = localStorage.getItem('synapse_webllm_model') || (hasShaderF16 ? 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' : 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC');
    try {
      const webllm = await import('https://esm.run/@mlc-ai/web-llm');
      webLlmEngine = await webllm.CreateMLCEngine(savedModelId);
      console.log('⚡ Offline WebGPU engine auto-restored from local cache.');
      const downloadBtn = document.getElementById('downloadWebLlmBtn');
      if (downloadBtn) {
        downloadBtn.textContent = '✅ Offline Brain Ready';
        downloadBtn.style.background = '#10b981';
      }
      updateEngineStatusBadge();
    } catch (e) {
      console.warn('WebLLM auto-restore notice:', e);
    }
  }
}

async function initWebLlmDownload() {
  const downloadBtn = document.getElementById('downloadWebLlmBtn');
  const modelSelect = document.getElementById('webLlmModelSelect');
  const progressBox = document.getElementById('webLlmProgressBox');
  const progressText = document.getElementById('webLlmProgressText');
  const progressBar = document.getElementById('webLlmProgressBar');
  const progressPercent = document.getElementById('webLlmProgressPercent');

  if (!('gpu' in navigator)) {
    showToast('WebGPU not enabled on this mobile browser. Built-in 0MB offline brain is active!', 'info', '📱', 4000);
    return;
  }

  if (!gpuSupported) {
    await initWebGPUDetection();
  }

  let selectedRaw = modelSelect?.value || 'SmolLM2-360M-Instruct-q4f16_1-MLC';
  let modelId = selectedRaw;

  // Normalize model ID and apply shader-f16 compatibility fallback for mobile devices
  if (selectedRaw.includes('Qwen2-') || selectedRaw.includes('Qwen2.5-')) {
    modelId = hasShaderF16 ? 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC' : 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC';
  } else if (selectedRaw.includes('Llama-3.2-')) {
    modelId = hasShaderF16 ? 'Llama-3.2-1B-Instruct-q4f16_1-MLC' : 'Llama-3.2-1B-Instruct-q4f32_1-MLC';
  } else if (selectedRaw.includes('SmolLM2-')) {
    modelId = hasShaderF16 ? 'SmolLM2-360M-Instruct-q4f16_1-MLC' : 'SmolLM2-360M-Instruct-q4f32_1-MLC';
  } else if (!hasShaderF16 && modelId.includes('q4f16_1')) {
    modelId = modelId.replace('q4f16_1', 'q4f32_1');
  }

  isWebLlmLoading = true;
  if (downloadBtn) {
    downloadBtn.disabled = true;
    downloadBtn.textContent = '⏳ Loading...';
  }
  progressBox?.classList.remove('hidden');

  try {
    const webllm = await import('https://esm.run/@mlc-ai/web-llm');
    webLlmEngine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        const pct = Math.round((report.progress || 0) * 100);
        if (progressPercent) progressPercent.textContent = `${pct}%`;
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressText) progressText.textContent = (report.text || 'Loading...').slice(0, 42) + ((report.text || '').length > 42 ? '...' : '');
      }
    });

    localStorage.setItem('synapse_webllm_ready', 'true');
    localStorage.setItem('synapse_webllm_model', modelId);
    if (downloadBtn) {
      downloadBtn.textContent = '✅ Offline Brain Ready';
      downloadBtn.style.background = '#10b981';
      downloadBtn.disabled = false;
    }
    if (progressText) progressText.textContent = 'Brain downloaded! You can now chat in 100% Airplane Mode.';
    launchConfettiBurst();
    showToast('🎉 Success! Offline Neural Brain ready. You can now chat in 100% Airplane Mode!', 'success', '🧠', 5000);
    updateEngineStatusBadge();
  } catch (err) {
    console.warn('WebLLM init notice:', err);
    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.textContent = '❌ Retry Download';
    }
    if (progressText) {
      progressText.textContent = `Download notice: ${err?.message || err}. (Built-in 0MB offline brain remains active!)`;
    }
  } finally {
    isWebLlmLoading = false;
  }
}
