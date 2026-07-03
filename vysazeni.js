// ── Sloupce ze sheetu (VC = Vysazeni Columns) ──────────────
const VC = {
  datum: 0,
  jmenoVek: 1,
  haHistorie: 2,
  duvodPremyslet: 3,
  duvodKonecny: 4,
  poVysazeni: 5,
  litujeStrukturovane: 6,  // ne, nelituji / ano, lituji / smíšené pocity
  litujeRozvest: 7,        // volný text rozvedení odpovědi
  partnerVztahy: 8,
  ochranaPo: 9,
};

let data = [];
let refreshTimer = null;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const chipFilters = { tema: new Set(), lituje: new Set() };

const LITUJE_MAP = {
  'Nelituji': 'ne, nelituji vysazení',
  'Lituji':   'ano, lituji vysazení',
  'Smíšené':  'smíšené pocity',
};

// ── Témata: hledání konkrétních slov kdekoliv v textu příběhu ──
const TOPIC_PATTERNS = {
  'Menstruace/cyklus': /menstruac|cyklus/,
  'Akné/pleť': /akn[ée]|pleť/,
  'Nálada': /n[áa]lad/,
  'Vlasy': /vlas[yůu]/,
  'Plodnost/otěhotnění': /plodnost|otěhotn|početí/,
  'Libido': /libido/,
  'Bolesti hlavy/migrény': /bolest.{0,3}hlav|migr[ée]n/,
  'Deprese': /depres/,
  'Váha/hubnutí': /\bváh[ay]\b|hubnut|přibír/,
  'Cysty': /cyst/,
  'PCOS': /pcos|pmos/,
  'Úzkosti': /úzkost/,
  'Trombóza/srážlivost': /tromb|sr[áa]žliv/,
  'Endometrióza': /endometri[óo]z/,
};

function rowTopics(r) {
  const t = r.join(' ').toLowerCase();
  return Object.keys(TOPIC_PATTERNS).filter(label => TOPIC_PATTERNS[label].test(t));
}

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

// ── Filtry (chips) ───────────────────────────────────────
function toggleFiltersPanel() {
  document.getElementById('sidebar-filters').classList.toggle('open');
  document.getElementById('filters-toggle-btn').classList.toggle('open');
}

function toggleChip(cat, val) {
  chipFilters[cat].has(val) ? chipFilters[cat].delete(val) : chipFilters[cat].add(val);
  document.querySelectorAll('.chip').forEach(el => {
    const elCat = el.getAttribute('onclick').match(/toggleChip\('(\w+)'/)[1];
    const elVal = el.getAttribute('onclick').match(/'([^']+)'\)$/)[1];
    el.classList.toggle('active', chipFilters[elCat]?.has(elVal));
  });
  render();
}

function resetFilters() {
  Object.values(chipFilters).forEach(set => set.clear());
  document.querySelectorAll('.chip.active').forEach(el => el.classList.remove('active'));
  document.getElementById('search').value = '';
  render();
}

// ── Render ───────────────────────────────────────────────
function render() {
  const q = document.getElementById('search').value.trim().toLowerCase();

  const filtered = data.filter(r => {
    if (q) {
      const txt = r.join(' ').toLowerCase();
      if (!txt.includes(q)) return false;
    }
    if (chipFilters.tema.size) {
      const topics = rowTopics(r);
      if (![...chipFilters.tema].some(sel => topics.includes(sel))) return false;
    }
    if (chipFilters.lituje.size) {
      const val = (r[VC.litujeStrukturovane] || '').trim().toLowerCase();
      if (![...chipFilters.lituje].some(label => val === LITUJE_MAP[label].toLowerCase())) return false;
    }
    return true;
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

const LITUJE_BADGE = {
  'ne, nelituji vysazení': { cls: 'b-lituje-ne',      label: 'Nelituji' },
  'ano, lituji vysazení':  { cls: 'b-lituje-ano',     label: 'Lituji' },
  'smíšené pocity':        { cls: 'b-lituje-smisene', label: 'Smíšené pocity' },
};

function buildCardHtml(r, i) {
  const name = (r[VC.jmenoVek] || 'Anonymní').trim();
  const initial = name.charAt(0).toUpperCase();
  const datePart = (r[VC.datum] || '').split(' ')[0];
  const preview = (r[VC.duvodKonecny] || r[VC.poVysazeni] || '').trim();
  const litujeBadge = LITUJE_BADGE[(r[VC.litujeStrukturovane] || '').trim().toLowerCase()];
  const badgeHtml = litujeBadge
    ? `<span class="badge ${litujeBadge.cls}">${litujeBadge.label}</span>`
    : '';

  const sections = [
    { l: 'Historie užívání a vysazení HA', v: r[VC.haHistorie] },
    { l: 'Proč přemýšlela o vysazení', v: r[VC.duvodPremyslet] },
    { l: 'Důvod, proč se nakonec odhodlala', v: r[VC.duvodKonecny] },
    { l: 'Co se dělo po vysazení', v: r[VC.poVysazeni] },
    { l: 'Lituje vysazení HA?', v: r[VC.litujeRozvest] },
    { l: 'Partner a vztahy', v: r[VC.partnerVztahy] },
    { l: 'Ochrana po vysazení', v: r[VC.ochranaPo] },
  ].map(s => ({ l: s.l, v: (s.v || '').trim() || '–' }));

  return `
    <div class="card" id="card-${i}">
      <div class="card-top" onclick="toggle(${i})" style="cursor:pointer">
        <div class="avatar">${initial}</div>
        <div class="card-info">
          <div class="card-name-row">
            <div class="card-name">${escapeHtml(name)}</div>
            ${badgeHtml}
          </div>
          <div class="card-sub">${escapeHtml(datePart)}</div>
          <div class="story-preview">
            <span class="preview-short">${escapeHtml(preview.slice(0, 140))}${preview.length > 140 ? '…' : ''}</span>
            <span class="preview-full">${escapeHtml(preview)}</span>
          </div>
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
