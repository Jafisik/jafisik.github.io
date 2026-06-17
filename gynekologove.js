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
const chipFilters = { vek: new Set(), vybaveni: new Set(), vzdel: new Set(), poplatky: new Set(), hac: new Set(), ultrazvuk: new Set(), lgbtq: new Set() };

function toggleGroup(id) {
  const opts = document.getElementById('grp-' + id);
  const btn = opts.previousElementSibling;
  opts.classList.toggle('open');
  btn.classList.toggle('open');
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
      setStatus('ok');
    } catch(e) { localStorage.removeItem('gyno_data'); }
  } else {
    document.getElementById('list').innerHTML = '<div class="empty"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>Načítám data…</div>';
  }

  tick();
  refreshTimer = setInterval(tick, REFRESH_INTERVAL_MS);
}

async function tick() {
  try {
    const fresh = await fetchData();
    if (fresh.length) {
      data = fresh;
      localStorage.setItem('gyno_data', JSON.stringify(data));
      setStatus('ok');
      populateKraje();
      render();
    } else {
      if (!data.length) document.getElementById('list').innerHTML = '<div class="empty">data.json je prázdné.</div>';
      setStatus('err');
    }
  } catch(e) {
    if (!data.length) document.getElementById('list').innerHTML = '<div class="empty">Nepodařilo se načíst data: ' + e.message + '</div>';
    setStatus('err');
  }
}

function setStatus(state) {
  document.getElementById('dot').className = 'dot' + (state === 'err' ? ' err' : '');
}

// ── Kraje select ─────────────────────────────────────────
let lastKraje = '';
function populateKraje() {
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
  ['f-kraj','f-pohlavi','f-hvezdy','f-lgbt'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.toggle('active', el.value !== '');
  });
}

// ── Render ───────────────────────────────────────────────
function render() {
  const q = document.getElementById('search').value.toLowerCase();
  const kraj = document.getElementById('f-kraj').value;
  const pohlavi = document.getElementById('f-pohlavi').value;
  const minHvezdy = parseInt(document.getElementById('f-hvezdy').value) || 0;
  const onlyLgbt = document.getElementById('f-lgbt').value === 'ano';

  const filtered = data.filter(r => {
    const txt = [r[C.krestni], r[C.prijmeni], r[C.ordinace], r[C.mesto], r[C.kraj]].join(' ').toLowerCase();
    if (q && !txt.includes(q)) return false;
    if (kraj && r[C.kraj] !== kraj) return false;
    if (pohlavi && (r[C.pohlavi]||'').toLowerCase() !== pohlavi) return false;
    if (onlyLgbt && !(r[C.lgbt]||'').toLowerCase().includes('ano')) return false;
    return true;
  });

  // Chip filtry — AND mezi kategoriemi, OR uvnitř kategorie
  const colMap = { vek: C.vek, vybaveni: C.vybaveni, vzdel: C.vzdel, poplatky: C.poplatky, hac: C.hac, ultrazvuk: C.ultrazvuk, lgbtq: C.lgbt };
  const chipFiltered = filtered.filter(r => {
    for (const [cat, vals] of Object.entries(chipFilters)) {
      if (!vals.size) continue;
      const col = colMap[cat];
      const v = (r[col]||'').trim();
      if (cat === 'poplatky') {
        if (![...vals].some(() => /^ne/i.test(v))) return false;
      } else if (cat === 'lgbtq') {
        if (![...vals].some(sel => sel === 'ne' ? v.toLowerCase() === 'ne' : v.toLowerCase().includes(sel))) return false;
      } else {
        if (![...vals].some(sel => v.toLowerCase().includes(sel.toLowerCase()))) return false;
      }
    }
    return true;
  });

  // Seskup podle jména doktora
  const groupMap = new Map();
  chipFiltered.forEach(r => {
    const key = ((r[C.krestni]||'').trim() + ' ' + (r[C.prijmeni]||'').trim()).toLowerCase().replace(/\s+/g, ' ');
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(r);
  });

  const sort = document.getElementById('f-sort').value;
  let groups = [...groupMap.values()].sort((a, b) => {
    if (sort === 'hvezdy') {
      const avg = g => g.reduce((s, r) => s + (parseInt(r[C.hvezdy]) || 0), 0) / g.length;
      return avg(b) - avg(a);
    }
    if (sort === 'az') {
      const name = g => ((g[0][C.prijmeni]||'') + (g[0][C.krestni]||'')).toLowerCase().trim();
      return name(a).localeCompare(name(b), 'cs');
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
  const allStars = groups.flatMap(g => g.map(r => parseInt(r[C.hvezdy]) || 0));
  const avg = allStars.length ? (allStars.reduce((a, b) => a + b, 0) / allStars.length).toFixed(1) : '–';
  const lgbtN = groups.filter(g => g.some(r => (r[C.lgbt]||'').toLowerCase().includes('ano'))).length;

  document.getElementById('stats').innerHTML = `
    <div class="stat"><strong>${groups.length}</strong>lékařů</div>
    <div class="stat"><strong>${totalReviews}</strong>hodnocení</div>
    <div class="stat"><strong>${avg}</strong>průměr hvězd</div>
    <div class="stat"><strong>${lgbtN}</strong>LGBTQ+ friendly</div>
  `;

  if (!groups.length) {
    document.getElementById('list').innerHTML = `
      <div class="empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6M11 8v6"/></svg>
        Žádné výsledky neodpovídají filtrům.
      </div>`;
    return;
  }

  document.getElementById('list').innerHTML = groups.map((reviews, i) => {
    const r0 = reviews[0];
    const name = [r0[C.krestni], r0[C.prijmeni]].map(s => (s||'').trim()).filter(Boolean).join(' ') || 'Neznámý';
    const initials = ((r0[C.krestni]||'').trim().charAt(0) + (r0[C.prijmeni]||'').trim().charAt(0)).toUpperCase();
    const pohlaviLow = (r0[C.pohlavi]||'').toLowerCase();
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
        { l: 'Pohlaví', v: r[C.pohlavi] },
        { l: 'Poplatky', v: r[C.poplatky] },
        { l: 'Ceny', v: r[C.ceny] },
        { l: 'Objednávací lhůta', v: r[C.objednani] },
        { l: 'Vybavení ordinace', v: r[C.vybaveni] },
        { l: 'Vzdělávání v novinkách', v: r[C.vzdel] },
        { l: '3D ultrazvuk', v: r[C.ultrazvuk] },
      ].filter(f => f.v);
      const sections = [
        { l: 'Osobnost lékaře/ky', v: r[C.doktor] },
        { l: 'Sestra', v: r[C.sestra] },
        { l: 'Komplikace řešené v ordinaci', v: r[C.komplikace] },
        { l: 'Hormonální antikoncepce', v: [r[C.hac], r[C.hac2]].filter(Boolean).join(' ') },
        { l: 'Vysazení HA bere jako plánování rodiny', v: r[C.hac_deti] },
        { l: 'Bylinky a doplňky stravy', v: [r[C.bylinky], r[C.bylinky2]].filter(Boolean).join(' ') },
        { l: 'Endometrióza', v: [r[C.endo], r[C.endo2]].filter(Boolean).join(' ') },
        { l: 'PCOS', v: [r[C.pcos], r[C.pcos2]].filter(Boolean).join(' ') },
        { l: 'Vaginální infekce', v: [r[C.vag], r[C.vag2]].filter(Boolean).join(' ') },
        { l: 'Problémy se sexem', v: [r[C.sex], r[C.sex2]].filter(Boolean).join(' ') },
        { l: 'Celostní přístup ke zdraví', v: [r[C.celostni], r[C.celostni2]].filter(Boolean).join(' ') },
        { l: 'Otázky na děti / plánování', v: [r[C.deti], r[C.deti2]].filter(Boolean).join(' ') },
        { l: 'Rozbory a stěry', v: [r[C.rozbory], r[C.rozbory2]].filter(Boolean).join(' ') },
        { l: 'Komunikace při vyšetření', v: r[C.komunikace] },
        { l: 'Pomoc při snaze otěhotnět', v: r[C.ivf] },
        { l: 'Závěr a poznámky', v: r[C.zaver] },
      ].filter(f => f.v);

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
        ${sections.map(f => `<div class="detail-section"><div class="di-label">${f.l}</div><div class="di-val">${f.v}</div></div>`).join('')}
      </div>`;
    }).join('');

    const reviewsHtml = `<div class="car-track-wrap" data-id="${i}" data-total="${reviews.length}"><div class="car-track" id="track-${i}">${slidesHtml}</div></div>`;

    return `
    <div class="card${lgbtYes ? ' lgbt-card' : ''}" id="card-${i}">
      <div class="card-top" onclick="toggle(${i})" style="cursor:pointer">
        <div class="avatar ${pohlaviLow === 'žena' ? 'f' : pohlaviLow === 'muž' ? 'm' : ''}">${initials || '?'}</div>
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
  }).join('');
  initSwipe();
}

function toggle(i) {
  document.getElementById('det-' + i).classList.toggle('open');
  document.getElementById('chev-' + i).classList.toggle('open');
}

// ── Carousel ─────────────────────────────────────────────
const carPos = {};
function carMove(id, dir, total) {
  carPos[id] = Math.max(0, Math.min(total - 1, (carPos[id] || 0) + dir));
  document.getElementById('track-' + id).style.transform = `translateX(-${carPos[id] * 100}%)`;
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

// ── Init ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('about-modal').classList.remove('open');
});
launchApp();
