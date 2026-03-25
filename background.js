const STORAGE_KEY = 'claude_usage_data';
const ALARM_NAME  = 'claude_usage_refresh';
const REFRESH_MIN = 5;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let orgId   = null;
let fetching = false;

function badgeColor(pct) {
  if (pct < 50) return '#3d8f5e';
  if (pct < 75) return '#c4902a';
  if (pct < 90) return '#cf6a3c';
  return '#c0352e';
}

function updateBadge(data) {
  if (!data || !data.session || typeof data.session.pct !== 'number') {
    chrome.action.setBadgeText({ text: '?' });
    chrome.action.setBadgeBackgroundColor({ color: '#555' });
    chrome.action.setTitle({ title: 'Claude Usage – no data' });
    return;
  }
  const rem = 100 - data.session.pct;
  chrome.action.setBadgeText({ text: rem + '%' });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor(data.session.pct) });
  chrome.action.setTitle({ title: `Claude: ${rem}% remaining · ${data.session.resetLabel || ''}` });
}

async function saveData(data) {
  if (!data || !data.session || typeof data.session.pct !== 'number') return;
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
  updateBadge(data);
}

async function loadData() {
  const res = await chrome.storage.local.get(STORAGE_KEY);
  const data = res[STORAGE_KEY] || null;
  if (data && !data.session) {
    await chrome.storage.local.remove(STORAGE_KEY);
    return null;
  }
  return data;
}

function formatResetLabel(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  const diffMs = d - Date.now();
  if (diffMs <= 0) return 'Resetting…';
  const m = Math.floor(diffMs / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `Resets in ${h}h ${m % 60}m` : `Resets in ${m}m`;
}

function formatWeeklyResetLabel(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  return 'Resets ' + d.toLocaleString('en-US', {
    weekday: 'short', hour: 'numeric', minute: '2-digit'
  });
}

// ── Get org ID ─────────────────────────────────────────────────
// Try multiple endpoints/paths since the API structure isn't documented

async function fetchOrgId() {
  // Strategy 1: /api/organizations — returns list, grab first uuid
  try {
    const res = await fetch('https://claude.ai/api/organizations', {
      credentials: 'include'
    });
    if (res.ok) {
      const json = await res.json();
      // Could be array or {organizations: [...]}
      const list = Array.isArray(json) ? json : (json.organizations || json.data || []);
      if (list.length > 0) {
        const id = list[0].uuid || list[0].id;
        if (id && UUID_RE.test(String(id))) { return id; }
      }
    }
  } catch (e) { console.warn('[claude-usage] /organizations failed', e); }

  // Strategy 2: /api/auth/session — try various paths
  try {
    const res = await fetch('https://claude.ai/api/auth/session', {
      credentials: 'include'
    });
    if (res.ok) {
      const json = await res.json();
      // Try common paths
      const candidates = [
        json?.account?.memberships?.[0]?.organization?.uuid,
        json?.account?.organizations?.[0]?.uuid,
        json?.user?.organization_uuid,
        json?.organization?.uuid,
        json?.org_id,
        json?.account?.organization_id,
      ];
      for (const c of candidates) {
        if (c && UUID_RE.test(String(c))) { return c; }
      }
    }
  } catch (e) { console.warn('[claude-usage] /auth/session failed', e); }

  return null;
}

// ── Fetch usage ────────────────────────────────────────────────

async function fetchUsage() {
  if (fetching) return;
  fetching = true;
  try {
    if (!orgId) orgId = await fetchOrgId();
    if (!orgId) {
      console.warn('[claude-usage] could not determine orgId — storing debug info');
      // Save an error state so popup can show something helpful
      await chrome.storage.local.set({
        [STORAGE_KEY + '_error']: { msg: 'Could not get org ID. Are you logged in to claude.ai?', ts: Date.now() }
      });
      return;
    }

    const res = await fetch(
      `https://claude.ai/api/organizations/${orgId}/usage`,
      { credentials: 'include' }
    );

    if (!res.ok) {
      console.warn('[claude-usage] usage API', res.status);
      if (res.status === 401 || res.status === 403) orgId = null;
      return;
    }

    const json = await res.json();

    const fiveHour = json.five_hour || {};
    const sevenDay = json.seven_day  || {};

    const data = {
      session: {
        pct:        Math.min(100, Math.max(0, Math.round(fiveHour.utilization ?? 0))),
        resetLabel: formatResetLabel(fiveHour.resets_at),
        resetTs:    fiveHour.resets_at ? new Date(fiveHour.resets_at).getTime() : null
      },
      weekly: {
        pct:        Math.min(100, Math.max(0, Math.round(sevenDay.utilization ?? 0))),
        resetLabel: formatWeeklyResetLabel(sevenDay.resets_at),
        resetTs:    sevenDay.resets_at ? new Date(sevenDay.resets_at).getTime() : null
      },
      raw:       json,
      timestamp: Date.now()
    };

    await saveData(data);
    chrome.storage.local.remove(STORAGE_KEY + '_error');

  } catch (e) {
    console.error('[claude-usage] fetchUsage error', e);
  } finally {
    fetching = false;
  }
}

// ── Messages ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_DATA') {
    loadData().then(data => sendResponse({ data }));
    return true;
  }
  if (msg.type === 'REFRESH_NOW') {
    fetchUsage().then(() => loadData()).then(data => sendResponse({ data }));
    return true;
  }
  // Fallback from content script DOM scraping (widget.js auto-refresh trigger)
  if (msg.type === 'USAGE_DATA') {
    saveData(msg.data);
    sendResponse({ ok: true });
  }
});

// ── Alarm ──────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_NAME) fetchUsage();
});

// ── Startup ────────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(async () => {
  // Recreate alarm only if it was somehow lost (periodic alarms survive restarts)
  chrome.alarms.get(ALARM_NAME, a => {
    if (!a) chrome.alarms.create(ALARM_NAME, { delayInMinutes: REFRESH_MIN, periodInMinutes: REFRESH_MIN });
  });
  updateBadge(await loadData());
  fetchUsage();
});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: REFRESH_MIN, periodInMinutes: REFRESH_MIN });
  updateBadge(await loadData());
  fetchUsage();
});
