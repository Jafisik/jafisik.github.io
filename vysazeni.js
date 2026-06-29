// ── Sloupce ze sheetu (VC = Vysazeni Columns) ──────────────
const VC = {
  datum: 0,
  jmenoVek: 1,
  haHistorie: 2,
  duvodPremyslet: 3,
  duvodKonecny: 4,
  poVysazeni: 5,
  lituje: 6,
  partnerVztahy: 7,
  ochranaPo: 8,
};

let data = [];
let refreshTimer = null;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// ── Parsování data z Google Forms (D.M.YYYY HH:MM:SS) ──────
function parseDatum(str) {
  if (!str) return 0;
  const [datePart, timePart] = str.split(' ');
  const [d, m, y] = (datePart || '').split('.').map(Number);
  if (!d || !m || !y) return 0;
  const [hh, mm, ss] = (timePart || '0:0:0').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0).getTime();
}

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Fetch vysazeni-data.json ────────────────────────────────
async function fetchData() {
  const res = await fetch('/vysazeni-data.json');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

function launchApp() {
  document.getElementById('main').style.display = 'block';
  const cached = localStorage.getItem('vysazeni_data');
  if (cached) {
    try {
      data = JSON.parse(cached);
      render();
    } catch (e) { localStorage.removeItem('vysazeni_data'); }
  } else {
    document.getElementById('list').innerHTML = '<div class="empty"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Načítám příběhy…</div>';
  }
  tick();
  refreshTimer = setInterval(tick, REFRESH_INTERVAL_MS);
}

async function tick(retried) {
  try {
    const fresh = await fetchData();
    if (fresh.length) {
      data = fresh;
      localStorage.setItem('vysazeni_data', JSON.stringify(data));
      render();
    } else {
      if (!data.length) document.getElementById('list').innerHTML = '<div class="empty">vysazeni-data.json je prázdné.</div>';
    }
  } catch (e) {
    if (!data.length && !retried) { setTimeout(() => tick(true), 1500); return; }
    if (!data.length) document.getElementById('list').innerHTML = '<div class="empty">Nepodařilo se načíst data: ' + e.message + '</div>';
  }
}

// ── Render ───────────────────────────────────────────────
function render() {
  const q = document.getElementById('search').value.trim().toLowerCase();

  const filtered = data.filter(r => {
    if (!q) return true;
    const txt = r.join(' ').toLowerCase();
    return txt.includes(q);
  });

  const sort = document.getElementById('f-sort').value;
  filtered.sort((a, b) => {
    if (sort === 'stare') return parseDatum(a[VC.datum]) - parseDatum(b[VC.datum]);
    if (sort === 'az') return (a[VC.jmenoVek] || '').localeCompare(b[VC.jmenoVek] || '', 'cs');
    if (sort === 'za') return (b[VC.jmenoVek] || '').localeCompare(a[VC.jmenoVek] || '', 'cs');
    return parseDatum(b[VC.datum]) - parseDatum(a[VC.datum]); // nove (default)
  });

  document.getElementById('stats').innerHTML = `<strong>${filtered.length}</strong> příběhů`;

  if (!filtered.length) {
    document.getElementById('list').innerHTML = '<div class="empty">Nic nenalezeno.</div>';
    return;
  }

  document.getElementById('list').innerHTML = filtered.map((r, i) => buildCardHtml(r, i)).join('');
}

function buildCardHtml(r, i) {
  const name = (r[VC.jmenoVek] || 'Anonymní').trim();
  const initial = name.charAt(0).toUpperCase();
  const datePart = (r[VC.datum] || '').split(' ')[0];
  const preview = (r[VC.duvodKonecny] || r[VC.poVysazeni] || '').trim();

  const sections = [
    { l: 'Historie užívání a vysazení HA', v: r[VC.haHistorie] },
    { l: 'Proč přemýšlela o vysazení', v: r[VC.duvodPremyslet] },
    { l: 'Důvod, proč se nakonec odhodlala', v: r[VC.duvodKonecny] },
    { l: 'Co se dělo po vysazení', v: r[VC.poVysazeni] },
    { l: 'Lituje, nebo ne?', v: r[VC.lituje] },
    { l: 'Partner a vztahy', v: r[VC.partnerVztahy] },
    { l: 'Ochrana po vysazení', v: r[VC.ochranaPo] },
  ].map(s => ({ l: s.l, v: (s.v || '').trim() || '–' }));

  return `
    <div class="card" id="card-${i}">
      <div class="card-top" onclick="toggle(${i})" style="cursor:pointer">
        <div class="avatar">${initial}</div>
        <div class="card-info">
          <div class="card-name">${escapeHtml(name)}</div>
          <div class="card-sub">${escapeHtml(datePart)}</div>
          <div class="story-preview">${escapeHtml(preview.slice(0, 140))}${preview.length > 140 ? '…' : ''}</div>
        </div>
        <svg class="chevron" id="chev-${i}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="detail" id="det-${i}">
        ${sections.map(s => `
          <div class="detail-section">
            <div class="di-label">${escapeHtml(s.l)}</div>
            <div class="di-val dark">${escapeHtml(s.v)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function toggle(i) {
  const det = document.getElementById('det-' + i);
  const willOpen = !det.classList.contains('open');
  document.querySelectorAll('.detail.open').forEach(el => {
    if (el !== det) {
      el.classList.remove('open');
      const otherChev = document.getElementById('chev-' + el.id.slice(4));
      if (otherChev) otherChev.classList.remove('open');
    }
  });
  det.classList.toggle('open', willOpen);
  document.getElementById('chev-' + i).classList.toggle('open', willOpen);
  if (willOpen) {
    document.getElementById('card-' + i).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function toggleProjectIntro() {
  const extra = document.getElementById('project-intro-extra');
  const btn = document.getElementById('project-intro-toggle');
  const open = extra.classList.toggle('open');
  btn.textContent = open ? 'Číst méně' : 'Číst více';
}

// ── Init ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('about-modal').classList.remove('open');
  }
});
launchApp();
