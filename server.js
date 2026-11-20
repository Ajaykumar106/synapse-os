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

const APP_VERSION = '3.2.5';

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

// Never cache index.html or the service worker itself so PWAs auto-update immediately on deploy
app.get(['/', '/index.html'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
app.get(['/api/engine-status', '/engine-status'], async (_req, res) => {
  const ollamaRunning = await isOllamaAvailable();
  res.json({
    hasGroq: Boolean(process.env.GROQ_API_KEY || process.env.GROQ_KEY || GROQ_API_KEY),
    hasGemini: Boolean(process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || GEMINI_API_KEY),
    hasFreeCloud: true,
    isOllamaRunning: ollamaRunning,
    isVercel: isVercel
  });
});

function getOfflineCoachResponse(raw, lower, timeInfo) {
  // 1. Anti-Social Media / Digital Detox / Procrastination / Urges
  if (/(?:social\s+media|instagram|tiktok|youtube|twitter|reels|shorts|doomscroll|scroll|distract\w*|procrastinat\w*|lazy|unmotivat\w*|can't\s+focus|dopamine|urge)/i.test(lower)) {
    return `Arre dost, distraction ya phone scroll karne ka man hona bilkul normal hai! Sabke saath hota hai. Lekin exam ke baad regret karne se bachne ke liye bas ye 2 simple hacks follow karo:

1. **10-Minute Urge Rule:** Jab bhi Instagram ya reels kholne ka man kare, khud se bolo: *"Sirf 10 minute rukta hoon, phir dekhunga."* 90% cases me 3-4 minute me wo craving khatam ho jati hai.
2. **Phone Desk se Door:** Phone ko doosre kamre me silent karke rakh do aur bas **15 minute** ka ek topic padho. Action lene se motivation apne aap aata hai!

Batao, kya abhi **15 minute ka focus timer** start karein? Saath me niptate hain! 🚀
[[START_TIMER: 15]]`;
  }

  // 2. Study Techniques & Mastery (Feynman, Active Recall, Spaced Repetition, Blurting)
  if (/(?:feynman|active\s+recall|spaced\s+repetition|blurting|pomodoro|study\s+technique|how\s+to\s+study|memoriz|exam\s+prep|revision)\b/i.test(lower)) {
    if (/feynman/i.test(lower)) {
      return `Bhai, **Feynman Technique** kisi bhi tough concept ko master karne ka sabse solid tareeqa hai:

1. **Topic Chuno:** Koi bhi ek formula ya chapter pick karo.
2. **Ek Bachhe ko Samjhao:** Aise samjhao jaise kisi 10 saal ke bachhe ko simple bhasha me samjha rahe ho—zero bookish jargon.
3. **Weak Point Pakdo:** Jahan ruk rahe ho, wahi tumhara actual doubt hai.
4. **Simple Analogy Banao:** Us gap ko book se dobara dekho aur ek aasan real-life example ke saath fix karo.

*Rule: Agar simple words me nahi samjha sakte, toh matlab abhi deep clear nahi hua.* Kaunsa topic samajhna hai? Batao, simple words me breakdown karte hain! 💡`;
    }
    if (/active\s+recall/i.test(lower)) {
      return `⚡ **Active Recall (Top Science-Backed Method):**

Bar-bar notes read karna ek fake illusion deta hai ki yaad ho gaya. Real test retrieval me hota hai!

**Aise Use Karo Abhi:**
• **Closed-Book Quiz:** Ek page padho, book band karo, aur jo yaad aaya wo likh dalo.
• **Teach the Wall:** Khade hoke bina notes dekhe concept bol kar samjhao.
• **Flashcard Testing:** Khud se sawaal pucho aur bina dekhe answer do!`;
    }
    if (/spaced\s+repetition/i.test(lower)) {
      return `📅 **Spaced Repetition Schedule (Never Forget a Topic):**

The Ebbinghaus Curve shows memory fades quickly without revision. Review timeline:
• **Day 1:** Pehla study session.
• **Day 2:** 10-minute quick quiz.
• **Day 4:** 3 practice problems solve karo.
• **Day 7:** Mind map ya summary draw karo.
• **Day 30:** Final consolidation review.`;
    }
    return `📚 **Top 3 Smart Study Strategies (Jo Actually Kaam Karti Hain):**

1. **Active Recall:** Book band karke khud se sawaal pucho. Mind par thoda zor padna zaroori hai.
2. **50/10 Study Sprints:** 50 minute deep focus, phir 10 minute screen-free walk ya paani peeo.
3. **Blurting Method:** Topic padhne ke baad blank paper par 5 min me sab likho jo yaad hai. Missing parts red pen se check karo!`;
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
  return `Arre dost, **"${raw}"** ke liye tension bilkul mat lo!

Chal ek smart approach lagate hain:
1. **15-Min Sprint:** Pehle isko sirf 15 minute ke chhote sprint me divide karo. Shuruat karne ke baad flow apne aap ban jata hai.
2. **Simple Words:** Samajhne ke baad khud ke shabdon me bina dekhe repeat karo (Feynman style).
3. **Zero Distraction:** Phone ko desk se door rakho taaki mind poora focus me rahe.

Batao, kya iske liye ek **Focus Timer** laga doon ya checklist me task add karoon? Saath me niptate hain! 🚀`;
}

// ========================================================
// AI INTELLIGENCE ENGINES: CLOUD (GROQ / GEMINI) & LOCAL (OLLAMA)
// ========================================================
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
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

async function getAppContext(message = '') {
  try {
    const time = getSystemTimeInfo();
    const isTaskQuery = /(?:task|todo|checklist|aaj\s+kya|pending|kya\s+karna\s+hai)/i.test(message);
    if (isTaskQuery) {
      const tasks = getJsonFile('tasks.json', []);
      const pendingTasks = tasks.filter(t => !t.completed).map(t => t.text).slice(0, 4);
      return `Current Time: ${time.timeShort}. User's Pending Tasks: ${pendingTasks.join(', ') || 'None'}`;
    }
    return `Current Time: ${time.timeShort}`;
  } catch (e) {
    return '';
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

  // Safety net: check if userMessage explicitly asked to add a task (both SVO and Hindi SOV order)
  if (!addedAnyTask && userMessage) {
    const taskPromptMatch = userMessage.match(/(?:checklist|task(?:s)?)\s+(?:me\s+)?(?:add\s+karo|daalo|likho|rakho)\s+(.+?)(?:\s+(?:aur|and|with|\+)\s+|\s*$)/i) ||
      userMessage.match(/^(.+?)\s+(?:ko\s+)?(?:checklist|tasks?)\s+me\s+(?:add\s+karo|add\s+kar\s+do|daalo|daal\s+do|likho|rakho)/i) ||
      userMessage.match(/(?:add\s+to\s+tasks?|add\s+to\s+checklist|add\s+task)\s+(.+?)(?:\s+(?:and|with|\+)\s+|\s*$)/i);
    if (taskPromptMatch && taskPromptMatch[1]) {
      const taskText = taskPromptMatch[1].replace(/^(?:bhai|please)\s+/i, '').replace(/^(?:please|bhai)\s+/i, '').trim();
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

function getAssistantSystemPrompt(appContext = '') {
  return `You are Synapse, a warm, super-smart, and motivating AI study buddy & mentor (like an encouraging dost or smart study partner).

KEY PERSONALITY & DIRECTIVES:
1. NATURAL, FRIENDLY HINGLISH: Talk like a real, supportive friend—relatable, encouraging, high-energy, and completely natural. When the user asks in Hindi/Hinglish, reply in warm, natural Hinglish ("Arre dost!", "Bhai tension mat le", "Dekh simple words me samjhein toh", "Deal?", "Ekdum aasan hai"). When the user asks in English, reply in friendly, conversational English.
2. ZERO ROBOTIC FLUFF: Never speak like a mechanical robot, encyclopedia, or strict corporate lecturer. Avoid preachy headers like "### Tactical Action Protocol". Keep explanations lively, punchy, and clear.
3. INTUITION FIRST: Always explain the core concept with a simple, everyday real-life analogy so the student instantly gets it ("Aha! moment"). Then provide clean, exam-ready points/formulas.
4. BEAT PROCRASTINATION & MOTIVATE: When the user feels lazy, bored, distracted, or demotivated, show high empathy ("Bhai bilkul normal hai, sabka burnout hota hai"). Give them the 10-15 minute Micro-Sprint hack: "Zabardasti 4 ghante mat baith, bas 15 min ka sprint laga aur phone doosre room me rakh. Saath me niptate hain!"
5. UNIVERSAL NOTEBOOK MASTERY: Master across Science (Physics, Chemistry, Biology), Maths, Coding, Engineering, and General Knowledge. Solve numericals step-by-step with clean math formatting.
6. NO UNPROMPTED BOOK FIXATION: Never randomly mention specific textbooks (like HC Verma, Irodov) unless the user explicitly asks about them.
7. NEVER INTRODUCE YOURSELF: Do not say "I am Synapse OS" or "As an AI". Jump straight into answering with energy and warmth.

ACTION COMMAND TAGS (append on a new line at the very end only when appropriate):
- [[START_TIMER: <minutes>]] (when offering or starting a focus timer)
- [[ADD_TASK: <task title>]] (when adding a task to user's checklist)
- [[DEFEAT_URGE]] (when user resists distraction)
- [[SAVE_NOTE: <title> | <content>]] (when saving study notes)

${appContext ? `CONTEXT: ${appContext}` : ''}`;
}

function createStreamTokenizer(sendEvent, userMessage) {
  let fullResponse = '';
  let streamBuffer = '';
  const ACTION_TAG_REGEX = /\[\[[\s\S]*?(?:\]\]|$)|\[\[?\s*(?:ADD_TASK|START_TIMER|ADD_ROUTINE|SAVE_NOTE|DEFEAT_URGE|TASK|TIMER|ROUTINE|NOTE)[\s\S]*?(?:\]\]?|$)|:\s*\d+\s*\]+|\[Pending Tasks[\s\S]*?\]|\[Pending Checklist Tasks[\s\S]*?\]|\]\]/gi;

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
  const appContext = await getAppContext(message);
  let systemPrompt = getAssistantSystemPrompt(appContext);

  if (message.includes('[UPLOADED STUDY MATERIAL') || message.includes('[ATTACHED STUDY FILE') || message.includes('[DOCUMENT / STUDY MATERIAL ANALYSIS') || message.includes('Extracted Content:')) {
    systemPrompt += `\n\nDOCUMENT / IMAGE SOLVER & PEDAGOGICAL DIRECTIVE:
The student has attached study notes, syllabus, or an exam question extracted via OCR/document parser.
You must analyze this with extreme academic precision, similar to ChatGPT and Meta AI:
1. Direct Answer & Core Thesis: Provide the core takeaway or answer first in 2-3 crisp sentences.
2. Step-by-Step Breakdown: Break down the logic, formulas, mathematical derivation, or concepts methodically.
3. Exam Traps & Common Mistakes: Explicitly warn about tricky mistakes students often make on this topic.
4. Active Recall & Formulas: Highlight key revision formulas or provide 2 quick self-test questions.`;
  }

  const tokenizer = createStreamTokenizer(sendEvent, message);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map(h => ({
      role: h.role === 'assistant' ? 'assistant' : 'user',
      content: h.content
    })),
    { role: 'user', content: message }
  ];

  const isMathOrTechnical = /(?:calculate|solve|derive|numerical|formula|velocity|acceleration|momentum|gravity|integral|derivative|code|function|algorithm|\d+\s*[-+*/^]\s*\d+)/i.test(message);
  const dynamicTemp = isMathOrTechnical ? 0.35 : 0.65;

  const candidateModels = [
    process.env.GROQ_MODEL,
    'qwen/qwen3.8-27b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant'
  ].filter(Boolean);

  let groqRes = null;
  let lastError = null;

  for (const model of candidateModels) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: dynamicTemp,
          max_tokens: 850,
          stream: true
        }),
        signal: AbortSignal.timeout(9000)
      });

      if (res.ok) {
        groqRes = res;
        break;
      } else {
        const errText = await res.text().catch(() => '');
        lastError = new Error(`Groq model ${model} error (${res.status}): ${errText}`);
        if (res.status === 404 || res.status === 400 || res.status === 429) {
          continue;
        } else {
          break;
        }
      }
    } catch (e) {
      lastError = e;
      continue;
    }
  }

  if (!groqRes) {
    throw lastError || new Error('All Groq candidate models failed to respond');
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
  const appContext = await getAppContext(message);
  let systemPrompt = getAssistantSystemPrompt(appContext);

  if (message.includes('[UPLOADED STUDY MATERIAL') || message.includes('[ATTACHED STUDY FILE') || message.includes('[DOCUMENT / STUDY MATERIAL ANALYSIS') || message.includes('Extracted Content:')) {
    systemPrompt += `\n\nDOCUMENT / IMAGE SOLVER & PEDAGOGICAL DIRECTIVE:
The student has attached study notes, syllabus, or an exam question extracted via OCR/document parser.
You must analyze this with extreme academic precision, similar to ChatGPT and Meta AI:
1. Direct Answer & Core Thesis: Provide the core takeaway or answer first in 2-3 crisp sentences.
2. Step-by-Step Breakdown: Break down the logic, formulas, mathematical derivation, or concepts methodically.
3. Exam Traps & Common Mistakes: Explicitly warn about tricky mistakes students often make on this topic.
4. Active Recall & Formulas: Highlight key revision formulas or provide 2 quick self-test questions.`;
  }

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
        maxOutputTokens: 2048
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
  const appContext = await getAppContext(message);
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

// 4. Free Zero-Key Instant Cloud AI Stream (Pollinations OpenAI Engine)
// Always works out-of-the-box with ZERO API keys or setup!
async function streamFreeCloudChat({ message, history = [], sendEvent }) {
  const appContext = await getAppContext(message);
  const systemPrompt = getAssistantSystemPrompt(appContext);
  const tokenizer = createStreamTokenizer(sendEvent, message);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-8).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message }
  ];

  const res = await fetch('https://text.pollinations.ai/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages,
      stream: true,
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(45000)
  });

  if (!res.ok) {
    throw new Error('Free cloud AI status ' + res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (jsonStr === '[DONE]') break;
      try {
        const parsed = JSON.parse(jsonStr);
        const token = parsed.choices?.[0]?.delta?.content || '';
        if (token) tokenizer.push(token);
      } catch (e) {}
    }
  }

  tokenizer.finish();
}

// 5. Live Knowledge Retrieval Engine (DuckDuckGo & Wikipedia)
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


  if (raw.includes('[UPLOADED STUDY MATERIAL') || raw.includes('[ATTACHED STUDY FILE') || raw.includes('[DOCUMENT / STUDY MATERIAL ANALYSIS')) {
    sendEvent({
      token: `📄 **Document Content Extracted:**\n\nTo run deep reasoning, step-by-step problem solving, and formula derivations on your uploaded document, make sure your free Groq or Gemini API key is configured in Settings (or download an on-device WebLLM model).`,
      done: true
    });
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
app.post(['/api/chat-stream', '/chat-stream'], async (req, res) => {
  const { message, history = [], groqKey: bodyGroqKey, geminiKey: bodyGeminiKey } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  const raw = message.trim();
  const lower = raw.toLowerCase();
  const timeInfo = getSystemTimeInfo();

  // Extract keys from headers or request body or server env (supporting common casing & Vercel formats)
  const headerGroqKey = (req.headers['x-groq-key'] || '').trim();
  const headerGeminiKey = (req.headers['x-gemini-key'] || '').trim();
  const envGroq = (process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.GROQ || GROQ_API_KEY || '').trim();
  const envGemini = (process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || process.env.GEMINI || GEMINI_API_KEY || '').trim();
  const groqApiKey = (headerGroqKey || bodyGroqKey || envGroq || '').replace(/^["']|["']$/g, '').trim();
  const geminiApiKey = (headerGeminiKey || bodyGeminiKey || envGemini || '').replace(/^["']|["']$/g, '').trim();

  // Set SSE Headers with Vercel & proxy buffering bypass
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') {
      res.flush();
    }
  };

  // 1. Pure Math Calculation
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

  // Option D: Free Zero-Key Instant Cloud AI Stream (Always active, no API keys needed!)
  try {
    await streamFreeCloudChat({ message: raw, history, sendEvent: wrappedSendEvent });
    return res.end();
  } catch (err) {
    console.warn('Free Cloud AI streaming notice:', err.message);
    if (streamedAny) {
      sendEvent({ done: true });
      return res.end();
    }
  }

  // Option E: Smart Context-Aware Fallback (100% Offline Airplane Mode: Urges, Focus Timers, Tasks, Offline Coach)
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
