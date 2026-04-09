// Floating widget injected on all claude.ai pages (except settings/usage)
// Shows a small pill with remaining %, expandable on click

const STORAGE_KEY = 'claude_usage_data';
const VIS_KEY     = 'claude_widget_visible';

// ── Don't inject on the settings page itself ──────────────────
if (location.pathname.startsWith('/settings') || document.getElementById('claude-usage-widget')) {
  // nothing — settings page or already injected
} else {

// ── State ─────────────────────────────────────────────────────
let expanded = false;
let data     = null;
let visible  = true;

// ── Helpers ───────────────────────────────────────────────────
function getColor(pct) {
  if (pct < 50) return '#3d8f5e';
  if (pct < 75) return '#c4902a';
  if (pct < 90) return '#cf6a3c';
  return '#c0352e';
}

function safeSend(msg) {
  try { chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; }); } catch (_) {}
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Build DOM ─────────────────────────────────────────────────
const host = document.createElement('div');
host.id = 'claude-usage-widget';
host.style.cssText = `
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483647;
  font-family: 'DM Mono', 'Courier New', monospace;
  user-select: none;
`;
document.body.appendChild(host);

// Pill (always visible when widget is shown)
const pill = document.createElement('div');
pill.style.cssText = `
  display: flex;
  align-items: center;
  gap: 7px;
  background: #131211;
  border: 0.5px solid #2a2925;
  border-radius: 20px;
  padding: 5px 12px 5px 8px;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color .15s;
  box-shadow: 0 2px 8px rgba(0,0,0,.4);
`;
pill.addEventListener('mouseenter', () => pill.style.borderColor = '#504e49');
pill.addEventListener('mouseleave', () => pill.style.borderColor = '#2a2925');

const pillDot = document.createElement('div');
pillDot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#cf6a3c;flex-shrink:0;';

const pillText = document.createElement('span');
pillText.style.cssText = 'font-size:12px;font-weight:400;color:#e8e6e0;letter-spacing:-.3px;';
pillText.textContent = '…%';

const hideBtn = document.createElement('span');
hideBtn.style.cssText = 'font-size:11px;color:#3a3835;margin-left:4px;cursor:pointer;padding:0 2px;';
hideBtn.textContent = '×';
hideBtn.title = 'Hide widget';
hideBtn.addEventListener('click', e => { e.stopPropagation(); setVisible(false); });

pill.appendChild(pillDot);
pill.appendChild(pillText);
pill.appendChild(hideBtn);

// Expanded card
const card = document.createElement('div');
card.style.cssText = `
  background: #0d0d0f;
  border: 0.5px solid #2a2925;
  border-radius: 10px;
  padding: 12px 14px 10px;
  margin-bottom: 6px;
  min-width: 200px;
  box-shadow: 0 4px 16px rgba(0,0,0,.5);
  display: none;
`;

host.appendChild(card);
host.appendChild(pill);

// Toggle expanded (capture phase so we can stop propagation on drag)
pill.addEventListener('click', e => {
  if (didDrag) { didDrag = false; e.stopPropagation(); return; }
  expanded = !expanded;
  card.style.display = expanded ? 'block' : 'none';
  renderCard();
}, true);

// ── Restore visibility preference ─────────────────────────────
chrome.storage.local.get(VIS_KEY, res => {
  if (res[VIS_KEY] === false) setVisible(false);
});

function setVisible(v) {
  visible = v;
  host.style.display = v ? '' : 'none';
  chrome.storage.local.set({ [VIS_KEY]: v });
}

// ── Render ────────────────────────────────────────────────────
function renderPill() {
  if (!data || !data.session || data.session.pct == null) {
    pillText.textContent = '?%';
    pillDot.style.background = '#555';
    return;
  }
  const rem = 100 - data.session.pct;
  const color = getColor(data.session.pct);
  pillText.textContent = rem + '% left';
  pillText.style.color = color;
  pillDot.style.background = color;
}

function row(label, value, small) {
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-top:0.5px solid #1e1d1b;">
    <span style="font-size:${small?'10px':'11px'};color:${small?'#3a3835':'#504e49'};font-family:'DM Sans',sans-serif;">${esc(label)}</span>
    <span style="font-size:${small?'10px':'12px'};color:${small?'#504e49':'#e8e6e0'};">${esc(String(value))}</span>
  </div>`;
}

function renderCard() {
  if (!expanded) return;
  if (!data || !data.session || data.session.pct == null) {
    card.innerHTML = `<div style="font-size:11px;color:#504e49;font-family:'DM Sans',sans-serif;padding:4px 0;">No data — click Refresh</div>`;
    return;
  }
  const s = data.session;
  const w = data.weekly;
  const rem = 100 - s.pct;
  const color = getColor(s.pct);
  card.innerHTML =
    `<div style="font-size:22px;font-weight:300;color:${color};letter-spacing:-1px;line-height:1;margin-bottom:8px;">${rem}% <span style="font-size:11px;color:#504e49;font-family:'DM Sans',sans-serif;font-weight:400;">remaining</span></div>` +
    row('Session used', s.pct + '%') +
    row('Session reset', s.resetLabel || '—') +
    (w && w.pct != null ? row('Weekly · All models', w.pct + '% used', true) : '') +
    (w && w.resetLabel   ? row('Weekly reset', w.resetLabel, true) : '');
}

// ── Load from storage ─────────────────────────────────────────
function loadAndRender() {
  chrome.storage.local.get(STORAGE_KEY, res => {
    data = res[STORAGE_KEY] || null;
    renderPill();
    renderCard();
  });
}
loadAndRender();

// Listen for storage changes from background
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) {
    data = changes[STORAGE_KEY].newValue;
    renderPill();
    renderCard();
  }
});

// ── Draggable ────────────────────────────────────────────────
let dragging = false, didDrag = false, ox = 0, oy = 0;

pill.addEventListener('mousedown', e => {
  if (e.target === hideBtn) return;
  dragging = true;
  didDrag = false;
  const rect = host.getBoundingClientRect();
  ox = e.clientX - rect.right;   // anchor to bottom-right corner
  oy = e.clientY - rect.bottom;
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (!dragging) return;
  const dx = Math.abs(e.clientX - (host.getBoundingClientRect().right + ox));
  if (!didDrag && dx < 4) return;  // ignore tiny jitter
  didDrag = true;
  // Position via right/bottom so card always grows upward
  const newRight  = window.innerWidth  - (e.clientX - ox);
  const newBottom = window.innerHeight - (e.clientY - oy);
  host.style.right  = Math.max(0, newRight)  + 'px';
  host.style.bottom = Math.max(0, newBottom) + 'px';
  host.style.left = 'auto';
  host.style.top  = 'auto';
});

document.addEventListener('mouseup', () => {
  dragging = false;
  // didDrag stays true until next mousedown — used to suppress click
});

// ── Auto-refresh on prompt completion ────────────────────────
// Claude renders a stop-streaming button while generating.
// We watch for it to disappear → response complete → trigger refresh.

let wasStreaming = false;
let refreshDebounce = null;

function isStreaming() {
  // Primary: data-testid is language-independent and the most reliable signal
  if (document.querySelector('button[data-testid*="stop"]')) return true;
  // Fallback: aria-label in major UI languages
  return !!document.querySelector(
    'button[aria-label*="Stop"],' +       // English (capital)
    'button[aria-label*="stop"],' +       // English (lowercase)
    'button[aria-label*="Detener"],' +    // Spanish
    'button[aria-label*="Arr\u00EAter"],' + // French (Arrêter)
    'button[aria-label*="Stopp"],' +      // German / Swedish / Norwegian
    'button[aria-label*="\u505C\u6B62"],' + // Chinese (停止) + Japanese (停止する contains 停止)
    'button[aria-label*="\uBA48\uCD94\uAE30"],' + // Korean (멈추기)
    'button[aria-label*="Interrompi"],' + // Italian
    'button[aria-label*="Parar"]'         // Portuguese / Spanish (alt)
  );
}

const streamObserver = new MutationObserver(() => {
  const streaming = isStreaming();
  if (wasStreaming && !streaming) {
    // Prompt just finished — debounce to avoid multiple rapid triggers during DOM settle
    clearTimeout(refreshDebounce);
    refreshDebounce = setTimeout(() => safeSend({ type: 'REFRESH_NOW' }), 1500);
  }
  wasStreaming = streaming;
});

streamObserver.observe(document.body, { childList: true, subtree: true });

} // end of settings guard
