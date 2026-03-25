// ── TUNING ─────────────────────────────────────────────────────────
// Change these values directly and reload the extension to test

const ARC_CY          = 50;   // vertical center of arc — lower = arc moves down
const ARC_R           = 46;   // radius — bigger = larger circle
const SVG_HEIGHT      = 100;   // viewBox height — must be >= ARC_CY + ARC_R*0.866
const ARC_STROKE      = 8;    // stroke thickness
const TEXT_FONT_SIZE  = 28;   // size of the "XX%" number
const SVG_MARGIN_BOTTOM = 8;  // gap between arc and the rows below (px)
// ────────────────────────────────────────────────────────────────────


function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function describeArc(cx, cy, r, startDeg, endDeg) {
  const rad = a => (a - 90) * Math.PI / 180;
  const p = a => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  const [sx, sy] = p(startDeg);
  const [ex, ey] = p(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

function getColor(pct) {
  if (pct < 50) return '#3d8f5e';
  if (pct < 75) return '#c4902a';
  if (pct < 90) return '#cf6a3c';
  return '#c0352e';
}

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

function isValid(data) {
  return data && data.session && typeof data.session.pct === 'number'
      && data.session.pct >= 0 && data.session.pct <= 100;
}

function renderData(data) {
  if (!isValid(data)) {
    document.getElementById('content').innerHTML = `
      <div style="padding:24px 16px;text-align:center;font-family:'DM Sans',sans-serif;color:#504e49;font-size:12px;line-height:1.7;">
        No data yet.<br>Click Refresh to read the settings page.
      </div>`;
    return;
  }

  const sPct   = data.session.pct;
  const sReset = esc(data.session.resetLabel || '—');
  const wPct   = data.weekly ? data.weekly.pct        : null;
  const wReset = data.weekly && data.weekly.resetLabel ? esc(data.weekly.resetLabel) : null;
  const rem    = 100 - sPct;
  const color  = getColor(sPct);

  // Arc: center of SVG canvas is CX=140
  // START=-210, END=30 → arc spans 240°, gap at bottom 120°
  // Bottom endpoints at angle 120° from top → y = CY + R*cos(30°) = CY + R*0.866
  // With R=46, CY=58: bottom y = 58+39.8 = 97.8 → viewBox height=100
  const CX = 140, CY = ARC_CY, R = ARC_R;
  const START = -210, END = 30;
  const track = describeArc(CX, CY, R, START, END);
  const fill  = sPct > 0 ? describeArc(CX, CY, R, START, START + (sPct/100)*240) : '';

  const wColor = wPct !== null ? getColor(wPct) : '#504e49';

  document.getElementById('content').innerHTML = `
    <div style="padding:14px 16px 0;">

      <!-- Arc + text entirely inside SVG so they're always geometrically aligned -->
      <svg width="100%" viewBox="0 0 280 ${SVG_HEIGHT}" style="display:block;margin-bottom:${SVG_MARGIN_BOTTOM}px;">
        <!-- track -->
        <path fill="none" stroke="#1e1d1b" stroke-width="${ARC_STROKE}" stroke-linecap="round" d="${track}"/>
        <!-- fill -->
        ${fill ? `<path fill="none" stroke="${color}" stroke-width="${ARC_STROKE}" stroke-linecap="round" d="${fill}"/>` : ''}
        <!-- percentage number -->
        <text x="${CX}" y="${CY - 4}" text-anchor="middle" dominant-baseline="auto"
              font-family="'DM Mono',monospace" font-size="${TEXT_FONT_SIZE}" font-weight="300"
              letter-spacing="-1" fill="${color}">${rem}%</text>
        <!-- label -->
        <text x="${CX}" y="${CY + 16}" text-anchor="middle" dominant-baseline="auto"
              font-family="'DM Sans',sans-serif" font-size="10" letter-spacing="1"
              fill="#504e49">remaining</text>
      </svg>

      <div style="border-top:0.5px solid #1e1d1b;padding:8px 0;display:flex;justify-content:space-between;align-items:baseline;">
        <span style="font-size:11px;color:#504e49;font-family:'DM Sans',sans-serif;">Session used</span>
        <span style="font-size:13px;color:${color};">${sPct}%</span>
      </div>

      <div style="border-top:0.5px solid #1e1d1b;padding:8px 0;display:flex;justify-content:space-between;align-items:baseline;">
        <span style="font-size:11px;color:#504e49;font-family:'DM Sans',sans-serif;">Session reset</span>
        <span style="font-size:12px;color:#e8e6e0;">${sReset}</span>
      </div>

      ${wPct !== null ? `
        <div style="border-top:0.5px solid #2a2925;padding:7px 0 2px;display:flex;justify-content:space-between;align-items:baseline;">
          <span style="font-size:10px;color:#3a3835;font-family:'DM Sans',sans-serif;">Weekly · All models</span>
          <span style="font-size:11px;color:${wColor};">${wPct}% used</span>
        </div>
        ${wReset ? `
        <div style="padding:0 0 6px;display:flex;justify-content:space-between;align-items:baseline;">
          <span style="font-size:10px;color:#3a3835;font-family:'DM Sans',sans-serif;">Weekly reset</span>
          <span style="font-size:10px;color:#504e49;">${wReset}</span>
        </div>` : ''}
      ` : ''}

    </div>

    <div style="padding:9px 16px 12px;display:flex;justify-content:space-between;align-items:center;border-top:0.5px solid #1e1d1b;margin-top:4px;">
      <span style="font-size:10px;color:#3a3835;font-family:'DM Sans',sans-serif;">Updated ${timeAgo(data.timestamp)}</span>
      <a href="https://claude.ai/settings/usage" target="_blank"
         style="font-size:10px;color:#504e49;font-family:'DM Sans',sans-serif;text-decoration:none;border-bottom:0.5px solid #2a2925;">
        open settings ↗
      </a>
      <button id="show-widget-btn" style="font-size:10px;color:#504e49;font-family:'DM Sans',sans-serif;background:none;border:none;cursor:pointer;padding:0;border-bottom:0.5px solid #2a2925;">show widget</button>
    </div>
  `;
}

chrome.runtime.sendMessage({ type: 'GET_DATA' }, res => {
  void chrome.runtime.lastError;
  if (res) renderData(res.data);
});

document.getElementById('refresh-btn').addEventListener('click', () => {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = '…';
  btn.disabled = true;
  chrome.runtime.sendMessage({ type: 'REFRESH_NOW' }, () => { void chrome.runtime.lastError; });

  let attempts = 0;
  const poll = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'GET_DATA' }, res => {
      void chrome.runtime.lastError;
      if (res) {
        const fresh = res.data && res.data.timestamp > (Date.now() - 15000);
        if (fresh || attempts > 12) {
          clearInterval(poll);
          btn.textContent = '↻ Refresh';
          btn.disabled = false;
          renderData(res.data);
        }
      }
    });
    attempts++;
  }, 1000);
});

// Show widget button — re-enables the floating widget on the active tab
document.addEventListener('click', e => {
  if (e.target && e.target.id === 'show-widget-btn') {
    chrome.storage.local.set({ claude_widget_visible: true });
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            const w = document.getElementById('claude-usage-widget');
            if (w) w.style.display = '';
          }
        }).catch(() => {}); // silently ignored on non-claude.ai tabs (blocked by host_permissions)
      }
    });
    e.target.textContent = 'shown ✓';
    setTimeout(() => { if (e.target) e.target.textContent = 'show widget'; }, 1500);
  }
});
