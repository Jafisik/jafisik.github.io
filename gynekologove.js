// ── Config ──────────────────────────────────────────────
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minut

// ── Sloupce (indexy odpovídají pořadí otázek v dotazníku) ──
const C = {
  datum: 0,
  krestni: 1, prijmeni: 2, ordinace: 3, web: 4, pohlavi: 5,
  kraj: 6, mesto: 7, vek: 8, poplatky: 9, ceny: 10,
  prohlidky: 11, komplikace: 12,
  doktor: 13, sestra: 14, lgbt: 15,
  vybaveni: 16, vzdel: 17, hvezdy: 18,
  hac: 19, hac2: 20, hac_deti: 21,
  bylinky: 22, bylinky2: 23,
  endo: 24, endo2: 25,
  pcos: 26, pcos2: 27,
  vag: 28, vag2: 29,
  sex: 30, sex2: 31,
  celostni: 32, celostni2: 33,
  deti: 34, deti2: 35,
  rozbory: 36, rozbory2: 37,
  ivf: 38, ultrazvuk: 39,
  komunikace: 40, objednani: 41, zaver: 42
};

// ── State ────────────────────────────────────────────────
let data = [];
let refreshTimer = null;
const chipFilters = { vek: new Set(), vybaveni: new Set(), vzdel: new Set(), poplatky: new Set(), hac: new Set(), lgbtq: new Set() };

function toggleGroup(id) {
  const opts = document.getElementById('grp-' + id);
  const btn = opts.previousElementSibling;
  opts.classList.toggle('open');
  btn.classList.toggle('open');
}

function toggleFiltersPanel() {
  document.getElementById('sidebar-filters').classList.toggle('open');
  document.getElementById('filters-toggle-btn').classList.toggle('open');
}

function toggleChip(cat, val) {
  chipFilters[cat].has(val) ? chipFilters[cat].delete(val) : chipFilters[cat].add(val);
  document.querySelectorAll(`.chip`).forEach(el => {
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
  ['f-kraj', 'f-mesto', 'f-pohlavi', 'f-hvezdy'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-mesto').style.display = 'none';
  updateFilterState();
  render();
}

// normalizovaný klíč bez ručních oprav (velikost písmen, diakritika, mezery kolem pomlčky, závorka na konci)
function baseNormalizeCity(s) {
  return (s || '')
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ');
}

// ruční oprava konkrétních překlepů/skloňování, které automatická normalizace nezachytí
const CITY_RAW_ALIASES = [
  ['Břeclqv', 'Břeclav'],
  ['Žďáru nad Sázavou', 'Žďár nad Sázavou'],
  ['Jablonec nad Nosou', 'Jablonec nad Nisou'],
  ['Ústí N.L.', 'Ústí nad Labem'],
  ['Šunperk', 'Šumperk'],
];
const CITY_TYPO_FIXES = {};
CITY_RAW_ALIASES.forEach(([from, to]) => {
  CITY_TYPO_FIXES[baseNormalizeCity(from)] = baseNormalizeCity(to);
});

// kombinované zápisy, které se nemají rozdělit na obě města, ale zobrazit jen pod jedním
const CITY_COMBINED_OVERRIDES = {};
[
  ['Studénka a Klimkovice', ['Studénka']],
  ['Studénka, Klimkovice', ['Studénka']],
  ['Hlavní v Novém Městě na Moravě a vedlejší ordinace Vír', ['Nové Město na Moravě']],
].forEach(([raw, replacement]) => {
  CITY_COMBINED_OVERRIDES[baseNormalizeCity(raw)] = replacement;
});

function splitMesta(str) {
  const trimmed = (str || '').trim();
  if (!trimmed) return [];
  const override = CITY_COMBINED_OVERRIDES[baseNormalizeCity(trimmed)];
  if (override) return override;
  return trimmed.split(/[\/,]|\s+a\s+/i).map(s => s.trim()).filter(Boolean);
}

// v Praze (kraj přesně "Praha") je obrovské množství různě psaných čtvrtí/adres -
// sloučíme je na "Praha N" (pokud je v textu číslo) nebo jen "Praha"
function simplifyMesto(r) {
  const raw = r[C.mesto] || '';
  if (r[C.kraj] === 'Praha') {
    const m = raw.match(/praha\D{0,5}(\d{1,2})\b/i);
    return [m ? ('Praha ' + m[1]) : 'Praha'];
  }
  return splitMesta(raw);
}

// normalizovaný klíč pro porovnávání měst napsaných různě
function normalizeCity(s) {
  const key = baseNormalizeCity(s);
  return CITY_TYPO_FIXES[key] || key;
}

// Když u recenze chybí křestní jméno, dohledá ho podle příjmení+kraje,
// pokud existuje právě jedna jiná recenze se stejným příjmením a krajem, která jméno má.
let firstNameLookup = new Map();
function buildFirstNameLookup() {
  firstNameLookup = new Map();
  data.forEach(r => {
    const prijmeni = (r[C.prijmeni] || '').trim().toLowerCase();
    const krestni = (r[C.krestni] || '').trim();
    if (!prijmeni || !krestni) return;
    const key = prijmeni + '|' + (r[C.kraj] || '').trim();
    if (!firstNameLookup.has(key)) firstNameLookup.set(key, new Set());
    firstNameLookup.get(key).add(krestni);
  });
}

function resolveFirstName(r) {
  const krestni = (r[C.krestni] || '').trim();
  if (krestni) return krestni;
  const prijmeni = (r[C.prijmeni] || '').trim().toLowerCase();
  if (!prijmeni) return '';
  const candidates = firstNameLookup.get(prijmeni + '|' + (r[C.kraj] || '').trim());
  return (candidates && candidates.size === 1) ? [...candidates][0] : '';
}

// pro každý normalizovaný klíč zvolí jako popisek nejčastěji se vyskytující variantu zápisu
let cityCanonical = new Map();
function buildCityCanonical() {
  const groups = new Map();
  data.forEach(r => {
    simplifyMesto(r).forEach(raw => {
      const key = normalizeCity(raw);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, new Map());
      const variants = groups.get(key);
      variants.set(raw, (variants.get(raw) || 0) + 1);
    });
  });
  cityCanonical = new Map();
  groups.forEach((variants, key) => {
    let best = null, bestCount = -1;
    variants.forEach((count, raw) => {
      if (count > bestCount) { bestCount = count; best = raw; }
    });
    cityCanonical.set(key, best);
  });
}

function onKrajChange() {
  const kraj = document.getElementById('f-kraj').value;
  const mestoSel = document.getElementById('f-mesto');
  if (!kraj) {
    mestoSel.style.display = 'none';
    mestoSel.value = '';
  } else {
    const keys = new Set();
    data.filter(r => r[C.kraj] === kraj).forEach(r => simplifyMesto(r).forEach(raw => keys.add(normalizeCity(raw))));
    const mesta = [...keys].map(key => ({ key, label: cityCanonical.get(key) || key })).sort((a, b) => a.label.localeCompare(b.label, 'cs', { numeric: true }));
    mestoSel.innerHTML = '<option value="">Všechna města</option>' +
      mesta.map(m => `<option value="${m.key}">${m.label}</option>`).join('');
    mestoSel.value = '';
    mestoSel.style.display = '';
  }
  updateFilterState();
  render();
}

// ── Fetch data.json ───────────────────────────────────────
async function fetchData() {
  const res = await fetch('/data.json');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
}

function launchApp() {
  document.getElementById('main').style.display = 'block';

  const cached = localStorage.getItem('gyno_data');
  if (cached) {
    try {
      data = JSON.parse(cached);
      populateKraje();
      render();
    } catch(e) { localStorage.removeItem('gyno_data'); }
  } else {
    document.getElementById('list').innerHTML = '<div class="empty"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Načítám data…</div>';
  }

  tick();
  refreshTimer = setInterval(tick, REFRESH_INTERVAL_MS);
}

async function tick(retried) {
  try {
    const fresh = await fetchData();
    if (fresh.length) {
      data = fresh;
      localStorage.setItem('gyno_data', JSON.stringify(data));
      populateKraje();
      render();
    } else {
      if (!data.length) document.getElementById('list').innerHTML = '<div class="empty">data.json je prázdné.</div>';
    }
  } catch(e) {
    if (!data.length && !retried) { setTimeout(() => tick(true), 1500); return; }
    if (!data.length) document.getElementById('list').innerHTML = '<div class="empty">Nepodařilo se načíst data: ' + e.message + '</div>';
  }
}

// ruční oprava konkrétních překlepů ve jméně/příjmení lékařů
const NAME_RAW_FIXES = [
  [C.krestni, '.Zuzana', 'Zuzana'],
  [C.prijmeni, 'Jahelková - Švamberková', 'Jahelková Švamberková'],
];
function fixNameTypos() {
  data.forEach(r => {
    NAME_RAW_FIXES.forEach(([col, from, to]) => {
      if ((r[col] || '').trim() === from) r[col] = to;
    });
  });
}

// ── Kraje select ─────────────────────────────────────────
let lastKraje = '';
function populateKraje() {
  fixNameTypos();
  buildCityCanonical();
  buildFirstNameLookup();
  const kraje = [...new Set(data.map(r => r[C.kraj]).filter(Boolean))].sort();
  const sig = kraje.join(',');
  if (sig === lastKraje) return;
  lastKraje = sig;
  const sel = document.getElementById('f-kraj');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Všechny kraje</option>' +
    kraje.map(k => `<option value="${k}">${k}</option>`).join('');
  sel.value = cur;
}

// ── Filters ──────────────────────────────────────────────
function updateFilterState() {
  ['f-kraj','f-mesto','f-pohlavi','f-hvezdy'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.toggle('active', el.value !== '');
  });
}

// ── Vyhledávací našeptávač ───────────────────────────────
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let currentSuggestions = [];

function updateSuggestions() {
  const box = document.getElementById('search-suggestions');
  const q = document.getElementById('search').value.trim().toLowerCase();
  if (!q || !data.length) {
    box.classList.remove('open');
    box.innerHTML = '';
    return;
  }
  const seen = new Set();
  const results = [];
  for (const r of data) {
    if (results.length >= 8) break;
    const name = [resolveFirstName(r), r[C.prijmeni]].map(s => (s || '').trim()).filter(Boolean).join(' ');
    if (name && name.toLowerCase().includes(q) && !seen.has('n:' + name)) {
      seen.add('n:' + name);
      results.push({ label: name, type: 'lékař/ka' });
    }
  }
  outer:
  for (const r of data) {
    for (const mesto of simplifyMesto(r)) {
      if (results.length >= 8) break outer;
      const key = normalizeCity(mesto);
      if (mesto.toLowerCase().includes(q) && !seen.has('m:' + key)) {
        seen.add('m:' + key);
        results.push({ label: cityCanonical.get(key) || mesto, type: 'město' });
      }
    }
  }
  for (const r of data) {
    if (results.length >= 8) break;
    const ord = (r[C.ordinace] || '').trim();
    if (ord && ord.toLowerCase().includes(q) && !seen.has('o:' + ord)) {
      seen.add('o:' + ord);
      results.push({ label: ord, type: 'ordinace' });
    }
  }
  currentSuggestions = results;
  if (!results.length) {
    box.classList.remove('open');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = results.map((r, idx) =>
    `<button class="search-suggestion" type="button" onclick="selectSuggestion(${idx})">${escapeHtml(r.label)}<span class="sug-type">${r.type}</span></button>`
  ).join('');
  box.classList.add('open');
}

function selectSuggestion(idx) {
  const value = currentSuggestions[idx] && currentSuggestions[idx].label;
  if (value == null) return;
  document.getElementById('search').value = value;
  document.getElementById('search-suggestions').classList.remove('open');
  render();
}

document.addEventListener('click', e => {
  const box = document.getElementById('search-suggestions');
  if (!box) return;
  if (!e.target.closest('.search-wrap')) box.classList.remove('open');
});

// ── Parsování data z Google Forms (D.M.YYYY HH:MM:SS) ──────
function parseDatum(str) {
  if (!str) return 0;
  const [datePart, timePart] = str.split(' ');
  const [d, m, y] = (datePart || '').split('.').map(Number);
  if (!d || !m || !y) return 0;
  const [hh, mm, ss] = (timePart || '0:0:0').split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0).getTime();
}

// ── Render ───────────────────────────────────────────────
function render() {
  const q = document.getElementById('search').value.toLowerCase();
  const kraj = document.getElementById('f-kraj').value;
  const mesto = document.getElementById('f-mesto').value;
  const pohlavi = document.getElementById('f-pohlavi').value;
  const minHvezdy = parseInt(document.getElementById('f-hvezdy').value) || 0;

  const filtered = data.filter(r => {
    const txt = [resolveFirstName(r), r[C.prijmeni], r[C.ordinace], r[C.mesto], r[C.kraj]].join(' ').toLowerCase();
    if (q && !txt.includes(q)) return false;
    if (kraj && r[C.kraj] !== kraj) return false;
    if (mesto && !simplifyMesto(r).some(raw => normalizeCity(raw) === mesto)) return false;
    if (pohlavi && (r[C.pohlavi]||'').toLowerCase() !== pohlavi) return false;
    return true;
  });

  // Chip filtry — AND mezi kategoriemi, OR uvnitř kategorie
  const colMap = { vek: C.vek, vybaveni: C.vybaveni, vzdel: C.vzdel, poplatky: C.poplatky, hac: C.hac, lgbtq: C.lgbt };
  const chipFiltered = filtered.filter(r => {
    for (const [cat, vals] of Object.entries(chipFilters)) {
      if (!vals.size) continue;
      const col = colMap[cat];
      const v = (r[col]||'').trim();
      // "Ne" musí být přesná shoda, jinak by podřetězec "ne" matchnul i "Nevím"
      if (![...vals].some(sel => sel.toLowerCase() === 'ne' ? v.toLowerCase() === 'ne' : v.toLowerCase().includes(sel.toLowerCase()))) return false;
    }
    return true;
  });

  // Seskup podle jména doktora
  const groupMap = new Map();
  chipFiltered.forEach(r => {
    const key = (resolveFirstName(r) + ' ' + (r[C.prijmeni]||'').trim()).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(r);
  });

  // Recenze u každého lékaře od nejnovější po nejstarší
  groupMap.forEach(arr => arr.sort((a, b) => parseDatum(b[C.datum]) - parseDatum(a[C.datum])));

  const sort = document.getElementById('f-sort').value;
  let groups = [...groupMap.values()].sort((a, b) => {
    if (sort === 'hvezdy') {
      const avg = g => g.reduce((s, r) => s + (parseInt(r[C.hvezdy]) || 0), 0) / g.length;
      return avg(b) - avg(a);
    }
    if (sort === 'az' || sort === 'za') {
      const name = g => ((g[0][C.prijmeni]||'') + resolveFirstName(g[0])).toLowerCase().trim();
      return sort === 'za' ? name(b).localeCompare(name(a), 'cs') : name(a).localeCompare(name(b), 'cs');
    }
    if (sort === 'nove') {
      return parseDatum(b[0][C.datum]) - parseDatum(a[0][C.datum]);
    }
    return b.length - a.length;
  });

  // Filtr hvězd podle průměru skupiny
  if (minHvezdy) {
    groups = groups.filter(reviews => {
      const avg = reviews.reduce((a, r) => a + (parseInt(r[C.hvezdy]) || 0), 0) / reviews.length;
      return avg >= minHvezdy;
    });
  }

  // Stats
  const totalReviews = groups.reduce((a, g) => a + g.length, 0);

  document.getElementById('stats').innerHTML = `
    <div class="stat"><strong>${groups.length}</strong>lékařů</div>
    <div class="stat"><strong>${totalReviews}</strong>hodnocení</div>
  `;

  if (!groups.length) {
    document.getElementById('list').innerHTML = `
      <div class="empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg>
        Žádné výsledky neodpovídají filtrům.
      </div>`;
    return;
  }

  renderGroupsChunked(groups);
}

function buildCardHtml(reviews, i) {
    const r0 = reviews[0];
    const krestni0 = resolveFirstName(r0);
    const name = [r0[C.prijmeni], krestni0].map(s => (s||'').trim()).filter(Boolean).join(' ') || 'Neznámý';
    const initials = (krestni0.charAt(0) + (r0[C.prijmeni]||'').trim().charAt(0)).toUpperCase();
    const pohlaviLow = (r0[C.pohlavi]||'').toLowerCase();
    const genderIcon = pohlaviLow === 'žena'
      ? '<svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7" r="4"/><path d="M12 13.2c-.5 0-.9.3-1.1.7l-4.4 7.6c-.3.6.1 1.3.8 1.3h9.4c.7 0 1.1-.7.8-1.3l-4.4-7.6c-.2-.4-.6-.7-1.1-.7z"/></svg>'
      : pohlaviLow === 'muž'
      ? '<svg width="25" height="25" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7" r="4"/><path d="M6 22v-3a6 6 0 0 1 12 0v3z"/></svg>'
      : '';
    const sub = [r0[C.ordinace], r0[C.mesto], r0[C.kraj]].filter(Boolean).join(' · ');
    const avgStars = reviews.reduce((a, r) => a + (parseInt(r[C.hvezdy]) || 0), 0) / reviews.length;
    const avgRounded = Math.min(Math.round(avgStars), 5);
    const starsHtml = '★'.repeat(avgRounded) + `<span class="empty-star">${'★'.repeat(5 - avgRounded)}</span>`;
    const lgbtYes = reviews.some(r => (r[C.lgbt]||'').toLowerCase().includes('ano'));
    const lgbtNo = !lgbtYes && reviews.some(r => (r[C.lgbt]||'').trim().toLowerCase() === 'ne');
    const noFees = reviews.some(r => /^ne/i.test(r[C.poplatky]||''));
    const hasFees = !noFees && reviews.some(r => (r[C.poplatky]||'').trim());
    const web = reviews.map(r => r[C.web]).find(w => w?.trim());

    const slidesHtml = reviews.map((r, ri) => {
      const hvezdy = Math.min(parseInt(r[C.hvezdy]) || 0, 5);
      const rStars = '★'.repeat(hvezdy) + `<span class="empty-star">${'★'.repeat(5 - hvezdy)}</span>`;
      const grid = [
        { l: 'Věk lékaře', v: r[C.vek] },
        { l: 'Pohlaví lékaře', v: r[C.pohlavi] },
        { l: 'Poplatky', v: r[C.poplatky] },
        { l: 'Ceny', v: r[C.ceny] },
        { l: 'Objednávací lhůta', v: r[C.objednani] },
        { l: 'Vybavení ordinace', v: r[C.vybaveni] },
        { l: 'Vzdělávání v novinkách', v: r[C.vzdel] },
        { l: '3D ultrazvuk', v: r[C.ultrazvuk] },
      ].map(f => ({ l: f.l, v: f.v || '–' }));
      const sections = [
        { l: 'Osobnost lékaře/ky', v: r[C.doktor] },
        { l: 'Sestra', v: r[C.sestra] },
        { l: 'Komplikace řešené v ordinaci', v: r[C.komplikace] },
      ].map(f => ({ l: f.l, v: f.v || '–' }));

      const opinionFields = [
        { l: 'Hormonální antikoncepci', v: [r[C.hac], r[C.hac2]].filter(Boolean).join(' ') },
        { l: 'Vysazení HA a plánování rodiny', v: r[C.hac_deti] },
        { l: 'Bylinky a doplňky stravy', v: [r[C.bylinky], r[C.bylinky2]].filter(Boolean).join(' ') },
        { l: 'Endometriózu', v: [r[C.endo], r[C.endo2]].filter(Boolean).join(' ') },
        { l: 'PCOS', v: [r[C.pcos], r[C.pcos2]].filter(Boolean).join(' ') },
        { l: 'Vaginální infekce', v: [r[C.vag], r[C.vag2]].filter(Boolean).join(' ') },
        { l: 'Problémy se sexem', v: [r[C.sex], r[C.sex2]].filter(Boolean).join(' ') },
        { l: 'Celostní přístup ke zdraví', v: [r[C.celostni], r[C.celostni2]].filter(Boolean).join(' ') },
      ].map(f => ({ l: f.l, v: f.v || '–' }));

      const restSections = [
        { l: 'Otázky na děti / plánování', v: [r[C.deti], r[C.deti2]].filter(Boolean).join(' ') },
        { l: 'Rozbory a stěry', v: [r[C.rozbory], r[C.rozbory2]].filter(Boolean).join(' ') },
        { l: 'Komunikace při vyšetření', v: r[C.komunikace] },
        { l: 'Pomoc při snaze otěhotnět', v: r[C.ivf] },
        { l: 'Závěr a poznámky', v: r[C.zaver] },
      ].map(f => ({ l: f.l, v: f.v || '–' }));

      const rawDate = r[C.datum] || '';
      const datePart = rawDate.split(' ')[0];

      return `<div class="car-slide">
        <div class="review-header">
          ${reviews.length > 1 ? `<button class="car-btn" ${ri === 0 ? 'disabled' : ''} onclick="carMove(${i},-1,${reviews.length});event.stopPropagation()">&#8249;</button>` : ''}
          <span class="review-label">${datePart || `Hodnocení ${ri + 1} / ${reviews.length}`}</span>
          <span class="stars" style="font-size:13px">${rStars}</span>
          <span class="review-num">${hvezdy} z 5</span>
          ${reviews.length > 1 ? `<button class="car-btn" ${ri === reviews.length - 1 ? 'disabled' : ''} onclick="carMove(${i},1,${reviews.length});event.stopPropagation()">&#8250;</button>` : ''}
        </div>
        ${reviews.length > 1 ? `<div class="car-dots-row">${reviews.map((_,di) => `<span class="car-dot${di===ri?' active':''}"></span>`).join('')}</div>` : ''}
        ${grid.length ? `<div class="detail-grid">${grid.map(f => `<div><div class="di-label">${f.l}</div><div class="di-val">${f.v}</div></div>`).join('')}</div>` : ''}
        ${sections.map(f => `<div class="detail-section"><div class="di-label">${f.l}</div><div class="di-val dark">${f.v}</div></div>`).join('')}
        <div class="section-group-title">Jaký má názor na</div>
        ${opinionFields.map(f => `<div class="detail-section"><div class="di-label">${f.l}</div><div class="di-val">${f.v}</div></div>`).join('')}
        ${restSections.map(f => `<div class="detail-section"><div class="di-label">${f.l}</div><div class="di-val">${f.v}</div></div>`).join('')}
      </div>`;
    }).join('');

    const reviewsHtml = `<div class="car-track-wrap" id="wrap-${i}" data-id="${i}" data-total="${reviews.length}"><div class="car-track" id="track-${i}">${slidesHtml}</div></div>`;

    return `
    <div class="card${lgbtYes ? ' lgbt-card' : ''}" id="card-${i}">
      <div class="card-top" onclick="toggle(${i})" style="cursor:pointer">
        <div class="avatar ${pohlaviLow === 'žena' ? 'f' : pohlaviLow === 'muž' ? 'm' : ''}">${genderIcon || initials || '?'}</div>
        <div class="card-info">
          <div class="card-name">${name}</div>
          ${sub ? `<div class="card-sub">${sub}</div>` : ''}
          <div class="stars">${starsHtml} <span style="font-size:12px;color:var(--text-muted);margin-left:6px">${avgStars.toFixed(1)} · ${reviews.length} ${reviews.length === 1 ? 'hodnocení' : 'hodnocení'}</span></div>
        </div>
        <svg class="chevron" id="chev-${i}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="badges" onclick="toggle(${i})" style="cursor:pointer">
        ${r0[C.kraj] ? `<span class="badge b-kraj">${r0[C.kraj]}</span>` : ''}
        ${lgbtYes ? '<span class="badge b-lgbt">LGBTQ+ friendly</span>' : ''}
        ${lgbtNo ? '<span class="badge b-fees">Není LGBTQ+ friendly</span>' : ''}
        ${noFees ? '<span class="badge b-nofees">Bez poplatků</span>' : ''}
        ${hasFees ? '<span class="badge b-fees">Poplatky</span>' : ''}
      </div>
      <div class="detail" id="det-${i}">
        ${web ? `<a href="${web}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Web ordinace
        </a>` : ''}
        ${reviewsHtml}
      </div>
    </div>`;
}

let renderToken = 0;
const RENDER_CHUNK_SIZE = 12;

function renderGroupsChunked(groups) {
  const myToken = ++renderToken;
  const listEl = document.getElementById('list');
  listEl.innerHTML = '';

  let idx = 0;
  function renderChunk() {
    if (myToken !== renderToken) return;
    const slice = groups.slice(idx, idx + RENDER_CHUNK_SIZE);
    listEl.insertAdjacentHTML('beforeend', slice.map((reviews, j) => buildCardHtml(reviews, idx + j)).join(''));
    initSwipe();
    idx += RENDER_CHUNK_SIZE;
    if (idx < groups.length) {
      requestAnimationFrame(() => setTimeout(renderChunk, 0));
    }
  }
  renderChunk();
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
    syncCarHeight(i);
    document.getElementById('card-' + i).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ── Carousel ─────────────────────────────────────────────
const carPos = {};
function syncCarHeight(id) {
  const wrap = document.getElementById('wrap-' + id);
  const track = document.getElementById('track-' + id);
  if (!wrap || !track) return;
  const activeSlide = track.children[carPos[id] || 0];
  if (activeSlide) wrap.style.height = activeSlide.offsetHeight + 'px';
}

function carMove(id, dir, total) {
  carPos[id] = Math.max(0, Math.min(total - 1, (carPos[id] || 0) + dir));
  document.getElementById('track-' + id).style.transform = `translateX(-${carPos[id] * 100}%)`;
  syncCarHeight(id);
}

function initSwipe() {
  document.querySelectorAll('.car-track-wrap').forEach(wrap => {
    if (wrap._swipe) return;
    wrap._swipe = true;
    let startX = 0;
    wrap.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    wrap.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) < 40) return;
      const id = +wrap.dataset.id;
      const total = +wrap.dataset.total;
      if (total < 2) return;
      carMove(id, dx < 0 ? 1 : -1, total);
    }, { passive: true });
  });
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
    document.getElementById('search-suggestions').classList.remove('open');
  }
});
launchApp();
