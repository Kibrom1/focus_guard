// Focus Guard — Popup Script

let countdownInterval = null;
let activeAttemptsInterval = null;
let selectedDuration = 30;
let statsReturnView = 'idle';

// Polyfill for canvas.roundRect (Chrome < 99)
if (typeof CanvasRenderingContext2D !== 'undefined' &&
    !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    const radius = Math.min(typeof r === 'number' ? r : r[0], w / 2, h / 2);
    this.beginPath();
    this.moveTo(x + radius, y);
    this.arcTo(x + w, y,     x + w, y + h, radius);
    this.arcTo(x + w, y + h, x,     y + h, radius);
    this.arcTo(x,     y + h, x,     y,     radius);
    this.arcTo(x,     y,     x + w, y,     radius);
    this.closePath();
  };
}

const ERROR_MESSAGES = {
  already_active: 'A focus session is already running.',
  empty_allowlist: 'Add at least one allowed site before starting in Allowlist mode.',
  empty_blocklist: 'Add at least one site to block before starting.',
};

function friendlyError(code) {
  return ERROR_MESSAGES[code] || code || 'Could not start session.';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function showView(id) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $(id).classList.remove('hidden');
}

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatMinutes(total) {
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function todayString() {
  return new Date().toISOString().split('T')[0];
}

function cleanDomain(raw) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0];
}

function updateStartButtonState(state) {
  const sites = state.isAllowlistMode
    ? (state.allowedSites || [])
    : (state.blockedSites || []);
  const empty = sites.length === 0;
  $('btn-start').disabled = empty;
  $('btn-start').title = empty
    ? (state.isAllowlistMode
        ? 'Add at least one allowed site first.'
        : 'Add at least one site to block first.')
    : '';
}

async function goToStats(from) {
  statsReturnView = from;
  const state = await sendMessage({ action: 'getState' });
  renderStatsView(state);
}

// ── Idle View ─────────────────────────────────────────────────────────────────

function renderIdleView(state) {
  showView('view-idle');

  const isAllow = state.isAllowlistMode || false;

  // Mode picker
  $('mode-btn-block').classList.toggle('active', !isAllow);
  $('mode-btn-allow').classList.toggle('active', isAllow);

  // Site list
  renderSiteList(isAllow ? (state.allowedSites || []) : (state.blockedSites || []), isAllow);

  // Duration picker — restore last used
  selectedDuration = state.duration || 30;
  let matchesPreset = false;
  document.querySelectorAll('.duration-btn').forEach((btn) => {
    const isMatch = parseInt(btn.dataset.min) === selectedDuration;
    btn.classList.toggle('active', isMatch);
    if (isMatch) matchesPreset = true;
  });

  const customWrapper = $('custom-duration-wrapper');
  if (customWrapper) {
    if (!matchesPreset) {
      customWrapper.classList.add('active');
      $('custom-duration-input').value = Math.max(1, Math.floor(selectedDuration / 60));
    } else {
      customWrapper.classList.remove('active');
      $('custom-duration-input').value = '';
    }
  }

  updateStartButtonState(state);
}

function renderSiteList(sites, isAllowlistMode) {
  const list = $('site-list');
  list.innerHTML = '';
  sites.forEach((domain) => {
    const li = document.createElement('li');
    li.className = 'site-item';
    li.innerHTML = `
      <span>${domain}</span>
      <button class="site-remove" data-domain="${domain}" title="Remove">×</button>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('.site-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const domain = btn.dataset.domain;
      let cancelled = false;

      const toast = document.createElement('div');
      toast.className = 'undo-toast';
      toast.innerHTML = `<span>${domain} removed</span><button class="undo-toast-btn">UNDO</button>`;
      document.body.appendChild(toast);

      toast.querySelector('.undo-toast-btn').addEventListener('click', () => {
        cancelled = true;
        toast.remove();
      });

      setTimeout(async () => {
        toast.remove();
        if (cancelled) return;
        const state = await sendMessage({ action: 'getState' });
        const currentList = isAllowlistMode ? (state.allowedSites || []) : (state.blockedSites || []);
        const updated = currentList.filter((d) => d !== domain);
        await sendMessage({ action: 'updateSites', sites: updated, isAllowlistMode });
        renderSiteList(updated, isAllowlistMode);
        updateStartButtonState({ ...state, [isAllowlistMode ? 'allowedSites' : 'blockedSites']: updated });
      }, 4000);
    });
  });
}

// ── Active View ───────────────────────────────────────────────────────────────

function renderActiveView(state) {
  showView('view-active');

  const isAllow = state.isAllowlistMode || false;
  const sites = isAllow ? (state.allowedSites || []) : (state.blockedSites || []);

  $('active-sites-count').textContent = sites.length;
  $('active-sites-label').textContent = isAllow ? 'sites allowed' : 'sites blocked';
  $('active-attempts').textContent = state.blockedAttempts || 0;

  // Mode pill
  const pill = $('active-mode-pill');
  pill.textContent = isAllow ? '✅ Allowlist' : '🚫 Blocklist';
  pill.className = 'mode-pill ' + (isAllow ? 'mode-pill-allow' : 'mode-pill-block');

  renderActiveSiteList(sites, isAllow);
  startCountdown(state);
  startAttemptsRefresh();
}

function renderActiveSiteList(sites, isAllow) {
  const list = $('active-site-list');
  list.innerHTML = '';
  sites.forEach((domain) => {
    const li = document.createElement('li');
    li.className = 'site-item';
    li.innerHTML = `<span>${domain}</span><button class="site-remove" data-domain="${domain}" title="Remove">×</button>`;
    list.appendChild(li);
  });

  list.querySelectorAll('.site-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const domain = btn.dataset.domain;
      let cancelled = false;

      const toast = document.createElement('div');
      toast.className = 'undo-toast';
      toast.innerHTML = `<span>${domain} removed</span><button class="undo-toast-btn">UNDO</button>`;
      document.body.appendChild(toast);

      toast.querySelector('.undo-toast-btn').addEventListener('click', () => {
        cancelled = true;
        toast.remove();
      });

      setTimeout(async () => {
        toast.remove();
        if (cancelled) return;
        const state = await sendMessage({ action: 'getState' });
        const currentIsAllow = state.isAllowlistMode || false;
        const current = currentIsAllow ? (state.allowedSites || []) : (state.blockedSites || []);
        const updated = current.filter((d) => d !== domain);
        await sendMessage({ action: 'updateSitesLive', sites: updated, isAllowlistMode: currentIsAllow });
        $('active-sites-count').textContent = updated.length;
        renderActiveSiteList(updated, currentIsAllow);
      }, 4000);
    });
  });
}

function startCountdown(state) {
  clearInterval(countdownInterval);

  const endTime = state.startTime + state.duration * 60 * 1000;

  function tick() {
    const remaining = endTime - Date.now();
    if (remaining <= 0) {
      $('countdown').textContent = '00:00';
      clearInterval(countdownInterval);
      clearInterval(activeAttemptsInterval);
      // Session ended — reload to show done screen
      init();
      return;
    }
    $('countdown').textContent = formatTime(remaining);
  }

  tick();
  countdownInterval = setInterval(tick, 500);
}

function startAttemptsRefresh() {
  clearInterval(activeAttemptsInterval);
  activeAttemptsInterval = setInterval(async () => {
    const state = await sendMessage({ action: 'getState' });
    if (!state.isActive) return;
    $('active-attempts').textContent = state.blockedAttempts || 0;
    const isAllow = state.isAllowlistMode || false;
    const sites = isAllow ? (state.allowedSites || []) : (state.blockedSites || []);
    $('active-sites-count').textContent = sites.length;
  }, 2000);
}

// ── Done View ─────────────────────────────────────────────────────────────────

function renderDoneView(stats, state) {
  showView('view-done');
  $('done-minutes').textContent = stats.duration || 0;
  $('done-blocked').textContent = stats.blockedAttempts || 0;
  $('done-streak').textContent = calculateStreak(state.sessionHistory || []);

  const cta = $('done-cta');
  if (!state.scheduleEnabled) {
    cta.innerHTML = `<p style="font-size:12px; color:var(--gray-500); text-align:center; margin: 8px 0 4px;">
      Want to focus at this time every day?
      <button id="btn-enable-schedule" class="btn-ghost" style="display:inline; margin:0; padding:0; font-size:12px;">Set up schedule \u2192</button>
    </p>`;
    $('btn-enable-schedule').addEventListener('click', async () => {
      const s = await sendMessage({ action: 'getState' });
      renderSettingsView(s);
    });
  } else {
    cta.innerHTML = '';
  }
}

// ── Settings View ─────────────────────────────────────────────────────────────

function renderSettingsView(state) {
  showView('view-settings');

  const scheduleToggle = $('schedule-toggle');
  const scheduleOptions = $('schedule-options');

  scheduleToggle.disabled = false;
  scheduleToggle.checked = state.scheduleEnabled || false;
  scheduleOptions.classList.toggle('hidden', !state.scheduleEnabled);
  $('schedule-time').value = state.scheduleTime || '09:00';
  $('schedule-duration').value = state.scheduleDuration || 30;
}

// ── Stats View ────────────────────────────────────────────────────────────────

function renderStatsView(state) {
  showView('view-stats');

  const history = state.sessionHistory || [];

  $('stat-total-time').textContent = formatMinutes(state.allTimeFocusMinutes || 0);
  $('stat-week-sessions').textContent = countWeekSessions(history);
  $('stat-streak').textContent = calculateStreak(history);
  $('stat-distractions').textContent = state.allTimeBlockedAttempts || 0;

  drawChart($('stats-chart'), buildChartData(history));
  
  // Render Top Distractions
  const counts = state.siteBlockCounts || {};
  const sortedSites = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const list = $('top-sites-list');
  list.innerHTML = '';
  
  if (sortedSites.length === 0) {
    list.innerHTML = '<li class="site-item" style="justify-content: center; color: var(--gray-400);">No blocked attempts yet.</li>';
  } else {
    sortedSites.forEach(([domain, count]) => {
      const li = document.createElement('li');
      li.className = 'site-item';
      li.innerHTML = `<span>${domain}</span><span style="font-weight:600; color:var(--red);">${count} ${count === 1 ? 'block' : 'blocks'}</span>`;
      list.appendChild(li);
    });
  }

  const notice = $('history-truncation-notice');
  if ((state.sessionHistory || []).length >= 90) {
    notice.classList.remove('hidden');
  } else {
    notice.classList.add('hidden');
  }
}

function countWeekSessions(history) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return history.filter((s) => s.date >= cutoffStr).length;
}

function calculateStreak(history) {
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

function buildChartData(history) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
    const minutes = history
      .filter((s) => s.date === key)
      .reduce((sum, s) => sum + (s.focusMinutes || 0), 0);
    days.push({ label, minutes });
  }
  return days;
}

function drawChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const pad = { top: 16, right: 8, bottom: 22, left: 30 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  ctx.clearRect(0, 0, W, H);

  const maxVal = Math.max(...data.map((d) => d.minutes), 30);
  const barW = plotW / data.length * 0.55;
  const step = plotW / data.length;

  // Grid lines
  [0, 0.5, 1].forEach((frac) => {
    const y = pad.top + plotH * (1 - frac);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(W - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = '#9ca3af';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal * frac) + 'm', pad.left - 3, y + 3);
  });

  // Bars
  data.forEach((day, i) => {
    const barH = (day.minutes / maxVal) * plotH;
    const x = pad.left + i * step + (step - barW) / 2;
    const y = pad.top + plotH - barH;

    ctx.fillStyle = barH > 0 ? '#6366f1' : '#e5e7eb';
    ctx.beginPath();
    ctx.roundRect(x, barH > 0 ? y : pad.top + plotH - 2, barW, Math.max(barH, 2), 3);
    ctx.fill();

    // Day label
    ctx.fillStyle = '#9ca3af';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(day.label, x + barW / 2, H - 5);
  });
}

// ── Initialisation ────────────────────────────────────────────────────────────

async function init() {
  clearInterval(countdownInterval);
  clearInterval(activeAttemptsInterval);

  const state = await sendMessage({ action: 'getState' });

  if (state.isActive) {
    renderActiveView(state);
    return;
  }

  if (state.lastSessionStats) {
    const stats = state.lastSessionStats;
    await sendMessage({ action: 'clearLastSession' });
    renderDoneView(stats, state);
    return;
  }

  renderIdleView(state);
}

// ── Event bindings ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await init();

  // Duration picker
  document.querySelectorAll('.duration-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedDuration = parseInt(btn.dataset.min);
      document.querySelectorAll('.duration-btn').forEach((b) => b.classList.remove('active'));
      const customWrapper = $('custom-duration-wrapper');
      if (customWrapper) {
        customWrapper.classList.remove('active');
        $('custom-duration-input').value = '';
      }
      btn.classList.add('active');
    });
  });

  const customInput = $('custom-duration-input');
  if (customInput) {
    customInput.addEventListener('input', () => {
      const hours = parseInt(customInput.value) || 0;
      if (hours > 0) {
        selectedDuration = hours * 60;
        document.querySelectorAll('.duration-btn').forEach((b) => b.classList.remove('active'));
        $('custom-duration-wrapper').classList.add('active');
      }
    });
    $('custom-duration-wrapper').addEventListener('click', () => customInput.focus());
  }

  // Add site
  $('btn-add-site').addEventListener('click', addSite);
  $('site-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSite();
  });

  async function addSite() {
    const raw = $('site-input').value;
    if (!raw.trim()) return;
    const domain = cleanDomain(raw);
    if (!domain) return;

    const state = await sendMessage({ action: 'getState' });
    const isAllow = state.isAllowlistMode || false;
    const sites = isAllow ? (state.allowedSites || []) : (state.blockedSites || []);
    
    if (!sites.includes(domain)) {
      const updated = [...sites, domain];
      await sendMessage({ action: 'updateSites', sites: updated, isAllowlistMode: isAllow });
      renderSiteList(updated, isAllow);
      updateStartButtonState({ ...state, [isAllow ? 'allowedSites' : 'blockedSites']: updated });
    }
    $('site-input').value = '';
  }

  // Mode picker
  async function setMode(isAllowlistMode) {
    await sendMessage({ action: 'setMode', isAllowlistMode });
    const state = await sendMessage({ action: 'getState' });
    renderIdleView(state);
  }
  $('mode-btn-block').addEventListener('click', () => setMode(false));
  $('mode-btn-allow').addEventListener('click', () => setMode(true));

  // Toggle mid-session sites panel
  $('btn-toggle-sites').addEventListener('click', () => {
    const panel = $('active-sites-panel');
    const isHidden = panel.classList.toggle('hidden');
    $('btn-toggle-sites').textContent = isHidden ? 'Manage sites ▾' : 'Manage sites ▴';
  });

  // Add site mid-session
  $('active-btn-add-site').addEventListener('click', addSiteLive);
  $('active-site-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSiteLive();
  });

  async function addSiteLive() {
    const raw = $('active-site-input').value;
    if (!raw.trim()) return;
    const domain = cleanDomain(raw);
    if (!domain) return;

    const state = await sendMessage({ action: 'getState' });
    const isAllow = state.isAllowlistMode || false;
    const sites = isAllow ? (state.allowedSites || []) : (state.blockedSites || []);
    if (sites.includes(domain)) { $('active-site-input').value = ''; return; }

    const updated = [...sites, domain];
    await sendMessage({ action: 'updateSitesLive', sites: updated, isAllowlistMode: isAllow });
    $('active-sites-count').textContent = updated.length;
    renderActiveSiteList(updated, isAllow);
    $('active-site-input').value = '';
  }

  // Start session
  $('btn-start').addEventListener('click', async () => {
    const result = await sendMessage({ action: 'startSession', duration: selectedDuration });
    if (result.success) {
      const state = await sendMessage({ action: 'getState' });
      renderActiveView(state);
    } else {
      alert(friendlyError(result.error));
    }
  });

  // End session
  $('btn-end').addEventListener('click', async () => {
    if (!confirm('End the session early?')) return;
    clearInterval(countdownInterval);
    clearInterval(activeAttemptsInterval);
    const stats = await sendMessage({ action: 'endSession' });
    const state = await sendMessage({ action: 'getState' });
    renderDoneView(stats, state);
  });

  // Done — start again
  $('btn-start-again').addEventListener('click', async () => {
    const state = await sendMessage({ action: 'getState' });
    renderIdleView(state);
  });

  // Done — go to settings
  $('btn-done-settings').addEventListener('click', async () => {
    const state = await sendMessage({ action: 'getState' });
    renderSettingsView(state);
  });

  $('btn-stats-idle').addEventListener('click', () => goToStats('idle'));

  // Open settings from idle
  $('btn-settings').addEventListener('click', async () => {
    const state = await sendMessage({ action: 'getState' });
    renderSettingsView(state);
  });

  // Settings — back
  $('btn-settings-back').addEventListener('click', async () => {
    const state = await sendMessage({ action: 'getState' });
    renderIdleView(state);
  });

  // Settings — show stats
  $('btn-show-stats').addEventListener('click', () => goToStats('settings'));

  // Stats — back
  $('btn-stats-back').addEventListener('click', async () => {
    const state = await sendMessage({ action: 'getState' });
    if (statsReturnView === 'idle') {
      renderIdleView(state);
    } else {
      renderSettingsView(state);
    }
  });

  // Stats — export
  $('btn-export-stats').addEventListener('click', async () => {
    const state = await sendMessage({ action: 'getState' });
    const payload = {
      exportedAt: new Date().toISOString(),
      allTimeFocusMinutes: state.allTimeFocusMinutes || 0,
      allTimeBlockedAttempts: state.allTimeBlockedAttempts || 0,
      siteBlockCounts: state.siteBlockCounts || {},
      sessionHistory: state.sessionHistory || [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focus-guard-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Schedule toggle
  $('schedule-toggle').addEventListener('change', async () => {
    const enabled = $('schedule-toggle').checked;
    $('schedule-options').classList.toggle('hidden', !enabled);
    await sendMessage({
      action: 'setSchedule',
      enabled,
      time: $('schedule-time').value,
      duration: parseInt($('schedule-duration').value),
    });
  });

  // Schedule time / duration change
  async function saveSchedule() {
    await sendMessage({
      action: 'setSchedule',
      enabled: $('schedule-toggle').checked,
      time: $('schedule-time').value,
      duration: parseInt($('schedule-duration').value),
    });
  }

  $('schedule-time').addEventListener('change', saveSchedule);
  $('schedule-duration').addEventListener('change', saveSchedule);
});
