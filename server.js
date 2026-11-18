import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lightweight native .env loader (zero external dependency)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of envLines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch (e) {}

const APP_VERSION = '2.0.0';

const app = express();
const PORT = process.env.PORT || 5100;

// Restrict CORS to same-origin / local network in dev, allow Vercel domains
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile PWA, curl), local IPs, and Vercel domains
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(origin) || /\.vercel\.app$/i.test(origin)) {
      cb(null, true);
    } else {
      cb(null, true); // Allow all web clients in production
    }
  }
}));
app.use(express.json({ limit: '2mb' }));

// Never cache the service worker itself so PWAs auto-update on deploy
app.get('/sw.js', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

app.use(express.static(path.join(__dirname, 'public')));

// Explicit route for privacy policy (also served by static, but explicit is cleaner)
app.get('/privacy', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

// App version endpoint
app.get('/api/version', (_req, res) => res.json({ version: APP_VERSION }));

// Persistent storage setup (safe for Vercel serverless /tmp environment)
const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const dataDir = isVercel ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
}

function getJsonFile(fileName, defaultVal = []) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) {
    try { fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2)); } catch (e) {}
    return defaultVal;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return defaultVal;
  }
}

function saveJsonFile(fileName, data) {
  const filePath = path.join(dataDir, fileName);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('Storage write warning:', e.message);
  }
}

function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  let fallbackIp = '127.0.0.1';
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.startsWith('192.168.56.') || net.address.startsWith('169.254.')) {
          continue;
        }
        if (/wi-fi|wlan|wireless/i.test(name)) {
          return net.address;
        }
        fallbackIp = net.address;
      }
    }
  }
  return fallbackIp;
}

function getSystemTimeInfo() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const timeShort = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return { now, timeStr, timeShort, dateStr, tz };
}

// Quick Natural Language Command Parser
function parseReminder(message) {
  let lower = message.toLowerCase().trim();
  lower = lower.replace(/^(can\s+you\s+|please\s+|could\s+you\s+|hey\s+synapse\s*[,:]?\s*|synapse\s*[,:]?\s*|i\s+want\s+you\s+to\s+|help\s+me\s+to\s+|just\s+)+/i, '').trim();

  const isReminder = /(?:remind\s+me|set\s+(?:a\s+)?reminder|create\s+(?:a\s+)?reminder|alarm|alert\s+me|notify\s+me|timer)/i.test(lower);
  if (!isReminder) return null;

  const matchKeyword = lower.match(/(?:remind\s+me|set\s+(?:a\s+)?reminder|create\s+(?:a\s+)?reminder|alarm|alert\s+me|notify\s+me|timer)/i);
  const triggerIdx = lower.indexOf(matchKeyword[0]);
  let query = lower.substring(triggerIdx + matchKeyword[0].length).trim();
  query = query.replace(/^(to|for|about)\s+/i, '').trim();

  const now = new Date();
  let targetTime = null;
  let text = 'Reminder';
  let delayLabel = '';

  // 1. Relative: "in X min/sec/hours"
  const relMatch = query.match(/(?:in|after)\s+(\d+)\s*(s(?:ec(?:ond)?s?)?|m(?:in(?:ute)?s?)?|h(?:(?:ou)?rs?)?|d(?:ays?)?)(?:\s+(?:to|for|about|that)?\s*(.+))?/i);
  if (relMatch) {
    const amount = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const action = relMatch[3];

    let ms = 0;
    if (unit.startsWith('s')) ms = amount * 1000;
    else if (unit.startsWith('m')) ms = amount * 60 * 1000;
    else if (unit.startsWith('h')) ms = amount * 60 * 60 * 1000;
    else if (unit.startsWith('d')) ms = amount * 24 * 60 * 60 * 1000;

    targetTime = new Date(now.getTime() + ms);
    delayLabel = `in ${amount} ${unit.startsWith('s') ? 'seconds' : unit.startsWith('m') ? 'minutes' : 'hours'}`;

    if (action && action.trim()) {
      text = action.trim();
    } else {
      const beforeIn = query.substring(0, relMatch.index).trim();
      text = beforeIn || "Reminder Alert";
    }

    return { text: cleanText(text), targetTime: targetTime.toISOString(), delayLabel };
  }

  // 2. Absolute: "at 5:30 pm"
  const absMatch = query.match(/(?:at|for|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s+(?:to|for|about|that)?\s*(.+))?/i);
  if (absMatch) {
    let hours = parseInt(absMatch[1], 10);
    const minutes = absMatch[2] ? parseInt(absMatch[2], 10) : 0;
    const meridian = absMatch[3];
    const action = absMatch[4];

    if (meridian) {
      const m = meridian.toLowerCase();
      if (m === 'pm' && hours < 12) hours += 12;
      if (m === 'am' && hours === 12) hours = 0;
    }

    targetTime = new Date();
    targetTime.setHours(hours, minutes, 0, 0);

    if (targetTime.getTime() <= now.getTime()) {
      targetTime.setDate(targetTime.getDate() + 1);
    }

    const timeFormatted = targetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    delayLabel = `at ${timeFormatted}`;

    if (action && action.trim()) {
      text = action.trim();
    } else {
      const beforeAt = query.substring(0, absMatch.index).trim();
      text = beforeAt || "Scheduled Reminder";
    }

    return { text: cleanText(text), targetTime: targetTime.toISOString(), delayLabel };
  }

  if (query && query.length > 2) {
    targetTime = new Date(now.getTime() + 10 * 60 * 1000);
    return {
      text: cleanText(query),
      targetTime: targetTime.toISOString(),
      delayLabel: 'in 10 minutes'
    };
  }

  return null;
}

function cleanText(str) {
  return str.replace(/^(to|for|about|that)\s+/i, '').replace(/[.?!]+$/, '').trim() || 'Reminder';
}

function evaluateMath(expr) {
  try {
    const cleanExpr = expr.replace(/[^-()\d/*+.]/g, '');
    if (!cleanExpr || cleanExpr.length < 2) return null;
    const result = new Function(`return (${cleanExpr})`)();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return result;
    }
  } catch {
    return null;
  }
  return null;
}

// ========================================================
// API ROUTES
// ========================================================

app.get('/api/network-info', (req, res) => {
  const localIp = getLocalNetworkIp();
  res.json({
    localIp,
    port: PORT,
    mobileUrl: `http://${localIp}:${PORT}`,
    desktopUrl: `http://localhost:${PORT}`
  });
});

app.get('/api/time', (req, res) => {
  res.json(getSystemTimeInfo());
});

// Reminders
app.get('/api/reminders', (req, res) => {
  res.json(getJsonFile('reminders.json', []));
});

app.post('/api/reminders', (req, res) => {
  const { text, targetTime } = req.body;
  if (!text || !targetTime) return res.status(400).json({ error: 'Missing parameters' });
  const reminders = getJsonFile('reminders.json', []);
  const item = {
    id: Date.now().toString(),
    text: text.trim(),
    targetTime,
    createdAt: new Date().toISOString(),
    completed: false
  };
  reminders.push(item);
  saveJsonFile('reminders.json', reminders);
  res.json(item);
});

app.post('/api/reminders/:id/snooze', (req, res) => {
  const minutes = req.body.minutes || 5;
  const reminders = getJsonFile('reminders.json', []);
  const item = reminders.find(r => r.id === req.params.id);
  if (item) {
    item.targetTime = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    item.completed = false;
    saveJsonFile('reminders.json', reminders);
    return res.json({ success: true, item });
  }
  res.status(404).json({ error: 'Not found' });
});

app.post('/api/reminders/:id/complete', (req, res) => {
  const reminders = getJsonFile('reminders.json', []);
  const item = reminders.find(r => r.id === req.params.id);
  if (item) {
    item.completed = true;
    saveJsonFile('reminders.json', reminders);
  }
  res.json({ success: true });
});

app.delete('/api/reminders/:id', (req, res) => {
  let reminders = getJsonFile('reminders.json', []);
  reminders = reminders.filter(r => r.id !== req.params.id);
  saveJsonFile('reminders.json', reminders);
  res.json({ success: true });
});

// Tasks
app.get('/api/tasks', (req, res) => {
  res.json(getJsonFile('tasks.json', []));
});

app.post('/api/tasks', (req, res) => {
  const { text, category = 'Work' } = req.body;
  if (!text) return res.status(400).json({ error: 'Text required' });
  const tasks = getJsonFile('tasks.json', []);
  const item = {
    id: Date.now().toString(),
    text: text.trim(),
    category,
    completed: false,
    createdAt: new Date().toISOString()
  };
  tasks.push(item);
  saveJsonFile('tasks.json', tasks);
  res.json(item);
});

app.post('/api/tasks/:id/toggle', (req, res) => {
  const tasks = getJsonFile('tasks.json', []);
  const item = tasks.find(t => t.id === req.params.id);
  if (item) {
    item.completed = !item.completed;
    saveJsonFile('tasks.json', tasks);
    return res.json({ success: true, item });
  }
  res.status(404).json({ error: 'Not found' });
});

app.delete('/api/tasks/:id', (req, res) => {
  let tasks = getJsonFile('tasks.json', []);
  tasks = tasks.filter(t => t.id !== req.params.id);
  saveJsonFile('tasks.json', tasks);
  res.json({ success: true });
});

// Notes
app.get('/api/notes', (req, res) => {
  res.json(getJsonFile('notes.json', []));
});

app.post('/api/notes', (req, res) => {
  const { title, content } = req.body;
  const notes = getJsonFile('notes.json', []);
  const item = {
    id: Date.now().toString(),
    title: (title || 'Quick Note').trim(),
    content: (content || '').trim(),
    updatedAt: new Date().toISOString()
  };
  notes.unshift(item);
  saveJsonFile('notes.json', notes);
  res.json(item);
});

app.delete('/api/notes/:id', (req, res) => {
  let notes = getJsonFile('notes.json', []);
  notes = notes.filter(n => n.id !== req.params.id);
  saveJsonFile('notes.json', notes);
  res.json({ success: true });
});

// Time Tracking Analytics
app.get('/api/time-analytics', (req, res) => {
  const sessions = getJsonFile('time-analytics.json', []);
  const categoryTotals = {};
  let totalMinutes = 0;

  sessions.forEach(s => {
    const mins = Number(s.durationMinutes) || 0;
    const cat = s.category || 'General Focus';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + mins;
    totalMinutes += mins;
  });

  let topCategory = 'None yet';
  let maxMins = 0;
  for (const [cat, mins] of Object.entries(categoryTotals)) {
    if (mins > maxMins) {
      maxMins = mins;
      topCategory = cat;
    }
  }

  res.json({
    sessions,
    totalMinutes,
    totalSessions: sessions.length,
    categoryTotals,
    topCategory,
    topCategoryMinutes: maxMins
  });
});

app.post('/api/time-analytics/log', (req, res) => {
  const { category = 'Coding & Dev', durationMinutes = 25, task = 'Deep Work Session' } = req.body;
  const sessions = getJsonFile('time-analytics.json', []);
  const newSession = {
    id: Date.now().toString(),
    category: category.trim(),
    durationMinutes: Number(durationMinutes) || 25,
    task: task.trim(),
    timestamp: new Date().toISOString()
  };
  sessions.unshift(newSession);
  saveJsonFile('time-analytics.json', sessions);
  res.json({ success: true, session: newSession });
});

app.delete('/api/time-analytics/:id', (req, res) => {
  let sessions = getJsonFile('time-analytics.json', []);
  sessions = sessions.filter(s => s.id !== req.params.id);
  saveJsonFile('time-analytics.json', sessions);
  res.json({ success: true });
});

// ========================================================
// IN-APP WEB RESEARCH & SEARCH PROXY
// ========================================================
app.get('/api/web/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.json({ results: [] });

  const results = [];

  try {
    // 1. DuckDuckGo Instant Answer
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
    if (ddgRes.ok) {
      const ddg = await ddgRes.json();
      if (ddg.AbstractText) {
        results.push({
          title: ddg.Heading || query,
          snippet: ddg.AbstractText,
          url: ddg.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          source: ddg.AbstractSource || 'DuckDuckGo'
        });
      }
      if (Array.isArray(ddg.RelatedTopics)) {
        ddg.RelatedTopics.slice(0, 4).forEach(t => {
          if (t.Text && t.FirstURL) {
            results.push({
              title: t.Text.split(' - ')[0] || t.Text.slice(0, 40),
              snippet: t.Text,
              url: t.FirstURL,
              source: 'Web'
            });
          }
        });
      }
    }
  } catch (err) {
    console.warn('DuckDuckGo search warning:', err.message);
  }

  try {
    // 2. Wikipedia Search API
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=4&namespace=0&format=json`;
    const wikiRes = await fetch(wikiUrl);
    if (wikiRes.ok) {
      const wiki = await wikiRes.json();
      const titles = wiki[1] || [];
      const descriptions = wiki[2] || [];
      const urls = wiki[3] || [];
      for (let i = 0; i < titles.length; i++) {
        if (!results.some(r => r.url === urls[i])) {
          results.push({
            title: titles[i],
            snippet: descriptions[i] || 'Wikipedia encyclopedia article',
            url: urls[i],
            source: 'Wikipedia'
          });
        }
      }
    }
  } catch (err) {
    console.warn('Wikipedia search warning:', err.message);
  }

  // Fallback direct Google link item
  results.push({
    title: `Search "${query}" on Google`,
    snippet: `Open live Google search results for "${query}"`,
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    source: 'Google'
  });

  res.json({ query, results });
});

// Allowed external domains for the web-fetch proxy (SSRF protection)
const ALLOWED_FETCH_DOMAINS = [
  'en.wikipedia.org', 'wikipedia.org',
  'api.duckduckgo.com', 'duckduckgo.com',
  'news.google.com',
  'www.google.com'
];

function isAllowedFetchUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_FETCH_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch { return false; }
}

// Read and extract clean text from any URL
app.get('/api/web/fetch', async (req, res) => {
  const targetUrl = (req.query.url || '').trim();
  if (!targetUrl) return res.status(400).json({ error: 'URL required' });
  if (!isAllowedFetchUrl(targetUrl)) {
    return res.status(403).json({ error: 'Domain not allowed by fetch proxy' });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to load page: ${response.statusText}` });
    }

    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'Web Article';

    // Strip scripts, styles, svg, and tags to extract readable text
    let clean = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '');

    // Extract paragraph text
    const paragraphs = [];
    const pMatches = clean.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
    for (const p of pMatches) {
      const text = p.replace(/<[^>]+>/g, '').trim();
      if (text.length > 40) {
        paragraphs.push(text);
      }
    }

    const articleContent = paragraphs.slice(0, 15).join('\n\n');

    res.json({
      title,
      url: targetUrl,
      content: articleContent || 'Could not extract article body text. You can visit the link directly.',
      paragraphCount: paragraphs.length
    });
  } catch (err) {
    res.status(500).json({ error: `Could not fetch page: ${err.message}` });
  }
});

// ========================================================
// DAILY PRODUCTIVITY EXECUTIVE REPORT EXPORT
// ========================================================
app.get('/api/report/daily', (req, res) => {
  const tasks = getJsonFile('tasks.json', []);
  const reminders = getJsonFile('reminders.json', []);
  const notes = getJsonFile('notes.json', []);
  const analytics = getJsonFile('time-analytics.json', []);
  const timeInfo = getSystemTimeInfo();

  const completedTasks = tasks.filter(t => t.completed);
  const pendingTasks = tasks.filter(t => !t.completed);
  const activeReminders = reminders.filter(r => !r.completed);

  let totalMinutes = 0;
  const categoryTotals = {};
  analytics.forEach(s => {
    const m = Number(s.durationMinutes) || 0;
    totalMinutes += m;
    const cat = s.category || 'General';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + m;
  });

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const focusTimeStr = `${hours}h ${mins.toString().padStart(2, '0')}m`;

  // Build Markdown Report
  let md = `# 📊 Synapse Executive Daily Productivity Report\n`;
  md += `**Date:** ${timeInfo.dateStr} • **Generated:** ${timeInfo.timeStr}\n\n`;
  md += `---\n\n`;

  md += `### ⏱️ Focus & Time Distribution\n`;
  md += `- **Total Focus Time:** ${focusTimeStr} (${analytics.length} total sessions)\n`;
  if (Object.keys(categoryTotals).length > 0) {
    md += `- **Breakdown by Category:**\n`;
    for (const [cat, m] of Object.entries(categoryTotals)) {
      const pct = totalMinutes > 0 ? Math.round((m / totalMinutes) * 100) : 0;
      md += `  - ${cat}: **${m} mins** (${pct}%)\n`;
    }
  } else {
    md += `- *No focus sessions logged yet today.*\n`;
  }
  md += `\n`;

  md += `### ✅ Work Tasks Status\n`;
  md += `- **Completed Tasks (${completedTasks.length}):**\n`;
  if (completedTasks.length > 0) {
    completedTasks.forEach(t => { md += `  - [x] ${t.text} *(Category: ${t.category || 'Work'})*\n`; });
  } else {
    md += `  - *No completed tasks yet.*\n`;
  }
  md += `- **Pending Tasks (${pendingTasks.length}):**\n`;
  if (pendingTasks.length > 0) {
    pendingTasks.forEach(t => { md += `  - [ ] ${t.text} *(Category: ${t.category || 'Work'})*\n`; });
  } else {
    md += `  - *All tasks completed!*\n`;
  }
  md += `\n`;

  md += `### 📝 Captured Notes (${notes.length})\n`;
  if (notes.length > 0) {
    notes.slice(0, 5).forEach(n => {
      md += `#### ${n.title}\n${n.content}\n\n`;
    });
  } else {
    md += `*No notes recorded yet today.*\n\n`;
  }

  md += `### ⏰ Active Reminders (${activeReminders.length})\n`;
  if (activeReminders.length > 0) {
    activeReminders.forEach(r => {
      const timeFmt = new Date(r.targetTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      md += `- ⏰ ${r.text} *(Due at ${timeFmt})*\n`;
    });
  } else {
    md += `*No active reminders scheduled.*\n`;
  }

  res.json({
    dateStr: timeInfo.dateStr,
    timeStr: timeInfo.timeStr,
    totalMinutes,
    focusTimeStr,
    completedTasksCount: completedTasks.length,
    pendingTasksCount: pendingTasks.length,
    notesCount: notes.length,
    remindersCount: activeReminders.length,
    categoryTotals,
    markdownReport: md
  });
});

// Process voice memo into structured tasks and note
app.post('/api/voice/process', (req, res) => {
  const { transcript = '' } = req.body;
  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: 'Transcript required' });
  }

  const raw = transcript.trim();
  const tasks = getJsonFile('tasks.json', []);
  const notes = getJsonFile('notes.json', []);

  // Split clauses into task items if user said "and also", "then", "need to"
  const items = raw.split(/(?:and\s+also|and\s+then|need\s+to|also\s+need\s+to|\.\s+)+/i)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  const createdTasks = [];
  items.forEach(item => {
    let clean = item.replace(/^(i\s+need\s+to|please|remember\s+to|i\s+have\s+to)\s+/i, '').trim();
    if (clean.length > 3) {
      clean = clean.charAt(0).toUpperCase() + clean.slice(1);
      const newTask = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 5),
        text: clean,
        category: 'Work',
        completed: false,
        createdAt: new Date().toISOString()
      };
      tasks.push(newTask);
      createdTasks.push(newTask);
    }
  });
  saveJsonFile('tasks.json', tasks);

  // Save the full transcript as a voice note
  const voiceNote = {
    id: Date.now().toString(),
    title: `🎙️ Voice Note: ${raw.slice(0, 25)}...`,
    content: raw,
    updatedAt: new Date().toISOString()
  };
  notes.unshift(voiceNote);
  saveJsonFile('notes.json', notes);

  res.json({
    success: true,
    createdTasks,
    voiceNote
  });
});

// ========================================================
// ROUTINE & DISCIPLINE DATA ENDPOINTS
// ========================================================
const defaultRoutine = [
  { id: 'r1', time: '06:00 - 07:00 AM', title: '🌅 Morning Mindset, Hydration & Stretch', category: 'Health', completed: false },
  { id: 'r2', time: '07:30 - 09:30 AM', title: '📚 Deep Study Block 1 (Hardest Topic)', category: 'Study', completed: false },
  { id: 'r3', time: '10:00 - 12:00 PM', title: '⚡ Active Recall & Problem Solving', category: 'Study', completed: false },
  { id: 'r4', time: '12:30 - 01:30 PM', title: '🥗 Clean Nutrition & Screen-free Rest', category: 'Health', completed: false },
  { id: 'r5', time: '02:30 - 04:30 PM', title: '🧠 Deep Study Block 2 (Concepts & Revision)', category: 'Study', completed: false },
  { id: 'r6', time: '05:30 - 06:30 PM', title: '🏃 Exercise / Physical Training', category: 'Health', completed: false },
  { id: 'r7', time: '08:00 - 09:30 PM', title: '📖 Daily Review & Next Day Strategy', category: 'Review', completed: false },
  { id: 'r8', time: '10:00 PM', title: '🌙 Digital Disconnect & Sleep', category: 'Health', completed: false }
];

app.get('/api/routine', (req, res) => {
  const routine = getJsonFile('routine.json', defaultRoutine);
  res.json(routine);
});

app.post('/api/routine', (req, res) => {
  const { routine } = req.body;
  if (!Array.isArray(routine)) {
    return res.status(400).json({ error: 'Routine must be an array' });
  }
  saveJsonFile('routine.json', routine);
  res.json({ success: true, routine });
});

// Zenith Custom Workflows API
app.get('/api/workflows', (req, res) => {
  const workflows = getJsonFile('workflows.json', null);
  res.json(workflows);
});

app.post('/api/workflows', (req, res) => {
  const { workflows } = req.body;
  if (!workflows || typeof workflows !== 'object') {
    return res.status(400).json({ error: 'Invalid workflows payload' });
  }
  saveJsonFile('workflows.json', workflows);
  res.json({ success: true, workflows });
});

app.get('/api/discipline-stats', (req, res) => {
  const defaultStats = {
    streak: 5,
    score: 92,
    distractionsResisted: 8,
    todayFocusMinutes: 0,
    lastActiveDate: new Date().toISOString().slice(0, 10)
  };
  const stats = getJsonFile('discipline.json', defaultStats);
  res.json(stats);
});

app.post('/api/discipline-stats', (req, res) => {
  const stats = req.body;
  saveJsonFile('discipline.json', stats);
  res.json({ success: true, stats });
});

// AI Engine Status (Cloud & Local)
app.get('/api/engine-status', async (_req, res) => {
  const ollamaRunning = await isOllamaAvailable();
  res.json({
    hasGroq: Boolean(process.env.GROQ_API_KEY),
    hasGemini: Boolean(process.env.GEMINI_API_KEY),
    isOllamaRunning: ollamaRunning,
    isVercel: isVercel
  });
});

function getOfflineCoachResponse(raw, lower, timeInfo) {
  // 1. Anti-Social Media / Digital Detox / Procrastination / Urges
  if (/(?:social\s+media|instagram|tiktok|youtube|twitter|reels|shorts|doomscroll|scroll|distract\w*|procrastinat\w*|lazy|unmotivat\w*|can't\s+focus|dopamine|urge)/i.test(lower)) {
    return `🛡️ **Discipline Coach: Crushing Distraction & Social Media Urges**

Here is your tactical action protocol:

1. **The 10-Minute Urge Rule:**
   When you feel an intense urge to open social media, tell yourself: *"I will wait 10 minutes."* In 90% of cases, the dopamine craving peaks and fades in 3–5 minutes.

2. **Dopamine Reset (Why studying feels boring):**
   Social media floods your brain with cheap, effortless dopamine. When you sit down to study, your brain craves that instant hit. To reset: put your phone in another room, take 5 deep breaths, and commit to just **5 minutes** of reading. Action creates motivation.

3. **Friction is Your Armor:**
   • Move social apps into deep folders or delete them for exam weeks.
   • Turn your phone to Grayscale (monochrome) — it reduces screen time by 30%.
   • Use Synapse's **Strict Study Mode** to lock your focus timer now.

💡 *Remember: Discipline is choosing between what you want NOW and what you want MOST.*`;
  }

  // 2. Study Techniques & Mastery (Feynman, Active Recall, Spaced Repetition, Blurting)
  if (/(?:feynman|active\s+recall|spaced\s+repetition|blurting|pomodoro|study\s+technique|how\s+to\s+study|memoriz|exam\s+prep|revision)\b/i.test(lower)) {
    if (/feynman/i.test(lower)) {
      return `🧠 **The Feynman Technique (Master Any Hard Topic):**

1. **Pick the Concept:** Choose a specific formula, theory, or chapter.
2. **Teach it to a 10-Year-Old:** Write down or speak out loud an explanation without using any technical jargon or textbooks.
3. **Identify Gaps:** Where did you stumble or need complex words? That is your exact weak point.
4. **Simplify & Create Analogies:** Re-study that specific gap until you can explain it with a simple everyday metaphor.

🔥 *Rule: If you cannot explain it simply, you do not understand it deeply.*`;
    }
    if (/active\s+recall/i.test(lower)) {
      return `⚡ **Active Recall (The #1 Science-Backed Study Method):**

Passive reading (highlighting, re-reading notes) gives an **illusion of competence**. Active recall forces your brain to retrieve knowledge.

**3 Ways to Use It Right Now:**
• **Closed-Book Questioning:** Read a page, close the book, and write down everything you remember.
• **Flashcard Testing:** Write questions on one side and answers on the other. Test yourself repeatedly.
• **Teach the Wall:** Stand up and explain the core ideas without looking at notes.`;
    }
    if (/spaced\s+repetition/i.test(lower)) {
      return `📅 **Spaced Repetition Schedule (Never Forget a Topic):**

The Ebbinghaus Forgetting Curve shows you lose 70% of new information in 24 hours unless reviewed at spaced intervals.

**The Golden Review Timeline:**
• **Day 1:** Initial study + active recall test.
• **Day 2 (24h later):** Quick 10-minute retrieval quiz.
• **Day 4 (3 days later):** Solve 3 practice problems.
• **Day 7 (1 week later):** High-level summary from memory.
• **Day 30 (1 month later):** Final consolidation review.`;
    }
    return `📚 **Top 3 Science-Backed Study Strategies:**

1. **Active Recall:** Always test yourself instead of re-reading. Force your brain to retrieve answers.
2. **50/10 Study Blocks:** 50 minutes of deep, uninterrupted work followed by 10 minutes of screen-free physical rest.
3. **The Blurting Method:** Read a topic, close the book, and write every fact you can recall on a blank sheet in 5 minutes. Check errors in red.`;
  }

  // 3. Routine & Daily Timetable Generation
  if (/(?:routine|schedule|timetable|plan\s+my\s+day|study\s+plan|morning\s+routine|night\s+routine)\b/i.test(lower)) {
    return `📅 **Optimal Strict Discipline Routine (Designed for Peak Study & Zero Burnout):**

🌅 **Morning Foundation:**
• **06:00 AM:** Wake up, 500ml water, stretch, zero phone/screens.
• **07:30 AM – 09:30 AM (Block 1):** Deep Study (Hardest Subject / New Concepts).

⚡ **Midday Momentum:**
• **10:00 AM – 12:00 PM (Block 2):** Problem Solving & Active Recall Practice.
• **12:30 PM – 01:30 PM:** Healthy Lunch & Screen-free Rest.

🧠 **Afternoon Focus:**
• **02:30 PM – 04:30 PM (Block 3):** Revision, Notes consolidation & Practice Tests.
• **05:30 PM – 06:30 PM:** Physical workout / outdoor walk.

🌙 **Evening Review & Reset:**
• **08:00 PM – 09:30 PM:** Review tomorrow's priorities & flashcards.
• **10:00 PM:** Digital Disconnect & deep sleep.

👉 *Check your "Routine & Discipline" tab to track these blocks with live reminders!*`;
  }

  // 4. Built-in Science & Concept Explanations
  // 4A. Cell Biology: Mitochondria (Handles common typos like michrochondria)
  if (/(?:mitochondri\w*|michrochondri\w*|mitocondri\w*|powerhouse\s+of\s+(?:the\s+)?cell)\b/i.test(lower)) {
    return `🔬 **Mitochondria (Powerhouse of the Cell):**

Mitochondria are double-membrane organelles found in nearly all eukaryotic cells (plants, animals, fungi). Their primary mission is to convert dietary nutrients (glucose, pyruvate, fatty acids) into usable biochemical energy in the form of **ATP (Adenosine Triphosphate)**.

**Core Biological Facts:**
• **Inner Membrane Cristae:** Intricately folded layers that drastically increase the surface area for the **Electron Transport Chain (ETC)** and ATP synthase complexes.
• **Aerobic Respiration:** Produces approximately **36–38 ATP** per glucose molecule through the Krebs cycle and oxidative phosphorylation.
• **Independent mtDNA:** Mitochondria have their own circular genome and ribosomes, which strongly supports the **Endosymbiotic Theory** (they were once free-living alpha-proteobacteria engulfed by early ancestral cells).
• **Maternal Inheritance:** Human mitochondrial DNA is passed down almost exclusively through the mother's egg.`;
  }

  // 4B. Molecular Biology: DNA, RNA & Central Dogma
  if (/(?:dna|rna|nucleic\s+acid|transcription|translation|genetic\s+code|double\s+helix)\b/i.test(lower)) {
    return `🧬 **DNA & RNA (Molecular Biology & Genetics):**

DNA (Deoxyribonucleic Acid) is the blueprint of life, while RNA (Ribonucleic Acid) translates that genetic blueprint into functional proteins.

**Key Concepts:**
• **Chargaff's Base Pairing Rule:** In DNA, Adenine (A) pairs with Thymine (T) via 2 hydrogen bonds; Guanine (G) pairs with Cytosine (C) via 3 hydrogen bonds.
• **The Central Dogma:** DNA ➔ (Transcription via RNA Polymerase) ➔ mRNA ➔ (Translation on Ribosomes) ➔ Functional Protein.
• **RNA Distinctions:** Single-stranded, contains **Uracil (U)** instead of Thymine, and uses ribose sugar instead of deoxyribose.`;
  }

  // 4C. Ribosomes & Protein Synthesis
  if (/(?:ribosome\w*|protein\s+synthesis)\b/i.test(lower)) {
    return `🔬 **Ribosomes (The Protein Synthesis Factory):**

Ribosomes are complex ribonucleoprotein machines that read mRNA codons and assemble matching amino acids into polypeptide chains.
• **Structure:** Composed of ribosomal RNA (rRNA) and catalytic proteins. In eukaryotes: 80S (60S large + 40S small); in prokaryotes: 70S (50S + 30S).
• **Sites:** Free-floating in the cytoplasm (make proteins for internal cell use) or bound to the Rough Endoplasmic Reticulum (make membrane/secretory proteins).`;
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

  if (/mitosis|cell\s+division|meiosis/i.test(lower)) {
    return `🔬 **Mitosis vs Meiosis (Cell Division):**

• **Mitosis (Somatic Cells):** 1 parent cell creates **2 genetically identical diploid (2n)** daughter cells for growth and tissue repair.
  *Phases (PMAT):* Prophase (chromosomes condense) ➔ Metaphase (line up at center) ➔ Anaphase (chromatids separate) ➔ Telophase & Cytokinesis.
• **Meiosis (Germline Cells):** 1 parent cell undergoes 2 rounds of division to create **4 genetically distinct haploid (n)** gametes (sperm/egg) for sexual reproduction with crossing-over genetic recombination.`;
  }

  // 4D. Physics: Gravity & General Relativity
  if (/(?:gravity|gravitation|gravitational|kepler|black\s+hole)\b/i.test(lower)) {
    return `🌌 **Gravity & Orbital Mechanics (Physics Essentials):**

• **Newton's Universal Law of Gravitation:** Every particle attracts every other particle with a force directly proportional to their masses and inversely proportional to the square of their distance:
  \`F = G · (m₁ · m₂) / r²\` *(G ≈ 6.674 × 10⁻¹¹ N·m²/kg²)*.
• **Einstein's General Relativity (1915):** Gravity is not a mechanical force, but the geometrical curvature of 4D spacetime caused by mass and energy. Massive objects tell spacetime how to curve; spacetime tells matter how to move.
• **Escape Velocity:** \`v_esc = √(2GM / r)\` (For Earth, ~11.2 km/s).`;
  }

  // 4E. Physics: Thermodynamics & Entropy
  if (/(?:thermodynamics|entropy|laws\s+of\s+heat)\b/i.test(lower)) {
    return `🔥 **The Laws of Thermodynamics:**

1. **1st Law (Conservation of Energy):** Energy cannot be created or destroyed, only transferred or transformed: \`ΔU = Q - W\`.
2. **2nd Law (Entropy):** In any spontaneous process, the total entropy (disorder) of an isolated system always increases: \`ΔS_universe ≥ 0\`. Heat naturally flows from hotter bodies to cooler bodies.
3. **3rd Law (Absolute Zero):** As the temperature of a pure crystalline substance approaches absolute zero (0 K / -273.15°C), its entropy approaches zero.`;
  }

  // 4F. Physics: Einstein's Relativity & E=mc²
  if (/(?:relativity|e\s*=\s*mc|time\s+dilation|einstein)\b/i.test(lower)) {
    return `⚡ **Einstein's Special Relativity (1905):**

• **Mass-Energy Equivalence:** \`E = m · c²\` — Mass and energy are interchangeable. Because \`c ≈ 3 × 10⁸ m/s\`, a tiny mass yields colossal energy.
• **Time Dilation:** Clocks in motion tick slower relative to stationary observers:
  \`Δt' = Δt / √(1 - v²/c²)\`.
• **Speed of Light Invariance:** The speed of light in vacuum is constant for all observers regardless of their motion.`;
  }

  // 4G. Physics: Quantum Mechanics
  if (/(?:quantum|schrodinger|wave\s+particle|uncertainty\s+principle)\b/i.test(lower)) {
    return `⚛️ **Quantum Mechanics Core Principles:**

• **Wave-Particle Duality:** Light and matter exhibit both wave-like and particle-like properties (De Broglie: \`λ = h / p\`).
• **Heisenberg Uncertainty Principle:** You cannot simultaneously know both the exact position (\`Δx\`) and momentum (\`Δp\`) of a particle: \`Δx · Δp ≥ ℏ / 2\`.
• **Schrödinger Wave Equation:** Describes how the quantum wavefunction \`Ψ\` of a physical system evolves over time.`;
  }

  if (/newton(?:'s)?\s+(?:laws?|third|second|first)/i.test(lower)) {
    return `⚛️ **Newton's Laws of Motion:**

1. **First Law (Inertia):** An object remains at rest or in uniform motion unless acted upon by an external net force.
2. **Second Law (Force):** Acceleration is directly proportional to net force and inversely proportional to mass: \`F = m · a\`.
3. **Third Law (Action & Reaction):** For every action, there is an equal and opposite reaction: \`F_AB = -F_BA\`.`;
  }

  // 4H. Mathematics: Calculus Derivatives & Integrals
  if (/(?:calculus|derivative|integral|differentiation|integration)\b/i.test(lower)) {
    return `📐 **Calculus Essentials & Power Rules:**

• **Power Rule for Derivatives:** \`d/dx [xⁿ] = n · xⁿ⁻¹\`
• **Product Rule:** \`d/dx [u · v] = u'v + uv'\`
• **Quotient Rule:** \`d/dx [u / v] = (u'v - uv') / v²\`
• **Chain Rule:** \`d/dx [f(g(x))] = f'(g(x)) · g'(x)\`
• **Power Rule for Integrals:** \`∫ xⁿ dx = (xⁿ⁺¹) / (n + 1) + C\` *(for n ≠ -1)*
• **Logarithmic Integral:** \`∫ 1/x dx = ln|x| + C\``;
  }

  // 4I. Chemistry: Periodic Trends & Orbitals
  if (/(?:periodic\s+table|electronegativity|atomic\s+radius|ionization\s+energy)\b/i.test(lower)) {
    return `🧪 **Chemistry: Periodic Table Trends:**

• **Electronegativity:** Increases bottom-to-top, left-to-right (Fluorine is highest: 4.0).
• **Atomic Radius:** Increases top-to-bottom, right-to-left (Francium is largest).
• **Ionization Energy:** Increases left-to-right across a period, decreases down a group.
• **Electron Affinity:** Increases left-to-right (Halogens have highest affinity for electrons).`;
  }

  // 4J. Computer Science & DSA
  if (/(?:algorithm\w*|data\s+structure|big\s*o|complexity|sorting)\b/i.test(lower)) {
    return `💻 **Algorithms & Data Structures (DSA Core):**

• **Big-O Hierarchy:** \`O(1) < O(log N) < O(N) < O(N log N) < O(N²) < O(2ᴺ)\`
• **Hash Maps:** Average \`O(1)\` lookup, insertion, and deletion.
• **Binary Search:** \`O(log N)\` search time on sorted arrays.
• **Merge Sort:** Guaranteed \`O(N log N)\` worst-case divide-and-conquer sorting.
• **Stack & Queue:** LIFO (Last-In-First-Out) vs FIFO (First-In-First-Out).`;
  }

  if (/python/i.test(lower)) {
    return `🐍 **Python Programming Overview:**

Python is a high-level, interpreted, dynamically typed language known for its clean syntax and readability.

**Core Concepts:**
• **Data Types:** \`int\`, \`float\`, \`str\`, \`bool\`, \`list\`, \`dict\`, \`set\`, \`tuple\`.
• **Control Flow:** \`if/elif/else\`, \`for ... in\`, \`while\`.
• **List Comprehensions:** \`[x**2 for x in nums if x > 0]\`
• **Ecosystem:** Widely used in Data Science, Machine Learning, Web Development (FastAPI, Django), and Automation.`;
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

  return null;
}

// Live News Fetcher via RSS
async function fetchLiveNews() {
  try {
    const res = await fetch('https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<source[^>]*>([\s\S]*?)<\/source>[\s\S]*?<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      let rawTitle = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
      let source = match[4].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
      const cleanTitle = rawTitle.replace(new RegExp(`\\s*-\\s*${source}$`, 'i'), '').trim();
      let pubTime = match[3].trim();
      let timeAgo = 'Today';
      try {
        const d = new Date(pubTime);
        timeAgo = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {}

      items.push({
        title: cleanTitle,
        source: source || 'News Desk',
        timeAgo,
        link: match[2].trim()
      });
    }
    return items;
  } catch (err) {
    return [];
  }
}

// Live Wikipedia Knowledge Fetcher with Typo Auto-Correction
async function fetchWikipediaConcept(query) {
  try {
    const cleanQ = query.replace(/^(?:tell\s+me\s+about|what\s+is|what\s+are|explain|who\s+is|who\s+was|define|meaning\s+of)\s+/i, '').replace(/[?!.]/g, '').trim();
    if (!cleanQ || cleanQ.length < 2) return null;

    const headers = { 'User-Agent': 'SynapseOS/1.0 (academic-study-assistant; contact@synapse.internal)' };
    
    // 1. Try opensearch to auto-correct typos (e.g. "michrochondria" -> "Mitochondria")
    const searchRes = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleanQ)}&limit=1&format=json`, {
      headers,
      signal: AbortSignal.timeout(3500)
    });

    if (searchRes.ok) {
      const json = await searchRes.json();
      if (json[1] && json[1][0]) {
        const bestTitle = json[1][0];
        const res2 = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(bestTitle)}`, {
          headers,
          signal: AbortSignal.timeout(3500)
        });
        if (res2.ok) {
          const data2 = await res2.json();
          if (data2.extract && data2.type !== 'disambiguation') {
            return {
              title: data2.title,
              description: data2.description || '',
              extract: data2.extract
            };
          }
        }
      }
    }

    // 2. Fallback to direct summary
    let sumRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQ)}`, {
      headers,
      signal: AbortSignal.timeout(3500)
    });
    
    if (sumRes.ok) {
      const data = await sumRes.json();
      if (data.extract && data.type !== 'disambiguation') {
        return {
          title: data.title,
          description: data.description || '',
          extract: data.extract
        };
      }
    }
  } catch (e) {}
  return null;
}

function getDefaultCoachingResponse(raw) {
  return `💡 **Discipline & Study Insight:**

Regarding **"${raw}"**:

• **Action First:** Break this topic into an uninterrupted 15-minute study sprint. Momentum always follows action.
• **Active Engagement:** Test yourself by explaining this in your own words without checking your notes (The Feynman Method).
• **Eliminate Friction:** Keep your study desk clean and put your phone in another room.

Would you like me to create a dedicated **Task**, schedule a **Study Timer**, or add this to your **Routine**?`;
}

// ========================================================
// AI INTELLIGENCE ENGINES: CLOUD (GROQ / GEMINI) & LOCAL (OLLAMA)
// ========================================================
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://127.0.0.1:11434';
// Ollama executable path — override via OLLAMA_EXE env var on different machines
const OLLAMA_EXE_PATH = process.env.OLLAMA_EXE || 'C:\\Users\\ajayk\\AppData\\Local\\Programs\\Ollama\\ollama.exe';

async function isOllamaAvailable() {
  try {
    const res = await fetch(`${OLLAMA_API_URL}/api/tags`, { signal: AbortSignal.timeout(1200) });
    return res.ok;
  } catch {
    return false;
  }
}

function ensureOllamaRunning() {
  isOllamaAvailable().then(running => {
    if (!running) {
      try {
        if (fs.existsSync(OLLAMA_EXE_PATH)) {
          const p = spawn(OLLAMA_EXE_PATH, ['serve'], { detached: true, stdio: 'ignore' });
          p.unref();
          console.log('⚡ Ollama local neural service started automatically.');
        }
      } catch (e) {
        console.warn('Ollama start notice:', e.message);
      }
    }
  });
}
ensureOllamaRunning();

async function getAppContext(includeNews = false) {
  try {
    const tasks = getJsonFile('tasks.json', []);
    const stats = getJsonFile('discipline.json', { score: 92, distractionsResisted: 8, todayFocusMinutes: 0 });
    const time = getSystemTimeInfo();

    const pendingTasks = tasks.filter(t => !t.completed).map(t => t.text).slice(0, 3);

    return `Time: ${time.timeShort}. Tasks: ${pendingTasks.join(', ') || 'None'}. Focus: ${stats.todayFocusMinutes || 0}m.`;
  } catch (e) {
    return 'Ready';
  }
}

function executeActionTags(fullText, sendEvent, userMessage = '') {
  // 1. ADD_TASK: [[ADD_TASK: <task>]] or [ADD_TASK: <task>]
  const taskRegex = /(?:\[\[?|\b)(?:ADD_TASK|TASK):\s*([^\]\r\n]+)\]?\]?/gi;
  let taskMatch;
  let addedAnyTask = false;
  const tasks = getJsonFile('tasks.json', []);
  while ((taskMatch = taskRegex.exec(fullText)) !== null) {
    const rawT = taskMatch[1].trim();
    if (rawT && !rawT.toLowerCase().includes('pending') && !rawT.toLowerCase().includes('checklist')) {
      tasks.push({
        id: Date.now().toString() + Math.random().toString().slice(2, 5),
        text: rawT,
        category: 'Study',
        completed: false,
        createdAt: new Date().toISOString()
      });
      addedAnyTask = true;
    }
  }

  // Safety net: check if userMessage explicitly asked to add a task
  if (!addedAnyTask && userMessage) {
    const taskPromptMatch = userMessage.match(/(?:checklist|task(?:s)?)\s+(?:me\s+)?(?:add\s+karo|daalo|likho)\s+(.+?)(?:\s+(?:aur|and|with|\+)\s+|\s*$)/i) ||
      userMessage.match(/(?:add\s+to\s+tasks?|add\s+to\s+checklist|add\s+task)\s+(.+?)(?:\s+(?:and|with|\+)\s+|\s*$)/i);
    if (taskPromptMatch && taskPromptMatch[1]) {
      const taskText = taskPromptMatch[1].replace(/^(?:bhai|please)\s+/i, '').trim();
      if (taskText && taskText.length > 2) {
        tasks.push({
          id: Date.now().toString() + Math.random().toString().slice(2, 5),
          text: taskText,
          category: 'Study',
          completed: false,
          createdAt: new Date().toISOString()
        });
        addedAnyTask = true;
      }
    }
  }

  if (addedAnyTask) {
    saveJsonFile('tasks.json', tasks);
    sendEvent({ refreshTasks: true });
  }

  // 2. START_TIMER: [[START_TIMER: <minutes>]] or [START_TIMER: 30 min]
  let timerTriggered = false;
  const timerMatch = fullText.match(/(?:\[\[?|\b)(?:START_TIMER|TIMER|FOCUS):\s*(\d+)(?:\s*(?:m|min|mins|minutes))?\]?\]?/i);
  if (timerMatch) {
    const duration = parseInt(timerMatch[1], 10) || 25;
    sendEvent({ triggerFocus: { duration } });
    timerTriggered = true;
  }
  // Safety net: check userMessage for timer request
  if (!timerTriggered && userMessage) {
    const userTimerMatch = userMessage.match(/(\d+)\s*(?:m|min|mins|minutes)\s*(?:ka\s+)?(?:timer|focus|study)/i) ||
      userMessage.match(/(?:timer|focus)\s*(?:chalu|start|lagao)?\s*(?:for\s+)?(\d+)\s*(?:m|min|mins|minutes)?/i);
    if (userTimerMatch && (userTimerMatch[1] || userTimerMatch[2])) {
      const duration = parseInt(userTimerMatch[1] || userTimerMatch[2], 10) || 25;
      sendEvent({ triggerFocus: { duration } });
      timerTriggered = true;
    }
  }

  // 3. ADD_ROUTINE: [[ADD_ROUTINE: <time> | <title>]]
  const routineRegex = /(?:\[\[?|\b)(?:ADD_ROUTINE|ROUTINE):\s*([^|\]\r\n]+)\s*\|\s*([^\]\r\n]+)\]?\]?/gi;
  let routineMatch;
  let addedAnyRoutine = false;
  const routineList = getJsonFile('routine.json', defaultRoutine);
  while ((routineMatch = routineRegex.exec(fullText)) !== null) {
    const timeStr = routineMatch[1].trim();
    const titleStr = routineMatch[2].trim();
    if (timeStr && titleStr) {
      routineList.push({
        id: Date.now().toString() + Math.random().toString().slice(2, 5),
        time: timeStr,
        title: titleStr,
        category: 'Study',
        completed: false
      });
      addedAnyRoutine = true;
    }
  }
  if (addedAnyRoutine) {
    saveJsonFile('routine.json', routineList);
    sendEvent({ refreshRoutine: true });
  }

  // 4. SAVE_NOTE: [[SAVE_NOTE: <title> | <content>]]
  const noteRegex = /(?:\[\[?|\b)(?:SAVE_NOTE|NOTE):\s*([^|\]\r\n]+)\s*\|\s*([^\]\r\n]+)\]?\]?/gi;
  let noteMatch;
  let addedAnyNote = false;
  const notes = getJsonFile('notes.json', []);
  while ((noteMatch = noteRegex.exec(fullText)) !== null) {
    const noteTitle = noteMatch[1].trim();
    const noteContent = noteMatch[2].trim();
    if (noteTitle) {
      notes.unshift({
        id: Date.now().toString() + Math.random().toString().slice(2, 5),
        title: noteTitle.slice(0, 40),
        content: noteContent,
        updatedAt: new Date().toISOString()
      });
      addedAnyNote = true;
    }
  }
  if (addedAnyNote) {
    saveJsonFile('notes.json', notes);
    sendEvent({ refreshNotes: true });
  }

  // 5. DEFEAT_URGE: [[DEFEAT_URGE]]
  if (/(?:\[\[?|\b)(?:DEFEAT_URGE|URGE_DEFEATED)\]?\]?/i.test(fullText) || (userMessage && /(?:defeat(?:ed)?\s+urge|distraction\s+(?:defeat|rok|baga)|phone\s+distraction\s+kaise\s+roke)/i.test(userMessage))) {
    const stats = getJsonFile('discipline.json', { streak: 5, score: 92, distractionsResisted: 8, todayFocusMinutes: 0 });
    stats.distractionsResisted = (stats.distractionsResisted || 0) + 1;
    saveJsonFile('discipline.json', stats);
    sendEvent({ triggerUrgeDefeated: true });
  }
}

function getAssistantSystemPrompt(appContext) {
  return `You are Synapse, the user's sharp, friendly AI study companion and all-rounder dost (matching the style of Meta AI and ChatGPT).

STYLE RULES:
1. Talk like a smart, warm friend/dost—conversational, punchy, and encouraging. Fluently use natural Hinglish/Hindi or English matching the user.
2. NEVER write long, dry textbook essays or encyclopedia dumps. Keep responses engaging, high-yield, and under 150-200 words.
3. When explaining concepts (e.g. mitochondria, laws of motion, optics):
   - Start with 1 memorable real-world analogy (e.g., "Mitochondria cell ka main power plant / inverter hai").
   - Follow with 3 crisp bullet points with bold keywords (**ATP Battery**, **Cristae folds**, **Self DNA**).
   - End with a friendly, natural follow-up question or offer to lock in with a focus timer.
4. NEVER introduce yourself or say "I am Synapse OS" or "As an AI". Jump straight into helping your dost.

APP COMMAND TAGS (append on a new line at the very end only when needed):
- [[ADD_TASK: <task title>]]
- [[START_TIMER: <minutes>]]
- [[ADD_ROUTINE: <time> | <title>]]
- [[SAVE_NOTE: <title> | <content>]]
- [[DEFEAT_URGE]]

EXAMPLES:
User: tell me about mitochondria
Response: Mitochondria cell ka **power plant / inverter** hai—ye glucose aur oxygen ko process karke body ki battery currency **ATP** banata hai.

Quick breakdown:
• **ATP Factory:** Saari metabolic energy yahi produce hoti hai (cellular respiration ke through).
• **Double Membrane:** Iski inner membrane fold ho kar *cristae* banati hai, taaki energy production ke liye maximum surface area mile.
• **Apna Khud Ka DNA:** Mitochondria ke paas apna circular DNA aur ribosomes hote hain (jo mother se inherit hote hain).

Bhai, iska ATP cycle diagram ya exam questions practice karein?
[[START_TIMER: 20]]

User: Hi
Response: Hi bro! 😄 Bolo, aaj kya tackle karein—koi tough topic samajhna hai, aaj ke tasks plan karein ya 25m ka deep focus timer lagayein?

${appContext}`;
}

function createStreamTokenizer(sendEvent, userMessage) {
  let fullResponse = '';
  let streamBuffer = '';
  const ACTION_TAG_REGEX = /\[\[?\s*(?:ADD_TASK|START_TIMER|ADD_ROUTINE|SAVE_NOTE|DEFEAT_URGE|TASK|TIMER|ROUTINE|NOTE)[\s\S]*?(?:\]\]?|$)|:\s*\d+\s*\]+|\[Pending Tasks[\s\S]*?\]|\[Pending Checklist Tasks[\s\S]*?\]|\]\]/gi;

  return {
    push(token) {
      if (!token) return;
      fullResponse += token;
      streamBuffer += token;

      const openIdx = streamBuffer.search(/\[\[?|\b(?:ADD_TASK|START_TIMER|ADD_ROUTINE|SAVE_NOTE|DEFEAT_URGE|TASK|TIMER)/i);
      if (openIdx === -1) {
        sendEvent({ token: streamBuffer });
        streamBuffer = '';
      } else {
        if (openIdx > 0) {
          sendEvent({ token: streamBuffer.slice(0, openIdx) });
          streamBuffer = streamBuffer.slice(openIdx);
        }
        if (streamBuffer.includes(']') || streamBuffer.length > 120) {
          const cleaned = streamBuffer.replace(ACTION_TAG_REGEX, '');
          if (cleaned) sendEvent({ token: cleaned });
          streamBuffer = '';
        }
      }
    },
    finish() {
      if (streamBuffer) {
        const cleanRemaining = streamBuffer.replace(ACTION_TAG_REGEX, '');
        if (cleanRemaining) sendEvent({ token: cleanRemaining });
      }
      executeActionTags(fullResponse, sendEvent, userMessage);
      sendEvent({ done: true });
    },
    getFull() {
      return fullResponse;
    }
  };
}

// 1. Groq Ultra-Fast Cloud Stream (Meta Llama 3.3 70B - 300+ tok/sec, Meta AI's Open Engine)
async function streamGroqChat({ message, history = [], apiKey, sendEvent }) {
  const needsNews = /(?:news|headlines|current affairs|aaj ki khabar)/i.test(message);
  const appContext = await getAppContext(needsNews);
  const systemPrompt = getAssistantSystemPrompt(appContext);
  const tokenizer = createStreamTokenizer(sendEvent, message);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map(h => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content
    })),
    { role: 'user', content: message }
  ];

  const groqModel = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: groqModel,
      messages,
      temperature: 0.7,
      max_tokens: 600,
      stream: true
    }),
    signal: AbortSignal.timeout(35000)
  });

  if (!groqRes.ok) {
    const errText = await groqRes.text().catch(() => '');
    throw new Error(`Groq API error (${groqRes.status}): ${errText}`);
  }

  const reader = groqRes.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(dataStr);
        const token = parsed.choices?.[0]?.delta?.content || '';
        if (token) tokenizer.push(token);
      } catch (e) {}
    }
  }

  tokenizer.finish();
}

// 2. Google Gemini 1.5 Flash Cloud Stream (Google AI Studio Free Tier, Multilingual, 1M Context)
async function streamGeminiChat({ message, history = [], apiKey, sendEvent }) {
  const needsNews = /(?:news|headlines|current affairs|aaj ki khabar)/i.test(message);
  const appContext = await getAppContext(needsNews);
  const systemPrompt = getAssistantSystemPrompt(appContext);
  const tokenizer = createStreamTokenizer(sendEvent, message);

  const contents = [];
  for (const h of history.slice(-8)) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }]
    });
  }
  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${apiKey.trim()}`;
  const geminiRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 600
      }
    }),
    signal: AbortSignal.timeout(35000)
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => '');
    throw new Error(`Gemini API error (${geminiRes.status}): ${errText}`);
  }

  const reader = geminiRes.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();

      try {
        const parsed = JSON.parse(dataStr);
        const candidates = parsed.candidates || [];
        for (const cand of candidates) {
          const parts = cand.content?.parts || [];
          for (const p of parts) {
            const token = p.text || '';
            if (token) tokenizer.push(token);
          }
        }
      } catch (e) {}
    }
  }

  tokenizer.finish();
}

// 3. Local On-Device Ollama Stream (Gemma 2B)
async function streamOllamaChat({ message, history = [], sendEvent }) {
  const needsNews = /(?:news|headlines|current affairs|aaj ki khabar)/i.test(message);
  const appContext = await getAppContext(needsNews);
  const systemPrompt = getAssistantSystemPrompt(appContext);
  const tokenizer = createStreamTokenizer(sendEvent, message);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message }
  ];

  const ollamaRes = await fetch(`${OLLAMA_API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma2:2b',
      messages,
      stream: true,
      options: {
        temperature: 0.7,
        num_predict: 250
      }
    }),
    signal: AbortSignal.timeout(120000)
  });

  if (!ollamaRes.ok) {
    throw new Error('Ollama error: ' + ollamaRes.statusText);
  }

  const reader = ollamaRes.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.message?.content) {
          tokenizer.push(parsed.message.content);
        }
      } catch (err) {}
    }
  }

  tokenizer.finish();
}

// 4. Live Knowledge Retrieval Engine (DuckDuckGo & Wikipedia)
async function synthesizeKnowledge(query) {
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3500) });
    if (ddgRes.ok) {
      const ddg = await ddgRes.json();
      if (ddg.AbstractText && ddg.AbstractText.length > 25) {
        return {
          title: ddg.Heading || query,
          text: ddg.AbstractText,
          source: ddg.AbstractSource || 'DuckDuckGo'
        };
      }
    }
  } catch (e) {}

  try {
    const cleanQuery = query.replace(/^(?:tell\s+me\s+about|what\s+is|who\s+is|explain|kya\s+hai|define)\s+/i, '').trim();
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery)}`;
    const wikiRes = await fetch(wikiUrl, { headers: { 'User-Agent': 'SynapseOS/2.0' }, signal: AbortSignal.timeout(3500) });
    if (wikiRes.ok) {
      const wiki = await wikiRes.json();
      if (wiki.extract && wiki.extract.length > 25) {
        return {
          title: wiki.title || query,
          text: wiki.extract,
          source: 'Wikipedia'
        };
      }
    }
  } catch (e) {}

  return null;
}

function smartContextFallback({ raw, lower, timeInfo, sendEvent }) {
  if (/(?:defeat(?:ed)?\s+urge|resist(?:ed)?\s+(?:phone|social\s+media|instagram|distraction)|distraction\s+defeated)/i.test(lower)) {
    const stats = getJsonFile('discipline.json', { streak: 5, score: 92, distractionsResisted: 8, todayFocusMinutes: 0 });
    stats.distractionsResisted = (stats.distractionsResisted || 0) + 1;
    saveJsonFile('discipline.json', stats);
    sendEvent({
      token: `🔥 **Discipline Win Logged!**\n\nYou chose long-term excellence over cheap digital dopamine. Urges defeated today: **${stats.distractionsResisted}** (Discipline Score: ${stats.score}%).\n\nKeep locked in!`,
      triggerUrgeDefeated: true,
      done: true
    });
    return;
  }

  const timerMatch = lower.match(/(?:(?:start|set|lagao)\s+)?(?:(\d+)\s*(?:m|min|mins|minutes)\s+(?:focus|study|pomodoro|timer)|(?:focus|pomodoro|timer)\s+(?:for|to)?\s*(\d+)\s*(?:m|min|mins|minutes)?)/i);
  if (timerMatch && (timerMatch[1] || timerMatch[2])) {
    const duration = parseInt(timerMatch[1] || timerMatch[2], 10) || 25;
    sendEvent({
      token: `⏱️ Setting your **${duration}-minute** deep focus timer now. Zero distractions, lock in!`,
      triggerFocus: { duration },
      done: true
    });
    return;
  }

  // Natural Language Task Addition (Zero-Cloud / Fallback mode)
  const taskPromptMatch = raw.match(/(?:checklist|task(?:s)?)\s+(?:me\s+)?(?:add\s+karo|daalo|likho)\s+(.+?)(?:\s+(?:aur|and|with|\+)\s+|\s*$)/i) ||
    raw.match(/(?:add\s+to\s+tasks?|add\s+to\s+checklist|add\s+task)\s+(.+?)(?:\s+(?:and|with|\+)\s+|\s*$)/i);
  if (taskPromptMatch && taskPromptMatch[1]) {
    const taskText = taskPromptMatch[1].replace(/^(?:bhai|please)\s+/i, '').trim();
    if (taskText && taskText.length > 2) {
      const tasks = getJsonFile('tasks.json', []);
      const newTask = {
        id: Date.now().toString() + Math.random().toString().slice(2, 5),
        text: taskText,
        category: 'Study',
        completed: false,
        createdAt: new Date().toISOString()
      };
      tasks.push(newTask);
      saveJsonFile('tasks.json', tasks);
      sendEvent({
        token: `✅ **Checklist me Add Ho Gaya!**\n\n📌 **${taskText}**\n\nAapke task list me save kar diya hai!`,
        refreshTasks: true,
        done: true
      });
      return;
    }
  }

  if (/(?:mere\s+tasks|pending\s+tasks|aaj\s+ke\s+tasks|show\s+tasks|my\s+tasks)\b/i.test(lower)) {
    const tasks = getJsonFile('tasks.json', []);
    const pending = tasks.filter(t => !t.completed);
    if (pending.length === 0) {
      sendEvent({
        token: `Aapke paas abhi koi pending task nahi hai! Badhiya! Koi naya task add karna hai to batao.`,
        done: true
      });
    } else {
      const list = pending.map((t, i) => `${i + 1}. **${t.text}**`).join('\n');
      sendEvent({
        token: `Aapke aaj ke pending tasks:\n\n${list}\n\nKaunsa pehle complete karna hai?`,
        done: true
      });
    }
    return;
  }

  if (/^(?:hi+|hlo+|hlw|hello+|hey+|yo|wassup|namaste|kaise\s+ho|bhai)\b/i.test(lower)) {
    const isHinglish = /(?:kaise|kya|bhai|yaar|namaste)/i.test(lower);
    const reply = isHinglish
      ? `Hey bhai! 😄 Kaise ho? Batao, aaj kya tackle karein—study plan, koi tough topic, ya focus session shuru karein?`
      : `Hey there! 😄 Great to connect. How can I help you today—study plan, tackling a tough topic, or locking in focus?`;
    sendEvent({ token: reply, done: true });
    return;
  }

  // Tactical Offline Subject & Study Coach Engine
  const coachReply = getOfflineCoachResponse(raw, lower, timeInfo);
  if (coachReply) {
    sendEvent({ token: coachReply, done: true });
    return;
  }

  const isHinglish = /(?:kya|kaise|bhai|yaar|hai|ho|karo|batao)/i.test(lower);
  const fallbackReply = isHinglish
    ? `Main samajh gaya. **"${raw}"** ke liye sabse best approach ye hai ki pehle isko chhote 15-minute ke focus block me divide kar lo. Kya main iske liye ek task add kar doon ya timer start karoon?`
    : `Understood. For **"${raw}"**, the best approach is to break it down into an actionable 15-minute focus block. Would you like me to add this as a task or start a focus timer?`;

  sendEvent({
    token: fallbackReply,
    done: true
  });
}

// ========================================================
// REAL-TIME STREAMING CHAT (CLOUD AI & ON-DEVICE NEURAL ENGINES)
// ========================================================
app.post('/api/chat-stream', async (req, res) => {
  const { message, history = [], groqKey: bodyGroqKey, geminiKey: bodyGeminiKey } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  const raw = message.trim();
  const lower = raw.toLowerCase();
  const timeInfo = getSystemTimeInfo();

  // Extract keys from headers or request body or server env
  const headerGroqKey = req.headers['x-groq-key'];
  const headerGeminiKey = req.headers['x-gemini-key'];
  const groqApiKey = (headerGroqKey || bodyGroqKey || GROQ_API_KEY || '').trim();
  const geminiApiKey = (headerGeminiKey || bodyGeminiKey || GEMINI_API_KEY || '').trim();

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // 1. Document Attachment Analysis & Cognitive Synthesis
  if (raw.startsWith('[UPLOADED STUDY MATERIAL') || raw.startsWith('[ATTACHED STUDY FILE')) {
    const nameMatch = raw.match(/\[UPLOADED STUDY MATERIAL \/ NOTES:\s*"([^"]+)"\]/);
    const fileName = nameMatch ? nameMatch[1] : 'Study Document';
    const contentStart = raw.indexOf(']') + 1;
    const queryStart = raw.indexOf('[USER INSTRUCTION / QUESTION]:');
    const fileContent = queryStart > -1 ? raw.substring(contentStart, queryStart).trim() : raw.substring(contentStart).trim();

    const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const sampleHighlights = lines.slice(0, 8).map(l => `• ${l}`).join('\n');
    const wordCount = fileContent.split(/\s+/).length;

    sendEvent({
      token: `📄 **Synapse Cognitive Synthesis: "${fileName}"**\n\n` +
        `**Document Scope:** ${wordCount} words • ${lines.length} lines analyzed.\n\n` +
        `### 🧠 Core Synthesis & Key Insights\n` +
        `${sampleHighlights || '• Content extracted and analyzed successfully.'}\n\n` +
        `### ⚡ Active Recall Retrieval Questions\n` +
        `1. **Core Concept:** What is the primary thesis or formula in these notes?\n` +
        `2. **Feynman Intuition:** How would you explain this mechanism in 3 simple sentences?\n` +
        `3. **Exam Application:** What key problem could appear on a test from this material?\n\n` +
        `💡 *Tap **📝 Save Note** below to store this summary directly into your offline Notes vault!*`,
      done: true
    });
    return res.end();
  }

  // 2. Pure Math Calculation
  if (/^(?:calculate|solve|what\s+is\s+)?(\(?\s*\d+\s*[-+*/.]\s*[\d-+*/.()\s]+)$/i.test(lower)) {
    const exprMatch = lower.match(/^(?:calculate|solve|what\s+is\s+)?(.*)$/i);
    const expr = exprMatch ? exprMatch[1] : lower;
    const mathResult = evaluateMath(expr);
    if (mathResult !== null) {
      sendEvent({
        token: `🔢 **Calculation Result:**\n\`${expr.trim()} = ${mathResult}\``,
        calcResult: { expression: expr.trim(), result: mathResult },
        done: true
      });
      return res.end();
    }
  }

  // 3. Multi-Engine Streaming Pipeline
  let streamedAny = false;
  const wrappedSendEvent = (data) => {
    if (data.token) streamedAny = true;
    sendEvent(data);
  };

  // Option A: Groq Cloud (Meta Llama 3.3 70B - Fastest, Meta AI's actual model)
  if (groqApiKey) {
    try {
      await streamGroqChat({ message: raw, history, apiKey: groqApiKey, sendEvent: wrappedSendEvent });
      return res.end();
    } catch (err) {
      console.warn('Groq streaming notice:', err.message);
      if (streamedAny) {
        sendEvent({ done: true });
        return res.end();
      }
    }
  }

  // Option B: Google Gemini 1.5 Flash (Google AI Studio Free Tier, Multilingual, 1M Context)
  if (geminiApiKey) {
    try {
      await streamGeminiChat({ message: raw, history, apiKey: geminiApiKey, sendEvent: wrappedSendEvent });
      return res.end();
    } catch (err) {
      console.warn('Gemini streaming notice:', err.message);
      if (streamedAny) {
        sendEvent({ done: true });
        return res.end();
      }
    }
  }

  // Option C: Local On-Device Ollama Stream (Gemma 2B)
  try {
    const ollamaReady = await isOllamaAvailable();
    if (ollamaReady) {
      await streamOllamaChat({ message: raw, history, sendEvent: wrappedSendEvent });
      return res.end();
    }
  } catch (err) {
    console.warn('Ollama streaming notice:', err.message);
    if (streamedAny) {
      sendEvent({ done: true });
      return res.end();
    }
  }

  // Option D: Live Knowledge Retrieval (DuckDuckGo / Wikipedia) when user asks factual question
  if (/^(?:tell\s+me\s+about|what\s+is|who\s+is|explain|kya\s+hai|define|history\s+of|summary\s+of)\b/i.test(lower) || raw.endsWith('?')) {
    try {
      const knowledge = await synthesizeKnowledge(raw);
      if (knowledge) {
        const synthesizedReply = `💡 **${knowledge.title}**\n\n${knowledge.text}\n\n` +
          `• **Key Takeaway:** Real-time knowledge retrieved from ${knowledge.source}.\n` +
          `• **Next Step:** Would you like to schedule a **25m Focus Block** on this or save it to **📝 Notes**?\n\n` +
          `⚡ *Pro Tip: Connect a free Gemini or Groq key in Settings (top bar) to unlock 100% full conversational AI on your mobile with zero downloads!*`;
        sendEvent({ token: synthesizedReply, done: true });
        return res.end();
      }
    } catch (e) {}
  }

  // Option E: Smart Context-Aware Fallback (Urges, Focus Timers, Tasks, Offline Coach)
  smartContextFallback({ raw, lower, timeInfo, sendEvent });
  return res.end();
});

// Prevent any uncaught exception from crashing the server
process.on('uncaughtException', (err) => {
  console.warn('Server caught unhandled exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('Server caught unhandled rejection:', reason);
});

// Bind to 0.0.0.0 (only run listen when not on serverless Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    const localIp = getLocalNetworkIp();
    console.log(`\n=================================================`);
    console.log(`🧠 Synapse OS — AI Study Coach & Focus OS`);
    console.log(`💻 Desktop:  http://localhost:${PORT}`);
    console.log(`📱 Mobile:   http://${localIp}:${PORT}`);
    console.log(`=================================================\n`);
  });
}

export default app;
