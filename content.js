// Content script for https://claude.ai/settings/usage
// Extracts: current session % + reset, weekly % + reset

function isOnUsagePage() {
  return location.pathname.startsWith('/settings/usage');
}

function safeSend(data) {
  if (!isOnUsagePage()) return;
  try {
    chrome.runtime.sendMessage({ type: 'USAGE_DATA', data }, () => { void chrome.runtime.lastError; });
  } catch (_) {
    // Extension context invalidated or background not ready — silently ignore
  }
}

function parseUsage() {
  const text = document.body.innerText || '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let session = { pct: null, resetLabel: null };
  let weekly  = { pct: null, resetLabel: null };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/current session/i.test(line)) {
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const m = lines[j].match(/(\d{1,3})%\s*used/i);
        if (m) session.pct = parseInt(m[1]);
        const r = lines[j].match(/resets?\s+in\s+(.+)/i)
               || lines[j].match(/resets?\s+(.+)/i);
        if (r) session.resetLabel = lines[j];
      }
    }

    if (/^all models$/i.test(line)) {
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const m = lines[j].match(/(\d{1,3})%\s*used/i);
        if (m) weekly.pct = parseInt(m[1]);
        const r = lines[j].match(/resets?\s+.+/i);
        if (r) weekly.resetLabel = lines[j];
      }
    }

    if (session.pct === null) {
      const pctInline = line.match(/(\d{1,3})%\s*used/i);
      const resetInline = /resets?\s+in\s+\d+\s*(min|hour)/i.test(line);
      if (pctInline) session.pct = parseInt(pctInline[1]);
      if (resetInline && !session.resetLabel) session.resetLabel = line;
    }
  }

  function parseResetTs(label) {
    if (!label) return null;
    const rel = label.match(/resets?\s+in\s+(\d+)\s*(min|hour|day)/i);
    if (rel) {
      const n = parseInt(rel[1]);
      const unit = rel[2].toLowerCase();
      const ms = unit.startsWith('day') ? n*86400000
               : unit.startsWith('hour') ? n*3600000
               : n*60000;
      return Date.now() + ms;
    }
    return null;
  }

  if (session.pct === null && weekly.pct === null) return null;

  return {
    session: { pct: session.pct, resetLabel: session.resetLabel, resetTs: parseResetTs(session.resetLabel) },
    weekly:  { pct: weekly.pct,  resetLabel: weekly.resetLabel,  resetTs: null },
    timestamp: Date.now()
  };
}

function trySend() {
  if (!isOnUsagePage()) return false;
  const data = parseUsage();
  if (data) { safeSend(data); return true; }
  return false;
}

if (!trySend()) {
  setTimeout(() => { if (!trySend()) setTimeout(trySend, 4000); }, 2000);
}

// Observe DOM changes, but disconnect automatically if we leave the usage page
let debounce = null;
const observer = new MutationObserver(() => {
  if (!isOnUsagePage()) {
    observer.disconnect();
    return;
  }
  clearTimeout(debounce);
  debounce = setTimeout(trySend, 800);
});
observer.observe(document.body, { childList: true, subtree: true });
