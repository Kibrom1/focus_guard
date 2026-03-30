// Focus Guard — Service Worker
// Handles session state, URL blocking, schedule mode, and per-domain analytics.

const DEFAULT_STATE = {
  isActive: false,
  startTime: null,
  duration: 30,
  isAllowlistMode: false,
  blockedSites: [],
  allowedSites: [],
  blockedAttempts: 0,
  scheduleEnabled: false,
  scheduleTime: '09:00',
  scheduleDuration: 30,
  allTimeFocusMinutes: 0,
  allTimeBlockedAttempts: 0,
  siteBlockCounts: {},       // { 'reddit.com': 42, ... } all-time per-domain block counts
  sessionHistory: [],        // [{ date, focusMinutes, blockedAttempts }] last 90 entries
  lastSessionStats: null,
};

function todayString() {
  return new Date().toISOString().split('T')[0];
}

async function getState() {
  return new Promise((resolve) =>
    chrome.storage.local.get(null, (data) => resolve({ ...DEFAULT_STATE, ...data }))
  );
}

async function setState(updates) {
  return new Promise((resolve) => chrome.storage.local.set(updates, resolve));
}

// ── Blocking rules ────────────────────────────────────────────────────────────

async function applyBlockingRules(state) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map((r) => r.id);
  const addRules = [];

  if (state.isAllowlistMode) {
    // Block all navigation (priority 1), then allow listed sites (priority 2)
    addRules.push({
      id: 1,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: { extensionPath: `/blocked.html?domain=Allowlist+Mode` },
      },
      condition: { urlFilter: '|http*', resourceTypes: ['main_frame'] },
    });

    (state.allowedSites || []).forEach((domain, i) => {
      addRules.push({
        id: i + 2,
        priority: 2,
        action: { type: 'allow' },
        condition: { urlFilter: `||${domain}^`, resourceTypes: ['main_frame'] },
      });
    });
  } else {
    (state.blockedSites || []).forEach((domain, i) => {
      addRules.push({
        id: i + 1,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: { extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}` },
        },
        condition: { urlFilter: `||${domain}^`, resourceTypes: ['main_frame'] },
      });
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds, addRules });
}

async function clearBlockingRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existing.map((r) => r.id);
  if (removeIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds });
  }
}

async function redirectOpenBlockedTabs(state) {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    if (!tab.url || !tab.id) continue;
    let hostname;
    try { hostname = new URL(tab.url).hostname.replace(/^www\./, ''); }
    catch { continue; }

    const shouldRedirect = state.isAllowlistMode
      ? !(state.allowedSites || []).some(
          d => hostname === d || hostname.endsWith('.' + d)
        )
      : (state.blockedSites || []).some(
          d => hostname === d || hostname.endsWith('.' + d)
        );

    if (shouldRedirect) {
      chrome.tabs.update(tab.id, {
        url: chrome.runtime.getURL(`blocked.html?domain=${encodeURIComponent(hostname)}`),
      });
    }
  }
}

// ── Session lifecycle ─────────────────────────────────────────────────────────

async function startSession(duration) {
  const state = await getState();

  if (state.isActive) {
    return { success: false, error: 'already_active' };
  }

  if (state.isAllowlistMode && (!state.allowedSites || state.allowedSites.length === 0)) {
    return { success: false, error: 'empty_allowlist' };
  }
  if (!state.isAllowlistMode && (!state.blockedSites || state.blockedSites.length === 0)) {
    return { success: false, error: 'empty_blocklist' };
  }

  await setState({ isActive: true, startTime: Date.now(), duration, blockedAttempts: 0 });
  await applyBlockingRules({ ...state, isActive: true });
  await redirectOpenBlockedTabs({ ...state, isActive: true });
  await chrome.alarms.create('sessionEnd', { delayInMinutes: duration });

  return { success: true };
}

async function endSession(earlyEnd = false) {
  const state = await getState();
  if (!state.isActive && !earlyEnd) return null;

  await chrome.alarms.clear('sessionEnd');
  await clearBlockingRules();

  const focusedMs = state.startTime ? Date.now() - state.startTime : 0;
  const focusedMinutes = earlyEnd
    ? Math.max(1, Math.round(focusedMs / 60000))
    : state.duration;

  const stats = {
    duration: focusedMinutes,
    blockedAttempts: state.blockedAttempts || 0,
  };

  const historyEntry = {
    date: todayString(),
    focusMinutes: focusedMinutes,
    blockedAttempts: stats.blockedAttempts,
  };
  const updatedHistory = [...(state.sessionHistory || []), historyEntry].slice(-90);

  await setState({
    isActive: false,
    startTime: null,
    blockedAttempts: 0,
    allTimeFocusMinutes: (state.allTimeFocusMinutes || 0) + focusedMinutes,
    allTimeBlockedAttempts: (state.allTimeBlockedAttempts || 0) + stats.blockedAttempts,
    sessionHistory: updatedHistory,
    lastSessionStats: stats,
  });

  const streak = calculateStreakFromHistory(updatedHistory);
  if ([3, 7, 14, 30].includes(streak)) {
    chrome.notifications.create(`streak-${streak}`, {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: `${streak}-day streak!`,
      message: `You've focused ${streak} days in a row. Keep it up.`,
    });
  }

  return stats;
}

// ── Per-domain block tracking ─────────────────────────────────────────────────

async function trackBlockedDomain(domain) {
  const state = await getState();
  if (!state.isActive) return;

  const counts = { ...(state.siteBlockCounts || {}) };
  counts[domain] = (counts[domain] || 0) + 1;

  await setState({
    blockedAttempts: (state.blockedAttempts || 0) + 1,
    siteBlockCounts: counts,
  });
}

function calculateStreakFromHistory(history) {
  const sessionDates = new Set(history.map((s) => s.date));
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().split('T')[0];
    if (!sessionDates.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function minutesUntilNextSunday9am() {
  const now = new Date();
  const target = new Date(now);
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
  target.setDate(now.getDate() + daysUntilSunday);
  target.setHours(9, 0, 0, 0);
  return Math.max(1, (target - now) / 60000);
}

// ── Schedule mode ─────────────────────────────────────────────────────────────

async function syncScheduleAlarm(scheduleEnabled, scheduleTime) {
  await chrome.alarms.clear('scheduleStart');
  if (!scheduleEnabled || !scheduleTime) return;

  const [hours, minutes] = scheduleTime.split(':').map(Number);
  const now = new Date();
  const trigger = new Date();
  trigger.setHours(hours, minutes, 0, 0);
  if (trigger <= now) trigger.setDate(trigger.getDate() + 1);

  await chrome.alarms.create('scheduleStart', {
    delayInMinutes: (trigger - now) / 60000,
    periodInMinutes: 24 * 60,
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await getState();
  const init = {};
  for (const [k, v] of Object.entries(DEFAULT_STATE)) {
    if (existing[k] === undefined) init[k] = v;
  }
  if (Object.keys(init).length > 0) await setState(init);
  await chrome.alarms.create('weeklySummary', {
    delayInMinutes: minutesUntilNextSunday9am(),
    periodInMinutes: 7 * 24 * 60,
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'sessionEnd') {
    await endSession(false);
  } else if (alarm.name === 'scheduleStart') {
    const state = await getState();
    if (state.scheduleEnabled && !state.isActive) {
      const result = await startSession(state.scheduleDuration || 30);
      if (result.success) {
        chrome.notifications.create('scheduleStarted', {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Focus session started',
          message: `Your scheduled ${state.scheduleDuration || 30}-minute focus session has begun.`,
        });
      }
    }
  } else if (alarm.name === 'weeklySummary') {
    const state = await getState();
    const history = state.sessionHistory || [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const weekSessions = history.filter((s) => s.date >= cutoffStr);
    const weekMinutes = weekSessions.reduce((sum, s) => sum + (s.focusMinutes || 0), 0);
    if (weekSessions.length > 0) {
      chrome.notifications.create('weeklySummary', {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Your week in focus',
        message: `${weekSessions.length} sessions · ${weekMinutes} minutes focused this week.`,
      });
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message.action) {
      case 'getState': {
        const s = await getState();
        sendResponse(s);
        break;
      }

      case 'startSession':
        sendResponse(await startSession(message.duration));
        break;

      case 'endSession':
        sendResponse(await endSession(true));
        break;

      case 'updateSites':
        if (message.isAllowlistMode) {
          await setState({ allowedSites: message.sites });
        } else {
          await setState({ blockedSites: message.sites });
        }
        sendResponse({ success: true });
        break;

      case 'updateSitesLive': {
        // Update sites AND immediately re-apply blocking rules mid-session
        const liveState = await getState();
        const update = message.isAllowlistMode
          ? { allowedSites: message.sites }
          : { blockedSites: message.sites };
        await setState(update);
        if (liveState.isActive) {
          await applyBlockingRules({ ...liveState, ...update });
        }
        sendResponse({ success: true });
        break;
      }

      case 'setMode':
        await setState({ isAllowlistMode: message.isAllowlistMode });
        sendResponse({ success: true });
        break;

      case 'trackBlocked':
        await trackBlockedDomain(message.domain || 'unknown');
        sendResponse({ success: true });
        break;

      case 'setSchedule':
        await setState({
          scheduleEnabled: message.enabled,
          scheduleTime: message.time,
          scheduleDuration: message.duration,
        });
        await syncScheduleAlarm(message.enabled, message.time);
        sendResponse({ success: true });
        break;

      case 'clearLastSession':
        await setState({ lastSessionStats: null });
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  })();
  return true; // Keep channel open for async response
});
