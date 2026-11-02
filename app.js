/* Haushalt – App/UI */
(function () {
  'use strict';
  const LS = 'haushalt.v1';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const eur = n => EUR.format(Math.round((Number(n) || 0) * 100) / 100);
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const nowIso = () => new Date().toISOString();
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const ymOf = d => d.slice(0, 7);
  const ymAdd = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
  const ymLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
  const toNum = v => { const n = parseFloat(String(v || '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isNaN(n) ? 0 : n; };
  const fmtInput = n => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',');
  const dDE = d => d ? d.split('-').reverse().join('.') : '';
  const EVERY = { 1: 'monatlich', 3: 'vierteljährlich', 6: 'halbjährlich', 12: 'jährlich' };

  // ================= Speicher =================
  let S;
  try { S = JSON.parse(localStorage.getItem(LS)); } catch (e) { S = null; }
  if (!S || !S.recs) S = { recs: {}, dirty: [], lastPull: null, me: '', sync: null, seeded: 0, ui: {} };
  if (!S.ui) S.ui = {};
  const SEED_TS = '2000-01-01T00:00:00.000Z';
  function seed() {
    if (S.seeded >= 1) return;
    HL.defaultCats().forEach(c => { const { id, ...data } = c; S.recs[id] = S.recs[id] || { id, kind: 'cat', data, updated_at: SEED_TS, deleted: false }; });
    HL.defaultRules().forEach(r => { const { id, ...data } = r; S.recs[id] = S.recs[id] || { id, kind: 'rule', data, updated_at: SEED_TS, deleted: false }; });
    S.recs.set_household = S.recs.set_household || { id: 'set_household', kind: 'setting', data: { income: 0, threshold: 8 }, updated_at: SEED_TS, deleted: false };
    S.seeded = 1;
  }
  seed();
  let saveT;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { toast('Speicher voll – bitte Daten exportieren'); } }, 50); }
  function saveNow() { clearTimeout(saveT); localStorage.setItem(LS, JSON.stringify(S)); }
  function markDirty(id) { if (!S.dirty.includes(id)) S.dirty.push(id); }
  function put(kind, id, data) { S.recs[id] = { id, kind, data, updated_at: nowIso(), deleted: false }; markDirty(id); save(); schedSync(); }
  function del(id) { const r = S.recs[id]; if (!r) return; r.deleted = true; r.updated_at = nowIso(); markDirty(id); save(); schedSync(); }
  function list(kind) { return Object.values(S.recs).filter(r => r.kind === kind && !r.deleted).map(r => Object.assign({ id: r.id }, r.data)); }
  function get(id) { const r = S.recs[id]; return r && !r.deleted ? Object.assign({ id: r.id }, r.data) : null; }
  const setting = () => { const o = Object.assign({ income: 0, threshold: 8 }, (get('set_household') || {})); delete o.id; return o; };

  // ================= Gruppen =================
  function cats() {
    const all = list('cat');
    const map = {}; all.forEach(c => map[c.id] = c);
    // verwaiste Untergruppen (Hauptgruppe gelöscht) gelten als nicht vorhanden
    all.forEach(c => { if (c.parent && !map[c.parent]) delete map[c.id]; });
    if (!map[HL.UNSORTED]) map[HL.UNSORTED] = { id: HL.UNSORTED, name: 'Unsortiert', parent: null, color: '#94a3b8', sort: 9999 };
    return map;
  }
  const mains = M => Object.values(M).filter(c => !c.parent).sort((a, b) => (a.id === HL.UNSORTED) - (b.id === HL.UNSORTED) || (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
  const subsOf = (M, pid) => Object.values(M).filter(c => c.parent === pid).sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name));
  const resolve = (M, id) => (M[id] ? id : HL.UNSORTED);
  const mainOf = (M, id) => { const c = M[resolve(M, id)]; return c.parent || c.id; };
  const colorOf = (M, id) => M[mainOf(M, id)].color || '#888';
  const catLabel = (M, id) => { const c = M[resolve(M, id)]; return c.parent ? `${M[c.parent].name} › ${c.name}` : c.name; };
  function catOptions(M, sel) {
    let h = '';
    mains(M).forEach(m => {
      const subs = subsOf(M, m.id);
      if (!subs.length) { h += `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)}</option>`; return; }
      h += `<optgroup label="${esc(m.name)}">`;
      subs.forEach(s => h += `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`);
      h += `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(m.name)} (allgemein)</option></optgroup>`;
    });
    return h;
  }
  function rulesList() { return list('rule'); }
  function classify(name) { const M = cats(); return HL.classify(name, rulesList(), id => !!M[id] && id !== HL.UNSORTED); }
  function learn(name, cat) {
    const p = HL.norm(name); if (!p || !cat) return;
    const id = 'rl_' + p.replace(/ /g, '_').slice(0, 60);
    const ex = get(id);
    if (ex && ex.cat === cat) return;
    put('rule', id, { pattern: p, whole: false, cat, learned: true });
  }

  // ================= Sync (Supabase REST, ohne Bibliothek) =================
  let syncing = false, syncT, syncState = 'off', syncMsg = '';
  function schedSync() { if (!S.sync) return; clearTimeout(syncT); syncT = setTimeout(syncNow, 1200); }
  function hdr() { const k = S.sync.key; const h = { apikey: k, 'Content-Type': 'application/json' }; if (/^eyJ/.test(k)) h.Authorization = 'Bearer ' + k; return h; }
  async function rpc(fn, body) {
    const res = await fetch(S.sync.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: hdr(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(fn + ' ' + res.status + ' ' + (await res.text()).slice(0, 160));
    const t = await res.text(); return t ? JSON.parse(t) : null;
  }
  async function syncNow(manual) {
    if (!S.sync || syncing) return;
    if (!navigator.onLine) { syncState = 'err'; syncMsg = 'offline'; updSyncUi(); return; }
    syncing = true; syncState = 'busy'; updSyncUi();
    try {
      // 1) Änderungen holen (Server-Zeitstempel, 15 s Überlappung)
      let since = S.lastPull ? new Date(Date.parse(S.lastPull) - 15000).toISOString() : '1970-01-01T00:00:00.000Z';
      let maxTs = S.lastPull, changed = 0;
      for (let guard = 0; guard < 50; guard++) {
        const rows = await rpc('hh_pull', { p_hh: S.sync.hh, p_since: since }) || [];
        rows.forEach(row => {
          const up = new Date(row.updated_at).toISOString();
          const loc = S.recs[row.id];
          if (!loc || Date.parse(up) >= Date.parse(loc.updated_at)) {
            if (!loc || loc.updated_at !== up || JSON.stringify(loc.data) !== JSON.stringify(row.data) || loc.deleted !== row.deleted) changed++;
            S.recs[row.id] = { id: row.id, kind: row.kind, data: row.data, updated_at: up, deleted: !!row.deleted };
            S.dirty = S.dirty.filter(x => x !== row.id);
          }
          const ts = new Date(row.synced_at).toISOString();
          if (!maxTs || Date.parse(ts) > Date.parse(maxTs)) maxTs = ts;
        });
        if (rows.length < 2000) break;
        const next = new Date(rows[rows.length - 1].synced_at).toISOString();
        if (next === since) break;
        since = next;
      }
      S.lastPull = maxTs;
      // 2) Eigene Änderungen senden (Server übernimmt nur, wenn neuer)
      const ids = S.dirty.slice(), stamp = {};
      const batch = ids.map(id => S.recs[id]).filter(Boolean).map(r => { stamp[r.id] = r.updated_at; return { id: r.id, kind: r.kind, data: r.data, updated_at: r.updated_at, deleted: !!r.deleted }; });
      for (let i = 0; i < batch.length; i += 500) await rpc('hh_push', { p_hh: S.sync.hh, p_rows: batch.slice(i, i + 500) });
      S.dirty = S.dirty.filter(id => !(id in stamp) || (S.recs[id] && S.recs[id].updated_at !== stamp[id]));
      S.lastSyncOk = nowIso();
      saveNow();
      syncState = 'ok'; syncMsg = '';
      if (changed && !sheetOpen()) render();
      if (manual) toast(changed ? `Synchronisiert – ${changed} Änderung(en) geladen` : 'Alles aktuell');
    } catch (e) {
      syncState = 'err'; syncMsg = String(e.message || e);
      if (manual) toast('Sync-Fehler: ' + syncMsg);
    } finally { syncing = false; updSyncUi(); }
  }
  function updSyncUi() { $$('.syncdot').forEach(d => d.className = 'syncdot ' + (S.sync ? syncState : '')); const t = $('#syncTxt'); if (t) t.textContent = syncText(); }
  function syncText() {
    if (!S.sync) return 'Nicht verbunden – Daten nur auf diesem iPhone';
    if (syncState === 'busy') return 'Synchronisiere …';
    if (syncState === 'err') return 'Fehler: ' + syncMsg;
    return 'Verbunden' + (S.lastSyncOk ? ' · zuletzt ' + new Date(S.lastSyncOk).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '') + (S.dirty.length ? ` · ${S.dirty.length} ausstehend` : '');
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
  window.addEventListener('online', () => syncNow());
  setInterval(() => { if (!document.hidden) syncNow(); }, 30000);

  // ================= UI-Grundgerüst =================
  let tab = 'home';
  let curYm = ymOf(today());
  const open = new Set();
  const view = $('#view');

  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2600); }

  // Sheet-Stapel
  const stack = [];
  const sheetOpen = () => stack.length > 0;
  function openSheet(fn) { stack.push(fn); drawSheet(); }
  function replaceSheet(fn) { stack.pop(); stack.push(fn); drawSheet(); }
  function drawSheet() {
    const sh = $('#sheet');
    const top = stack[stack.length - 1];
    if (!top) { sh.classList.remove('on'); $('#ov').classList.remove('on'); setTimeout(() => { if (!stack.length) sh.innerHTML = ''; }, 300); return; }
    const o = top();
    sh.innerHTML = `<div class="hd"><button type="button" data-close>${esc(o.left || 'Zurück')}</button><b>${esc(o.title || '')}</b><button type="button" data-ok>${esc(o.right || '')}</button></div><div class="bd">${o.html}</div>`;
    sh.classList.add('on'); $('#ov').classList.add('on');
    $('[data-close]', sh).onclick = () => closeSheet();
    const ok = $('[data-ok]', sh);
    if (o.onOk) ok.onclick = () => o.onOk(sh); else ok.style.visibility = 'hidden';
    if (o.mount) o.mount(sh);
    $('.bd', sh).scrollTop = 0;
  }
  function closeSheet(all) { if (all) stack.length = 0; else stack.pop(); drawSheet(); render(); }
  $('#ov').onclick = () => closeSheet(true);

  $$('#tabs button').forEach(b => b.onclick = () => {
    const t = b.dataset.tab;
    if (t === 'add') return openSheet(addSheet);
    tab = t; $$('#tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === t)); render(); window.scrollTo(0, 0);
  });

  function render() {
    if (tab === 'home') view.innerHTML = homeView();
    else if (tab === 'receipts') view.innerHTML = receiptsView();
    else if (tab === 'fixed') view.innerHTML = fixedView();
    else view.innerHTML = moreView();
    bindView();
    updSyncUi();
  }

  // ================= Daten für einen Monat =================
  function monthLines(ym, M) {
    M = M || cats();
    const mode = S.ui.fixMode || 'anteilig';
    const out = [];
    list('receipt').forEach(r => {
      if (!r.date || ymOf(r.date) !== ym) return;
      (r.items || []).forEach(it => out.push({ type: 'var', cat: resolve(M, it.cat), amount: Number(it.amount) || 0, name: it.name, rid: r.id, iid: it.id, by: r.by || '', store: r.store, date: r.date }));
    });
    list('fixed').forEach(f => {
      if (!HL.fixedActive(f, ym)) return;
      const amt = mode === 'faellig' ? (HL.fixedDue(f, ym) ? Number(f.amount) || 0 : 0) : HL.fixedMonthly(f);
      if (amt) out.push({ type: 'fix', cat: resolve(M, f.cat), amount: amt, name: f.name, fid: f.id });
    });
    return out;
  }

  // ================= Übersicht =================
  function homeView() {
    const M = cats();
    const st = setting();
    const L = monthLines(curYm, M);
    const total = L.reduce((a, l) => a + l.amount, 0);
    const fix = L.filter(l => l.type === 'fix').reduce((a, l) => a + l.amount, 0);
    const vari = total - fix;
    const uns = L.filter(l => l.cat === HL.UNSORTED && l.type === 'var');
    // nach Hauptgruppe
    const byMain = {};
    L.forEach(l => { const m = mainOf(M, l.cat); (byMain[m] = byMain[m] || { amount: 0, lines: [] }).amount += l.amount; byMain[m].lines.push(l); });
    const mainsSorted = Object.keys(byMain).filter(k => Math.abs(byMain[k].amount) > 0.004).sort((a, b) => byMain[b].amount - byMain[a].amount);
    const pos = mainsSorted.filter(k => byMain[k].amount > 0);
    const posTotal = pos.reduce((a, k) => a + byMain[k].amount, 0);

    let h = `<div class="monthnav"><button type="button" data-act="prev" aria-label="Vormonat">‹</button><div style="text-align:center"><div class="mid">${ymLabel(curYm)}</div><div class="small muted"><span class="syncdot"></span><span id="syncTxtShort">${S.sync ? 'gemeinsam' : 'nur lokal'}</span></div></div><button type="button" data-act="next" aria-label="Folgemonat">›</button></div>`;
    h += `<div class="card"><div class="muted small">Ausgaben gesamt</div><div class="big num">${eur(total)}</div>
      <div class="row small" style="margin-top:6px;gap:14px"><span>Fix <b class="num">${eur(fix)}</b></span><span>Variabel <b class="num">${eur(vari)}</b></span></div>`;
    if (st.income > 0) {
      const left = st.income - total; const pct = Math.min(100, Math.max(0, total / st.income * 100));
      h += `<div class="bar" style="height:8px;margin-top:12px"><i style="width:${pct}%;background:${left < 0 ? 'var(--bad)' : 'var(--accent)'}"></i></div>
        <div class="row between small" style="margin-top:6px"><span class="muted">Einkommen ${eur(st.income)}</span><b class="num" style="color:${left < 0 ? 'var(--bad)' : 'var(--good)'}">${left < 0 ? 'Minus' : 'Übrig'} ${eur(Math.abs(left))}</b></div>`;
    }
    h += `<div class="seg" style="margin-top:12px"><button type="button" data-fixmode="anteilig" class="${(S.ui.fixMode || 'anteilig') === 'anteilig' ? 'on' : ''}">Fixkosten anteilig / Monat</button><button type="button" data-fixmode="faellig" class="${S.ui.fixMode === 'faellig' ? 'on' : ''}">nur wenn fällig</button></div></div>`;

    if (uns.length) h += `<button type="button" class="banner" data-act="unsorted"><span style="font-size:20px">🧺</span><span class="grow"><b>${uns.length} Position(en) unsortiert</b><br><span class="small muted">Tippen zum Zuordnen – die App merkt sich das.</span></span><span class="chev">›</span></button>`;

    if (!L.length) {
      h += `<div class="card empty">Noch keine Ausgaben in diesem Monat.<br><br><button type="button" class="btn" data-act="add">Ersten Bon scannen</button></div>`;
    } else {
      // Donut
      let acc = 0, segs = '';
      pos.forEach(k => { const p = byMain[k].amount / posTotal * 100; segs += `<circle r="15.915" cx="21" cy="21" fill="none" stroke="${M[k].color || '#888'}" stroke-width="6" stroke-dasharray="${Math.max(0, p - 0.6)} ${100 - Math.max(0, p - 0.6)}" stroke-dashoffset="${25 - acc}"></circle>`; acc += p; });
      h += `<div class="card"><div class="donutwrap"><svg viewBox="0 0 42 42" role="img" aria-label="Verteilung nach Gruppen"><circle r="15.915" cx="21" cy="21" fill="none" stroke="var(--line)" stroke-width="6"></circle>${segs}<text x="21" y="20" text-anchor="middle" font-size="4" fill="var(--muted)">Gruppen</text><text x="21" y="25.5" text-anchor="middle" font-size="5.2" font-weight="700" fill="currentColor">${pos.length}</text></svg><div class="legend">`;
      pos.slice(0, 7).forEach(k => h += `<div class="row"><span class="dot" style="background:${M[k].color || '#888'}"></span><span class="grow ellip">${esc(M[k].name)}</span><span class="num muted">${(v => v < 1 ? '<1' : Math.round(v))(byMain[k].amount / posTotal * 100)} %</span></div>`);
      h += `</div></div></div>`;

      // Gruppenliste mit schlauer Zusammenfassung
      h += `<h2>Nach Gruppen</h2><div class="list">`;
      mainsSorted.forEach(k => {
        const g = byMain[k], c = M[k], isOpen = open.has(k);
        const pct = posTotal > 0 ? Math.max(0, g.amount / posTotal * 100) : 0;
        h += `<button type="button" class="li" data-main="${k}"><span class="dot" style="background:${c.color || '#888'}"></span><span class="grow"><span class="row between"><span class="ellip">${esc(c.name)}</span><b class="num">${eur(g.amount)}</b></span><span class="bar"><i style="width:${pct}%;background:${c.color || '#888'}"></i></span></span><span class="chev">${isOpen ? '⌄' : '›'}</span></button>`;
        if (isOpen) {
          const bySub = {};
          g.lines.forEach(l => { const key = l.cat; (bySub[key] = bySub[key] || { id: key, name: M[key].parent ? M[key].name : 'Allgemein', amount: 0, count: 0 }); bySub[key].amount += l.amount; bySub[key].count++; });
          HL.foldSmall(Object.values(bySub), st.threshold).forEach(s => {
            const ids = s.folded ? s.folded.map(f => f.id).join(',') : s.id;
            const nm = s.folded ? `Weitere (${s.folded.map(f => f.name).join(', ')})` : s.name;
            h += `<button type="button" class="li sub" data-sub="${ids}" data-title="${esc(c.name + ' › ' + (s.folded ? 'Weitere' : s.name))}"><span class="grow ellip small">${esc(nm)}</span><span class="pill">${s.count}</span><b class="num small">${eur(s.amount)}</b><span class="chev">›</span></button>`;
          });
        }
      });
      h += `</div>`;
    }

    // Verlauf 6 Monate
    const months = []; for (let i = 5; i >= 0; i--) months.push(ymAdd(curYm, -i));
    const data = months.map(ym => { const l = monthLines(ym, M); const f = l.filter(x => x.type === 'fix').reduce((a, x) => a + x.amount, 0); const v = l.filter(x => x.type === 'var').reduce((a, x) => a + x.amount, 0); return { ym, f: Math.max(0, f), v: Math.max(0, v) }; });
    const mx = Math.max(1, ...data.map(d => d.f + d.v));
    h += `<h2>Verlauf</h2><div class="card"><div class="bars">`;
    data.forEach(d => h += `<div class="b ${d.ym === curYm ? 'cur' : ''}"><span class="small num muted" style="font-size:10px">${d.f + d.v > 0 ? Math.round(d.f + d.v) : ''}</span><div class="stack"><i style="height:${d.f / mx * 90}px;background:var(--muted);opacity:.45"></i><i style="height:${d.v / mx * 90}px;background:var(--accent)"></i></div><span class="lbl">${MONTHS[+d.ym.slice(5) - 1].slice(0, 3)}</span></div>`);
    h += `</div><div class="row small muted" style="gap:14px;margin-top:8px"><span class="row" style="gap:5px"><span class="dot" style="background:var(--accent)"></span>Variabel</span><span class="row" style="gap:5px"><span class="dot" style="background:var(--muted);opacity:.45"></span>Fix</span></div></div>`;

    // Wer hat eingekauft
    const byWho = {}; L.filter(l => l.type === 'var').forEach(l => { const w = l.by || '–'; byWho[w] = (byWho[w] || 0) + l.amount; });
    const who = Object.keys(byWho);
    if (who.length > 1 || (who.length === 1 && who[0] !== '–')) {
      h += `<h2>Eingekauft von</h2><div class="list">`;
      who.sort((a, b) => byWho[b] - byWho[a]).forEach(w => h += `<div class="li"><span class="grow">${esc(w)}</span><b class="num">${eur(byWho[w])}</b></div>`);
      h += `</div>`;
    }
    return h;
  }

  // Positionen einer (oder mehrerer) Untergruppe(n) – zum Umsortieren
  function linesSheet(title, catIds, onlyType) {
    return () => {
      const M = cats();
      const L = monthLines(curYm, M).filter(l => catIds.includes(l.cat) && (!onlyType || l.type === onlyType));
      let h = `<p class="small muted" style="margin:0 4px 10px">${ymLabel(curYm)} · Gruppe ändern = App lernt diesen Artikel.</p><div class="list">`;
      if (!L.length) h += `<div class="empty">Keine Positionen.</div>`;
      L.sort((a, b) => b.amount - a.amount).forEach((l, i) => {
        if (l.type === 'fix') h += `<button type="button" class="li" data-fix="${l.fid}"><span class="grow"><span class="ellip">${esc(l.name)}</span><span class="small muted">Fixkosten</span></span><b class="num">${eur(l.amount)}</b><span class="chev">›</span></button>`;
        else h += `<div class="li" style="flex-wrap:wrap"><span class="grow"><span class="ellip">${esc(l.name)}</span><span class="small muted">${esc(l.store || '')} · ${dDE(l.date)}</span></span><b class="num">${eur(l.amount)}</b><select data-recat="${i}" style="flex-basis:100%;font-size:14px;padding:7px 10px">${catOptions(M, l.cat)}</select></div>`;
      });
      h += `</div>`;
      return {
        title, left: 'Fertig', html: h, mount: sh => {
          $$('[data-recat]', sh).forEach(sel => sel.onchange = () => {
            const l = L.sort((a, b) => b.amount - a.amount)[+sel.dataset.recat];
            const r = get(l.rid); if (!r) return;
            r.items = r.items.map(it => it.id === l.iid ? Object.assign({}, it, { cat: sel.value, manual: true }) : it);
            const { id, ...data } = r; put('receipt', id, data);
            learn(l.name, sel.value);
            toast('Gemerkt: „' + l.name + '“ → ' + catLabel(cats(), sel.value));
          });
          $$('[data-fix]', sh).forEach(b => b.onclick = () => openSheet(fixedSheet(b.dataset.fix)));
        }
      };
    };
  }

  // ================= Belege =================
  function receiptsView() {
    const q = HL.norm(S.ui.q || '');
    let R = list('receipt').sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || ''));
    if (q) R = R.filter(r => HL.norm((r.store || '') + ' ' + (r.items || []).map(i => i.name).join(' ')).includes(q));
    let h = `<h1>Belege</h1><input type="search" id="q" placeholder="Suchen (Markt oder Artikel)" value="${esc(S.ui.q || '')}" style="margin-bottom:12px">`;
    if (!R.length) return h + `<div class="card empty">${q ? 'Nichts gefunden.' : 'Noch keine Belege.'}</div>`;
    let last = '';
    R.forEach(r => {
      const ym = ymOf(r.date || '0000-00');
      if (ym !== last) { if (last) h += `</div>`; h += `<h2>${r.date ? ymLabel(ym) : 'Ohne Datum'}</h2><div class="list">`; last = ym; }
      const sum = (r.items || []).reduce((a, i) => a + (Number(i.amount) || 0), 0);
      const uns = (r.items || []).filter(i => !cats()[i.cat] || i.cat === HL.UNSORTED).length;
      h += `<button type="button" class="li" data-rec="${r.id}"><span class="grow"><span class="ellip"><b>${esc(r.store || 'Ausgabe')}</b></span><span class="small muted">${dDE(r.date)} · ${(r.items || []).length} Pos.${r.by ? ' · ' + esc(r.by) : ''}</span></span>${uns ? `<span class="pill" style="color:var(--warn)">${uns} offen</span>` : ''}<b class="num">${eur(sum)}</b><span class="chev">›</span></button>`;
    });
    return h + `</div>`;
  }

  // ================= Fixkosten =================
  function fixedView() {
    const M = cats();
    const F = list('fixed').sort((a, b) => mainOf(M, a.cat).localeCompare(mainOf(M, b.cat)) || b.amount - a.amount);
    const act = F.filter(f => HL.fixedActive(f, ymOf(today())));
    const monthly = act.reduce((a, f) => a + HL.fixedMonthly(f), 0);
    let h = `<h1>Fixkosten</h1><div class="card row between"><div><div class="muted small">pro Monat (anteilig)</div><div class="big num">${eur(monthly)}</div></div><div style="text-align:right"><div class="muted small">pro Jahr</div><div class="mid num">${eur(monthly * 12)}</div></div></div>`;
    h += `<button type="button" class="btn block" data-act="newfix" style="margin-bottom:12px">+ Fixkosten hinzufügen</button>`;
    if (!F.length) return h + `<div class="card empty">Miete, Versicherungen, Strom, Handy, Abos … hier eintragen. Sie fließen automatisch in jeden Monat ein.</div>`;
    let lastM = '';
    F.forEach(f => {
      const m = mainOf(M, f.cat);
      if (m !== lastM) { if (lastM) h += `</div>`; h += `<h2>${esc(M[m].name)}</h2><div class="list">`; lastM = m; }
      const inactive = !HL.fixedActive(f, ymOf(today()));
      h += `<button type="button" class="li" data-fix="${f.id}" style="${inactive ? 'opacity:.5' : ''}"><span class="dot" style="background:${colorOf(M, f.cat)}"></span><span class="grow"><span class="ellip">${esc(f.name)}</span><span class="small muted">${EVERY[f.every] || f.every + '-monatlich'}${+f.every > 1 ? ' · ' + eur(HL.fixedMonthly(f)) + '/Monat' : ''}${inactive ? ' · inaktiv' : ''}</span></span><b class="num">${eur(f.amount)}</b><span class="chev">›</span></button>`;
    });
    return h + `</div>`;
  }

  function fixedSheet(id) {
    return () => {
      const M = cats();
      const f = id ? get(id) : { name: '', amount: 0, every: 1, cat: '', start: ymOf(today()), end: '' };
      const isNew = !id;
      let catManual = !!id;
      const h = `<div class="field"><label>Bezeichnung</label><input id="fName" value="${esc(f.name)}" placeholder="z. B. Miete, Haftpflicht, Handyvertrag"></div>
        <div class="row" style="gap:10px"><div class="field grow"><label>Betrag (€)</label><input id="fAmt" inputmode="decimal" value="${f.amount ? fmtInput(f.amount) : ''}" placeholder="0,00"></div>
        <div class="field grow"><label>Rhythmus</label><select id="fEvery">${Object.keys(EVERY).map(k => `<option value="${k}" ${+k === +f.every ? 'selected' : ''}>${EVERY[k]}</option>`).join('')}</select></div></div>
        <div class="field"><label>Gruppe</label><select id="fCat">${catOptions(M, f.cat || HL.UNSORTED)}</select></div>
        <div class="row" style="gap:10px"><div class="field grow"><label>Ab (Monat der 1. Zahlung)</label><input type="month" id="fStart" value="${esc(f.start || '')}"></div>
        <div class="field grow"><label>Bis (optional)</label><input type="month" id="fEnd" value="${esc(f.end || '')}"></div></div>
        ${isNew ? '' : '<button type="button" class="btn danger block" id="fDel">Fixkosten löschen</button>'}`;
      return {
        title: isNew ? 'Neue Fixkosten' : 'Fixkosten', left: 'Abbrechen', right: 'Sichern', html: h,
        mount: sh => {
          $('#fName', sh).oninput = e => { if (!catManual) { const c = classify(e.target.value); $('#fCat', sh).value = c; } };
          $('#fCat', sh).onchange = () => catManual = true;
          if (isNew) setTimeout(() => $('#fName', sh).focus(), 300);
          const d = $('#fDel', sh); if (d) d.onclick = () => { if (confirm('Wirklich löschen?')) { del(id); closeSheet(); toast('Gelöscht'); } };
        },
        onOk: sh => {
          const name = $('#fName', sh).value.trim(); const amount = toNum($('#fAmt', sh).value);
          if (!name || !amount) return toast('Bitte Bezeichnung und Betrag eingeben');
          const data = { name, amount, every: +$('#fEvery', sh).value, cat: $('#fCat', sh).value, start: $('#fStart', sh).value || ymOf(today()), end: $('#fEnd', sh).value || '' };
          put('fixed', id || 'f_' + uid(), data);
          closeSheet(); toast('Gespeichert');
        }
      };
    };
  }

  // ================= Neu: Scan / manuell =================
  function addSheet() {
    return {
      title: 'Neue Ausgabe', left: 'Schließen', html: `
      <button type="button" class="opt" data-a="cam"><span class="ic">📷</span><span class="grow"><b>Kassenbon fotografieren</b><br><span class="small muted">Artikel werden erkannt und automatisch gruppiert</span></span></button>
      <button type="button" class="opt" data-a="pic"><span class="ic">🖼️</span><span class="grow"><b>Bon aus Fotos wählen</b><br><span class="small muted">Lange Bons: mehrere Fotos von oben nach unten</span></span></button>
      <button type="button" class="opt" data-a="quick"><span class="ic">⚡</span><span class="grow"><b>Schnelle Ausgabe</b><br><span class="small muted">Ein Betrag, z. B. Tanken, Friseur, Restaurant</span></span></button>
      <button type="button" class="opt" data-a="manual"><span class="ic">✍️</span><span class="grow"><b>Beleg manuell erfassen</b><br><span class="small muted">Mehrere Positionen ohne Foto</span></span></button>
      <button type="button" class="opt" data-a="fix"><span class="ic">🔁</span><span class="grow"><b>Fixkosten anlegen</b><br><span class="small muted">Miete, Versicherung, Abo …</span></span></button>`,
      mount: sh => {
        $$('[data-a]', sh).forEach(b => b.onclick = () => {
          const a = b.dataset.a;
          if (a === 'cam') $('#camIn').click();
          else if (a === 'pic') $('#picIn').click();
          else if (a === 'quick') replaceSheet(editorSheet(newDraft(true)));
          else if (a === 'manual') replaceSheet(editorSheet(newDraft(false)));
          else replaceSheet(fixedSheet(null));
        });
      }
    };
  }
  function newDraft(quick) {
    return { id: null, quick, store: '', date: today(), by: S.me || '', total: null, items: [{ id: uid(), name: '', amount: 0, cat: HL.UNSORTED, manual: false }] };
  }

  // ---------- OCR ----------
  let tessP = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (tessP) return tessP;
    tessP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = res; s.onerror = () => { tessP = null; rej(new Error('Texterkennung konnte nicht geladen werden (Internet?)')); };
      document.head.appendChild(s);
    });
    return tessP;
  }
  function prep(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight)) * (Math.max(img.naturalWidth, img.naturalHeight) < 1200 ? 1.6 : 1);
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
        const d = x.getImageData(0, 0, w, h), p = d.data;
        let mn = 255, mx = 0; const g = new Uint8ClampedArray(w * h);
        for (let i = 0, j = 0; i < p.length; i += 4, j++) { const v = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0; g[j] = v; if (v < mn) mn = v; if (v > mx) mx = v; }
        const rng = Math.max(1, mx - mn);
        for (let i = 0, j = 0; i < p.length; i += 4, j++) { let v = (g[j] - mn) * 255 / rng; v = v < 128 ? v * 0.7 : Math.min(255, v * 1.15); p[i] = p[i + 1] = p[i + 2] = v; }
        x.putImageData(d, 0, 0); URL.revokeObjectURL(img.src); res(c);
      };
      img.onerror = () => rej(new Error('Bild konnte nicht gelesen werden'));
      img.src = URL.createObjectURL(file);
    });
  }
  async function scanFiles(files) {
    if (!files || !files.length) return;
    let pct = 0;
    const prog = () => ({ title: 'Bon wird gelesen', left: 'Abbrechen', html: `<div class="card"><b id="pTxt">Texterkennung wird geladen …</b><div class="progress"><i id="pBar"></i></div><p class="small muted">Das Bild bleibt auf dem iPhone. Beim ersten Mal wird die deutsche Texterkennung geladen (ca. 10–20 Sek.).</p></div>` });
    stack.length = 0; openSheet(prog);
    const setP = (t, p) => { const a = $('#pTxt'), b = $('#pBar'); if (a) a.textContent = t; if (b) b.style.width = Math.round(p) + '%'; };
    try {
      await loadTesseract();
      const worker = await Tesseract.createWorker('deu', 1, { logger: m => { if (m.status === 'recognizing text') setP(`Lese Bon ${pct + 1}/${files.length} …`, ((pct + m.progress) / files.length) * 100); } });
      await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      let text = '';
      for (const f of files) { if (!stack.length) break; const c = await prep(f); const r = await worker.recognize(c); text += '\n' + r.data.text; pct++; }
      await worker.terminate();
      if (!stack.length) return;
      const p = HL.parseReceipt(text);
      const draft = { id: null, store: p.store, date: p.date || today(), by: S.me || '', total: p.total, rawText: text, items: p.items.map(x => { const cat = classify(x.name); return { id: uid(), name: x.name, amount: x.amount, cat, manual: false }; }) };
      if (!draft.items.length) { draft.items.push({ id: uid(), name: '', amount: 0, cat: HL.UNSORTED, manual: false }); toast('Keine Positionen erkannt – bitte manuell ergänzen'); }
      replaceSheet(editorSheet(draft));
    } catch (e) {
      replaceSheet(() => ({ title: 'Fehler', left: 'Schließen', html: `<div class="card"><b>${esc(e.message || e)}</b><p class="small muted">Du kannst den Beleg trotzdem manuell erfassen.</p><button type="button" class="btn block" id="toManual">Manuell erfassen</button></div>`, mount: sh => $('#toManual', sh).onclick = () => replaceSheet(editorSheet(newDraft(false))) }));
    }
  }
  $('#camIn').onchange = e => { const f = Array.from(e.target.files); e.target.value = ''; scanFiles(f); };
  $('#picIn').onchange = e => { const f = Array.from(e.target.files); e.target.value = ''; scanFiles(f); };

  // ---------- Beleg-Editor ----------
  function editorSheet(draft) {
    const ED = JSON.parse(JSON.stringify(draft));
    ED.items.forEach(it => { it._auto = it.manual ? null : it.cat; it._orig = it.cat; });
    const isNew = !ED.id;
    return () => {
      const M = cats();
      const rowsHtml = () => ED.items.map((it, i) => `<div class="irow ${resolve(M, it.cat) === HL.UNSORTED ? 'uns' : ''}" data-i="${i}">
          <input data-f="name" value="${esc(it.name)}" placeholder="${ED.quick ? 'Wofür? (z. B. Tanken)' : 'Artikel'}">
          <input data-f="amount" class="amt num" inputmode="decimal" value="${it.amount ? fmtInput(it.amount) : ''}" placeholder="0,00">
          <button type="button" class="x" data-f="del" aria-label="Position löschen">✕</button>
          <select data-f="cat">${catOptions(M, resolve(M, it.cat))}</select></div>`).join('');
      const h = `${ED.quick ? '' : `<div class="field"><label>Markt / Händler</label><input id="eStore" value="${esc(ED.store)}" placeholder="z. B. REWE"></div>`}
        <div class="row" style="gap:10px"><div class="field grow"><label>Datum</label><input type="date" id="eDate" value="${esc(ED.date)}"></div>
        <div class="field grow"><label>Bezahlt von</label><input id="eBy" value="${esc(ED.by)}" placeholder="Name"></div></div>
        <div class="card" style="padding:4px 14px 10px"><div id="eRows">${rowsHtml()}</div>
        ${ED.quick ? '' : '<button type="button" class="btn sec block" id="eAdd">+ Position</button>'}</div>
        <div class="card" id="eSum"></div>
        <label class="row small" style="margin:4px 4px 14px"><input type="checkbox" id="eLearn" checked> Geänderte Gruppen merken (App lernt dazu)</label>
        ${ED.rawText ? `<details class="small muted" style="margin:0 4px 14px"><summary>Erkannter Rohtext</summary><pre style="white-space:pre-wrap;font-size:11px">${esc(ED.rawText)}</pre></details>` : ''}
        ${isNew ? '' : '<button type="button" class="btn danger block" id="eDel">Beleg löschen</button>'}`;
      return {
        title: isNew ? (ED.quick ? 'Schnelle Ausgabe' : ED.rawText ? 'Bon prüfen' : 'Neuer Beleg') : 'Beleg', left: 'Abbrechen', right: 'Sichern', html: h,
        mount: sh => {
          const rowsEl = $('#eRows', sh);
          const updSum = () => {
            const sum = ED.items.reduce((a, i) => a + (Number(i.amount) || 0), 0);
            let s = `<div class="row between"><span>Summe Positionen</span><b class="num">${eur(sum)}</b></div>`;
            if (ED.total != null) { const diff = Math.round((sum - ED.total) * 100) / 100; s += `<div class="row between small" style="margin-top:4px"><span class="muted">Summe laut Bon</span><span class="num">${eur(ED.total)}</span></div>`; s += Math.abs(diff) < 0.01 ? `<div class="small" style="color:var(--good);margin-top:4px">✓ Stimmt mit dem Bon überein</div>` : `<div class="small" style="color:var(--warn);margin-top:4px">⚠ Differenz ${eur(diff)} – bitte Positionen prüfen</div>`; }
            const uns = ED.items.filter(i => resolve(M, i.cat) === HL.UNSORTED && (i.name || i.amount)).length;
            if (uns) s += `<div class="small" style="color:var(--warn);margin-top:4px">${uns} Position(en) noch unsortiert (orange)</div>`;
            $('#eSum', sh).innerHTML = s;
          };
          const redraw = () => { rowsEl.innerHTML = rowsHtml(); updSum(); };
          rowsEl.addEventListener('input', e => {
            const row = e.target.closest('.irow'); if (!row) return; const it = ED.items[+row.dataset.i]; const f = e.target.dataset.f;
            if (f === 'name') { it.name = e.target.value; if (it._auto !== null && it.cat === it._auto) { const c = classify(it.name); it.cat = c; it._auto = c; const sel = $('select', row); sel.value = resolve(M, c); row.classList.toggle('uns', resolve(M, c) === HL.UNSORTED); } }
            if (f === 'amount') { it.amount = toNum(e.target.value); updSum(); }
          });
          rowsEl.addEventListener('change', e => {
            const row = e.target.closest('.irow'); if (!row) return; const it = ED.items[+row.dataset.i];
            if (e.target.dataset.f === 'cat') { it.cat = e.target.value; it.manual = true; it._auto = null; row.classList.toggle('uns', it.cat === HL.UNSORTED); updSum(); }
          });
          rowsEl.addEventListener('click', e => {
            if (e.target.dataset.f !== 'del') return; const i = +e.target.closest('.irow').dataset.i;
            ED.items.splice(i, 1); if (!ED.items.length) ED.items.push({ id: uid(), name: '', amount: 0, cat: HL.UNSORTED, manual: false, _auto: HL.UNSORTED }); redraw();
          });
          const add = $('#eAdd', sh); if (add) add.onclick = () => { ED.items.push({ id: uid(), name: '', amount: 0, cat: HL.UNSORTED, manual: false, _auto: HL.UNSORTED }); redraw(); const ins = $$('input[data-f=name]', rowsEl); ins[ins.length - 1].focus(); };
          const st = $('#eStore', sh); if (st) st.oninput = e => ED.store = e.target.value;
          $('#eDate', sh).onchange = e => ED.date = e.target.value;
          $('#eBy', sh).oninput = e => ED.by = e.target.value;
          const d = $('#eDel', sh); if (d) d.onclick = () => { if (confirm('Beleg wirklich löschen?')) { del(ED.id); closeSheet(true); toast('Beleg gelöscht'); } };
          if (ED.quick && isNew) setTimeout(() => $('input[data-f=name]', rowsEl).focus(), 300);
          updSum();
        },
        onOk: sh => {
          const items = ED.items.filter(i => (i.name || '').trim() || i.amount);
          if (!items.length) return toast('Bitte mindestens eine Position eingeben');
          if (items.some(i => !i.amount)) return toast('Bitte bei jeder Position einen Betrag eingeben');
          const learnOn = $('#eLearn', sh).checked;
          const clean = items.map(i => {
            const name = (i.name || '').trim() || (ED.quick ? catLabel(M, i.cat) : 'Position');
            if (learnOn && i.manual && i.cat !== i._orig && i.cat !== HL.UNSORTED) learn(name, i.cat);
            return { id: i.id, name, amount: Math.round(i.amount * 100) / 100, cat: i.cat, manual: !!i.manual };
          });
          if (!ED.date) return toast('Bitte Datum wählen');
          if (ED.by && ED.by !== S.me && !S.me) { S.me = ED.by; save(); }
          const store = ED.quick ? clean[0].name : ED.store.trim();
          const prev = ED.id ? get(ED.id) : null;
          put('receipt', ED.id || 'b_' + uid(), { store, date: ED.date, by: ED.by.trim(), total: ED.total, items: clean, created: prev ? prev.created : nowIso() });
          curYm = ymOf(ED.date);
          closeSheet(true); toast('Gespeichert ✓');
        }
      };
    };
  }

  // ================= Mehr / Einstellungen =================
  function moreView() {
    const st = setting();
    const nRules = rulesList().length, nLearned = rulesList().filter(r => r.learned).length;
    const M = cats(); const nCats = Object.keys(M).length;
    return `<h1>Mehr</h1>
      <h2>Du</h2><div class="card"><div class="field" style="margin:0"><label>Dein Name (auf diesem iPhone)</label><input id="sMe" value="${esc(S.me)}" placeholder="z. B. Max"></div></div>
      <h2>Haushalt</h2><div class="card"><div class="field" style="margin:0"><label>Monatliches Netto-Einkommen Haushalt (optional, für „Übrig“)</label><input id="sInc" inputmode="decimal" value="${st.income ? fmtInput(st.income) : ''}" placeholder="0,00"></div></div>
      <h2>Ordnung & Gruppen</h2><div class="list">
        <button type="button" class="li" data-act="cats"><span class="grow">Gruppen bearbeiten<br><span class="small muted">${nCats} Gruppen · umbenennen, verschieben, zusammenführen</span></span><span class="chev">›</span></button>
        <button type="button" class="li" data-act="rules"><span class="grow">Zuordnungsregeln<br><span class="small muted">${nRules} Regeln, davon ${nLearned} gelernt</span></span><span class="chev">›</span></button>
        <button type="button" class="li" data-act="suggest"><span class="grow">Aufräum-Vorschläge<br><span class="small muted">Selten genutzte Gruppen zusammenlegen</span></span><span class="chev">›</span></button>
        <div class="li"><span class="grow">Kleine Gruppen zusammenfassen unter<br><span class="small muted">Anteil an der Hauptgruppe → „Weitere“</span></span><select id="sThr" style="width:96px">${[0, 3, 5, 8, 10, 15, 20].map(v => `<option value="${v}" ${+st.threshold === v ? 'selected' : ''}>${v ? v + ' %' : 'aus'}</option>`).join('')}</select></div>
        <button type="button" class="li" data-act="reclass"><span class="grow">Alle Belege neu zuordnen<br><span class="small muted">Nach Regeländerungen – manuelle Zuordnungen bleiben</span></span><span class="chev">›</span></button>
      </div>
      <h2>Gemeinsam nutzen (Sync)</h2><div class="list">
        <div class="li"><span class="syncdot"></span><span class="grow small" id="syncTxt">${esc(syncText())}</span></div>
        <button type="button" class="li" data-act="sync"><span class="grow">${S.sync ? 'Sync-Einstellungen & Code für Partner/in' : 'Mit Partner/in verbinden'}</span><span class="chev">›</span></button>
        ${S.sync ? '<button type="button" class="li" data-act="syncnow"><span class="grow">Jetzt synchronisieren</span><span class="chev">↻</span></button>' : ''}
      </div>
      <h2>Daten</h2><div class="list">
        <button type="button" class="li" data-act="csv"><span class="grow">Als Excel/CSV exportieren</span><span class="chev">›</span></button>
        <button type="button" class="li" data-act="export"><span class="grow">Backup exportieren (JSON)</span><span class="chev">›</span></button>
        <button type="button" class="li" data-act="import"><span class="grow">Backup importieren</span><span class="chev">›</span></button>
        <button type="button" class="li" data-act="reset" style="color:var(--bad)"><span class="grow">Alle Daten auf diesem iPhone löschen</span></button>
      </div>
      <p class="small muted" style="text-align:center;margin-top:20px">Haushalt · Version 1.0</p>`;
  }

  // ---------- Gruppen-Editor ----------
  function catsSheet() {
    const M = cats();
    let h = `<p class="small muted" style="margin:0 4px 10px">Tippe auf eine Gruppe zum Umbenennen, Verschieben, Zusammenführen oder Löschen. Alles wird mit deinem Partner synchronisiert.</p>`;
    mains(M).forEach(m => {
      h += `<div class="list"><button type="button" class="li" data-cat="${m.id}"><span class="dot" style="background:${m.color || '#888'}"></span><b class="grow">${esc(m.name)}</b><span class="chev">›</span></button>`;
      subsOf(M, m.id).forEach(s => h += `<button type="button" class="li sub" data-cat="${s.id}"><span class="grow small">${esc(s.name)}</span><span class="chev">›</span></button>`);
      if (m.id !== HL.UNSORTED) h += `<button type="button" class="li sub small" data-newsub="${m.id}" style="color:var(--accent)">+ Untergruppe</button>`;
      h += `</div>`;
    });
    h += `<button type="button" class="btn block" id="newMain">+ Neue Hauptgruppe</button>`;
    return {
      title: 'Gruppen', left: 'Fertig', html: h, mount: sh => {
        $$('[data-cat]', sh).forEach(b => b.onclick = () => openSheet(() => catEditSheet(b.dataset.cat)));
        $$('[data-newsub]', sh).forEach(b => b.onclick = () => openSheet(() => catEditSheet(null, b.dataset.newsub)));
        $('#newMain', sh).onclick = () => openSheet(() => catEditSheet(null, null));
      }
    };
  }
  function catEditSheet(id, parentForNew) {
    const M = cats();
    const isNew = !id;
    const c = id ? M[id] : { name: '', parent: parentForNew || null, color: '#0ea5e9' };
    const locked = id === HL.UNSORTED;
    const hasSubs = id && subsOf(M, id).length > 0;
    const parentOpts = `<option value="">— keine (ist Hauptgruppe) —</option>` + mains(M).filter(m => m.id !== id && m.id !== HL.UNSORTED).map(m => `<option value="${m.id}" ${m.id === c.parent ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
    const mergeOpts = `<option value="">— auswählen —</option>` + Object.values(M).filter(x => x.id !== id && x.parent !== id).sort((a, b) => catLabel(M, a.id).localeCompare(catLabel(M, b.id))).map(x => `<option value="${x.id}">${esc(catLabel(M, x.id))}</option>`).join('');
    const h = `<div class="field"><label>Name</label><input id="cName" value="${esc(c.name)}" ${locked ? 'disabled' : ''} placeholder="z. B. Haustier"></div>
      ${locked ? '' : `<div class="field"><label>Gehört zu</label><select id="cParent" ${hasSubs ? 'disabled' : ''}>${parentOpts}</select>${hasSubs ? '<div class="small muted" style="margin:4px">Hat Untergruppen – kann nicht verschoben werden.</div>' : ''}</div>`}
      <div class="field" id="cColorF"><label>Farbe (nur Hauptgruppen)</label><input type="color" id="cColor" value="${esc(c.color || '#888888')}"></div>
      ${isNew || locked ? '' : `<h2>Zusammenführen</h2><div class="card"><div class="small muted" style="margin-bottom:8px">Alle Artikel, Regeln und Fixkosten dieser Gruppe wandern in die Zielgruppe, danach wird diese Gruppe entfernt.</div><select id="cMerge">${mergeOpts}</select><button type="button" class="btn sec block" id="cMergeBtn">Zusammenführen</button></div>
      <button type="button" class="btn danger block" id="cDel">Gruppe löschen</button>`}`;
    return {
      title: isNew ? 'Neue Gruppe' : 'Gruppe', left: 'Zurück', right: 'Sichern', html: h,
      mount: sh => {
        const cp = $('#cParent', sh);
        const updColor = () => $('#cColorF', sh).style.display = cp && cp.value ? 'none' : '';
        if (cp) { cp.onchange = updColor; updColor(); }
        if (isNew) setTimeout(() => $('#cName', sh).focus(), 300);
        const mb = $('#cMergeBtn', sh);
        if (mb) mb.onclick = () => { const t = $('#cMerge', sh).value; if (!t) return toast('Zielgruppe wählen'); if (confirm(`„${c.name}“ in „${catLabel(M, t)}“ zusammenführen?`)) { mergeCat(id, t); stack.pop(); stack.pop(); openSheet(catsSheet); toast('Zusammengeführt'); } };
        const db = $('#cDel', sh);
        if (db) db.onclick = () => {
          const subs = subsOf(M, id);
          if (!confirm(`„${c.name}“ löschen?${subs.length ? ` Auch die ${subs.length} Untergruppen werden gelöscht.` : ''} Betroffene Artikel landen in „Unsortiert“. Tipp: „Zusammenführen“ behält die Zuordnung.`)) return;
          subs.forEach(s => del(s.id)); del(id); stack.pop(); stack.pop(); openSheet(catsSheet); toast('Gelöscht');
        };
      },
      onOk: sh => {
        if (locked) { put('cat', id, Object.assign({}, S.recs[id] ? S.recs[id].data : { name: 'Unsortiert', parent: null, sort: 9999 }, { color: $('#cColor', sh).value })); stack.pop(); stack.pop(); return openSheet(catsSheet); }
        const name = $('#cName', sh).value.trim(); if (!name) return toast('Bitte Namen eingeben');
        const cpEl = $('#cParent', sh);
        const parent = cpEl && !cpEl.disabled ? (cpEl.value || null) : (c.parent || null);
        const base = id && S.recs[id] ? S.recs[id].data : { sort: Object.keys(M).length };
        put('cat', id || 'c_' + uid(), Object.assign({}, base, { name, parent, color: parent ? null : $('#cColor', sh).value }));
        stack.pop(); stack.pop(); openSheet(catsSheet); toast('Gespeichert');
      }
    };
  }
  function mergeCat(from, to) {
    const M = cats();
    list('receipt').forEach(r => { if ((r.items || []).some(i => i.cat === from)) { const { id, ...d } = r; d.items = d.items.map(i => i.cat === from ? Object.assign({}, i, { cat: to }) : i); put('receipt', id, d); } });
    list('fixed').forEach(f => { if (f.cat === from) { const { id, ...d } = f; d.cat = to; put('fixed', id, d); } });
    rulesList().forEach(r => { if (r.cat === from) { const { id, ...d } = r; d.cat = to; put('rule', id, d); } });
    // Untergruppen einer Hauptgruppe mitnehmen
    subsOf(M, from).forEach(s => { const { id, ...d } = s; const tMain = M[to].parent || to; put('cat', id, Object.assign(S.recs[id].data, { parent: tMain })); });
    del(from);
  }

  // ---------- Regeln ----------
  function rulesSheet() {
    const M = cats();
    const q = HL.norm(S.ui.rq || '');
    let R = rulesList().filter(r => M[r.cat] || r.learned);
    if (q) R = R.filter(r => HL.norm(r.pattern).includes(q) || HL.norm(catLabel(M, r.cat)).includes(q));
    R.sort((a, b) => (b.learned - a.learned) || catLabel(M, a.cat).localeCompare(catLabel(M, b.cat)) || a.pattern.localeCompare(b.pattern));
    const shown = R.slice(0, 250);
    let h = `<p class="small muted" style="margin:0 4px 10px">Ein Artikel landet in der Gruppe, deren Stichwort im Namen vorkommt (das genaueste gewinnt). „Gelernt“ = von euch korrigierte Artikel, die haben Vorrang.</p>
      <div class="card"><div class="field"><label>Neues Stichwort</label><input id="rPat" placeholder="z. B. katzenfutter"></div><div class="field"><select id="rCat">${catOptions(M, '')}</select></div><label class="row small"><input type="checkbox" id="rWhole"> nur als ganzes Wort (für kurze Wörter wie „tee“)</label><button type="button" class="btn block" id="rAdd">Regel hinzufügen</button></div>
      <input type="search" id="rq" placeholder="Regeln durchsuchen" value="${esc(S.ui.rq || '')}" style="margin-bottom:10px"><div class="list">`;
    shown.forEach(r => h += `<button type="button" class="li" data-rule="${r.id}"><span class="grow"><span class="ellip">${esc(r.pattern)}</span><span class="small muted ellip">${esc(M[r.cat] ? catLabel(M, r.cat) : '(Gruppe gelöscht)')}</span></span>${r.learned ? '<span class="pill acc">gelernt</span>' : ''}${r.whole ? '<span class="pill">ganzes Wort</span>' : ''}<span class="chev">›</span></button>`);
    if (!shown.length) h += `<div class="empty">Keine Regeln gefunden.</div>`;
    h += `</div>${R.length > shown.length ? `<p class="small muted">… ${R.length - shown.length} weitere – Suche nutzen.</p>` : ''}`;
    return {
      title: 'Zuordnungsregeln', left: 'Fertig', html: h, mount: sh => {
        const rq = $('#rq', sh);
        let t; rq.oninput = () => { clearTimeout(t); t = setTimeout(() => { S.ui.rq = rq.value; save(); replaceSheet(rulesSheet); const n = $('#rq'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 350); };
        $('#rAdd', sh).onclick = () => {
          const p = HL.norm($('#rPat', sh).value); if (!p) return toast('Stichwort eingeben');
          const cat = $('#rCat', sh).value; const whole = $('#rWhole', sh).checked;
          put('rule', 'r_u_' + uid(), { pattern: p, whole, cat, learned: false });
          toast(`„${p}“ → ${catLabel(M, cat)}`); replaceSheet(rulesSheet);
        };
        $$('[data-rule]', sh).forEach(b => b.onclick = () => openSheet(() => ruleEditSheet(b.dataset.rule)));
      }
    };
  }
  function ruleEditSheet(id) {
    const M = cats(); const r = get(id);
    const h = `<div class="field"><label>Stichwort${r.learned ? ' (gelernter Artikelname)' : ''}</label><input id="rePat" value="${esc(r.pattern)}"></div>
      <div class="field"><label>Gruppe</label><select id="reCat">${catOptions(M, r.cat)}</select></div>
      ${r.learned ? '' : `<label class="row small" style="margin-bottom:12px"><input type="checkbox" id="reWhole" ${r.whole ? 'checked' : ''}> nur als ganzes Wort</label>`}
      <button type="button" class="btn danger block" id="reDel">Regel löschen</button>`;
    return {
      title: 'Regel', left: 'Zurück', right: 'Sichern', html: h, mount: sh => {
        $('#reDel', sh).onclick = () => { del(id); stack.pop(); stack.pop(); openSheet(rulesSheet); toast('Regel gelöscht'); };
      },
      onOk: sh => {
        const p = HL.norm($('#rePat', sh).value); if (!p) return toast('Stichwort eingeben');
        const w = $('#reWhole', sh);
        put('rule', id, { pattern: p, whole: w ? w.checked : false, cat: $('#reCat', sh).value, learned: !!r.learned });
        stack.pop(); stack.pop(); openSheet(rulesSheet); toast('Gespeichert');
      }
    };
  }

  // ---------- Aufräum-Vorschläge ----------
  function suggestSheet() {
    const M = cats();
    const since = new Date(); since.setDate(since.getDate() - 90); const sinceS = since.toISOString().slice(0, 10);
    const cnt = {}, amt = {};
    list('receipt').forEach(r => { if ((r.date || '') < sinceS) return; (r.items || []).forEach(i => { const c = resolve(M, i.cat); cnt[c] = (cnt[c] || 0) + 1; amt[c] = (amt[c] || 0) + (+i.amount || 0); }); });
    const fixCats = new Set(list('fixed').map(f => resolve(M, f.cat)));
    const totalItems = Object.values(cnt).reduce((a, b) => a + b, 0);
    const subs = Object.values(M).filter(c => c.parent && !fixCats.has(c.id));
    const rare = totalItems < 40 ? [] : subs.filter(s => (cnt[s.id] || 0) > 0 && (cnt[s.id] || 0) <= 2);
    const unused = subs.filter(s => !cnt[s.id]);
    let h = `<p class="small muted" style="margin:0 4px 10px">Grundlage: letzte 90 Tage. Ziel: keine Mini-Gruppen für einzelne Artikel.</p>`;
    h += `<h2>Selten genutzt (1–2 Artikel)</h2><div class="list">`;
    if (!rare.length) h += `<div class="empty">${totalItems < 40 ? `Noch zu wenig Daten (${totalItems} von 40 Artikeln) – Vorschläge kommen nach ein paar Einkäufen.` : 'Keine – passt.'}</div>`;
    rare.forEach(s => h += `<div class="li"><span class="grow"><span class="ellip">${esc(catLabel(M, s.id))}</span><span class="small muted">${cnt[s.id]} Artikel · ${eur(amt[s.id] || 0)}</span></span><button type="button" class="pill acc" style="flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis" data-merge="${s.id}">→ in „${esc(M[s.parent].name)}“</button></div>`);
    h += `</div><h2>Noch nie benutzt</h2><div class="list">`;
    if (!unused.length) h += `<div class="empty">Keine.</div>`;
    unused.forEach(s => h += `<div class="li"><span class="grow small ellip">${esc(catLabel(M, s.id))}</span></div>`);
    h += `</div><p class="small muted" style="margin:0 4px">Unbenutzte Gruppen stören nicht – sie tauchen in der Übersicht erst auf, wenn etwas drin ist.</p>`;
    return {
      title: 'Aufräumen', left: 'Fertig', html: h, mount: sh => {
        $$('[data-merge]', sh).forEach(b => b.onclick = () => { const s = M[b.dataset.merge]; if (confirm(`„${s.name}“ auflösen und Artikel nach „${M[s.parent].name} (allgemein)“ verschieben?`)) { mergeCat(s.id, s.parent); replaceSheet(suggestSheet); toast('Zusammengeführt'); } });
      }
    };
  }

  // ---------- Sync-Einstellungen ----------
  function syncSheet() {
    const s = S.sync || {};
    const code = S.sync ? 'HH1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ u: s.url, k: s.key, h: s.hh })))) : '';
    const h = S.sync ? `<div class="card"><b>Verbunden ✓</b><p class="small muted">Damit dein/e Partner/in dieselben Daten sieht: Code kopieren, per WhatsApp/iMessage schicken, auf dem anderen iPhone unter Mehr › „Mit Partner/in verbinden“ › „Code einfügen“.</p><button type="button" class="btn block" id="sCopy">Code kopieren</button><button type="button" class="btn sec block" id="sShare">Code teilen …</button></div>
        <div class="card small"><span class="muted">Projekt:</span> <code>${esc(s.url)}</code><br><span class="muted">Haushalt:</span> <code>${esc(s.hh.slice(0, 8))}…</code></div>
        <button type="button" class="btn danger block" id="sOff">Verbindung trennen (Daten bleiben lokal)</button>`
      : `<div class="card"><b>A) Partner/in hat schon eingerichtet</b><div class="field" style="margin-top:10px"><label>Code einfügen (beginnt mit HH1:)</label><textarea id="sCode" rows="3" placeholder="HH1:…"></textarea></div><button type="button" class="btn block" id="sJoin">Verbinden</button></div>
        <div class="card"><b>B) Erstmalig einrichten</b><p class="small muted">Einmalig: kostenloses Supabase-Projekt anlegen und die Datei <code>supabase_setup.sql</code> ausführen (siehe Anleitung). Dann hier eintragen:</p>
        <div class="field"><label>Project URL</label><input id="sUrl" placeholder="https://xxxx.supabase.co" autocapitalize="off" autocorrect="off"></div>
        <div class="field"><label>Publishable / anon Key</label><input id="sKey" placeholder="eyJ… oder sb_publishable_…" autocapitalize="off" autocorrect="off"></div>
        <button type="button" class="btn block" id="sNew">Haushalt anlegen & verbinden</button></div>`;
    return {
      title: 'Gemeinsam nutzen', left: 'Fertig', html: h, mount: sh => {
        const c = $('#sCopy', sh); if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(code); toast('Code kopiert'); } catch (e) { prompt('Code kopieren:', code); } };
        const sv = $('#sShare', sh); if (sv) sv.onclick = () => { if (navigator.share) navigator.share({ text: code }).catch(() => { }); else prompt('Code kopieren:', code); };
        const off = $('#sOff', sh); if (off) off.onclick = () => { if (confirm('Verbindung trennen?')) { S.sync = null; S.lastPull = null; saveNow(); replaceSheet(syncSheet); } };
        const j = $('#sJoin', sh); if (j) j.onclick = () => {
          try { const raw = $('#sCode', sh).value.trim().replace(/^HH1:/, ''); const o = JSON.parse(decodeURIComponent(escape(atob(raw)))); if (!o.u || !o.k || !o.h) throw 0; connect(o.u, o.k, o.h, sh); } catch (e) { toast('Code ungültig'); }
        };
        const n = $('#sNew', sh); if (n) n.onclick = () => {
          const u = $('#sUrl', sh).value.trim(), k = $('#sKey', sh).value.trim();
          if (!/^https:\/\/.+/.test(u) || k.length < 20) return toast('URL und Key prüfen');
          const a = new Uint8Array(24); crypto.getRandomValues(a);
          connect(u, k, 'hh_' + Array.from(a, b => b.toString(16).padStart(2, '0')).join(''), sh);
        };
      }
    };
  }
  async function connect(url, key, hh, sh) {
    S.sync = { url: url.replace(/\/+$/, ''), key, hh }; S.lastPull = null;
    // alles Lokale (außer unveränderten Standards) hochladen
    Object.values(S.recs).forEach(r => { if (r.updated_at !== SEED_TS) markDirty(r.id); });
    saveNow();
    toast('Verbinde …');
    await syncNow();
    if (syncState === 'err') { toast('Fehler: ' + syncMsg); S.sync = null; saveNow(); return; }
    toast('Verbunden ✓'); replaceSheet(syncSheet);
  }

  // ---------- Export / Import ----------
  function shareOrDownload(name, text, type) {
    const blob = new Blob([text], { type });
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: name }).catch(() => { });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function exportCsv() {
    const M = cats(); const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const rows = [['Datum', 'Markt', 'Artikel', 'Betrag', 'Hauptgruppe', 'Gruppe', 'Bezahlt von', 'Art'].map(q).join(';')];
    list('receipt').sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(r => (r.items || []).forEach(i => { const c = resolve(M, i.cat); rows.push([dDE(r.date), r.store, i.name, fmtInput(i.amount), M[mainOf(M, c)].name, M[c].parent ? M[c].name : '', r.by, 'variabel'].map(q).join(';')); }));
    list('fixed').forEach(f => { const c = resolve(M, f.cat); rows.push(['', '', f.name, fmtInput(f.amount), M[mainOf(M, c)].name, M[c].parent ? M[c].name : '', '', 'fix ' + (EVERY[f.every] || '')].map(q).join(';')); });
    shareOrDownload(`Haushalt_${today()}.csv`, '\ufeff' + rows.join('\r\n'), 'text/csv');
  }
  $('#jsonIn').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const data = JSON.parse(await f.text()); if (!data.recs) throw 0; let n = 0;
      Object.values(data.recs).forEach(r => { const l = S.recs[r.id]; if (!l || Date.parse(r.updated_at) > Date.parse(l.updated_at)) { S.recs[r.id] = r; markDirty(r.id); n++; } });
      saveNow(); render(); schedSync(); toast(`${n} Einträge importiert`);
    } catch (err) { toast('Datei ungültig'); }
  };

  // ================= Events in der Hauptansicht =================
  function bindView() {
    $$('[data-act]', view).forEach(b => b.onclick = () => {
      const a = b.dataset.act;
      if (a === 'prev') { curYm = ymAdd(curYm, -1); render(); }
      else if (a === 'next') { curYm = ymAdd(curYm, 1); render(); }
      else if (a === 'add') openSheet(addSheet);
      else if (a === 'unsorted') openSheet(linesSheet('Unsortiert', [HL.UNSORTED], 'var'));
      else if (a === 'newfix') openSheet(fixedSheet(null));
      else if (a === 'cats') openSheet(catsSheet);
      else if (a === 'rules') { S.ui.rq = ''; openSheet(rulesSheet); }
      else if (a === 'suggest') openSheet(suggestSheet);
      else if (a === 'sync') openSheet(syncSheet);
      else if (a === 'syncnow') syncNow(true);
      else if (a === 'csv') exportCsv();
      else if (a === 'export') shareOrDownload(`Haushalt_Backup_${today()}.json`, JSON.stringify({ app: 'haushalt', v: 1, recs: S.recs }), 'application/json');
      else if (a === 'import') $('#jsonIn').click();
      else if (a === 'reclass') {
        if (!confirm('Alle automatisch zugeordneten Artikel nach den aktuellen Regeln neu sortieren?')) return;
        let n = 0; list('receipt').forEach(r => { let ch = false; const items = (r.items || []).map(i => { if (i.manual) return i; const c = classify(i.name); if (c !== i.cat) { ch = true; n++; return Object.assign({}, i, { cat: c }); } return i; }); if (ch) { const { id, ...d } = r; d.items = items; put('receipt', id, d); } });
        toast(`${n} Artikel neu zugeordnet`); render();
      }
      else if (a === 'reset') { if (confirm('Wirklich ALLE Daten auf diesem iPhone löschen? (Synchronisierte Daten bleiben in der Cloud)')) { localStorage.removeItem(LS); location.reload(); } }
    });
    $$('[data-fixmode]', view).forEach(b => b.onclick = () => { S.ui.fixMode = b.dataset.fixmode; save(); render(); });
    $$('[data-main]', view).forEach(b => b.onclick = () => { const k = b.dataset.main; open.has(k) ? open.delete(k) : open.add(k); render(); });
    $$('[data-sub]', view).forEach(b => b.onclick = () => openSheet(linesSheet(b.dataset.title, b.dataset.sub.split(','))));
    $$('[data-rec]', view).forEach(b => b.onclick = () => openSheet(editorSheet(get(b.dataset.rec))));
    $$('[data-fix]', view).forEach(b => b.onclick = () => openSheet(fixedSheet(b.dataset.fix)));
    const q = $('#q', view); if (q) { let t; q.oninput = () => { clearTimeout(t); t = setTimeout(() => { S.ui.q = q.value; save(); render(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 300); }; }
    const me = $('#sMe', view); if (me) me.onchange = () => { S.me = me.value.trim(); save(); toast('Gespeichert'); };
    const inc = $('#sInc', view); if (inc) inc.onchange = () => { put('setting', 'set_household', Object.assign(setting(), { income: toNum(inc.value) })); toast('Gespeichert'); };
    const thr = $('#sThr', view); if (thr) thr.onchange = () => { put('setting', 'set_household', Object.assign(setting(), { threshold: +thr.value })); toast('Gespeichert'); };
  }

  // ================= Start =================
  saveNow();
  render();
  if (!S.me) setTimeout(() => { const n = prompt('Willkommen! Wie heißt du? (Damit ihr seht, wer was eingekauft hat)'); if (n) { S.me = n.trim(); saveNow(); render(); } }, 400);
  syncNow();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
