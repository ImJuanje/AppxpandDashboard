/* ============================================================
   AppXpand · Plataforma de comerciales
   ------------------------------------------------------------
   ⚠️ Importante: este es un "semi inicio de sesión" del lado del cliente.
   - Los códigos se comprueban contra huellas SHA-256 de config.js.
   - Los clientes se guardan en el navegador (localStorage) de cada
     dispositivo. Para que el administrador vea en TIEMPO REAL lo que
     hacen los comerciales desde sus dispositivos hace falta una base
     de datos en servidor. Toda la persistencia está concentrada en el
     objeto `Store` de más abajo para poder cambiarla sin tocar el resto.
   ============================================================ */
(() => {
  'use strict';

  const CFG = window.CRM_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Catálogos (los mismos que el formulario de la web) ---------- */
  const STATUSES = [
    { id: 'nuevo',      label: 'Nuevo',      color: '#8d9bb5' },
    { id: 'contactado', label: 'Contactado', color: '#1aa3d6' },
    { id: 'reunion',    label: 'Reunión',    color: '#7c5ce0' },
    { id: 'propuesta',  label: 'Propuesta',  color: '#e59a1f' },
    { id: 'ganado',     label: 'Ganado',     color: '#22a05a' },
    { id: 'perdido',    label: 'Perdido',    color: '#e05252' }
  ];
  const ST = Object.fromEntries(STATUSES.map(s => [s.id, s]));
  const OPEN = ['nuevo', 'contactado', 'reunion', 'propuesta'];
  const TYPES = ['Peluquería o estética', 'Restaurante o bar', 'Tienda', 'Servicios (reformas, talleres, clínicas…)', 'Otro'];
  const SERVICES = ['Página web', 'Optimización de perfil de Google', 'Paquete lanzadera', 'Por definir'];
  const CITIES = ['Albacete', 'Ciudad Real', 'Alicante', 'Otra'];
  const FOLLOW = [
    ['', 'Todos'], ['vencido', 'Vencidos'], ['hoy', 'Para hoy'], ['semana', 'Próximos 7 días'], ['sin', 'Sin fecha']
  ];
  const SORTS = [
    ['updated', 'Última actividad'], ['follow', 'Próximo seguimiento'], ['value', 'Mayor valor'],
    ['name', 'Nombre (A-Z)'], ['created', 'Más recientes']
  ];

  /* ---------- Persistencia (cambiar aquí para usar un backend) ---------- */
  const DATA_KEY = 'appxpand_crm_v1';
  const SESSION_KEY = 'appxpand_crm_session';
  const LOCK_KEY = 'appxpand_crm_lock';
  const Store = {
    load() {
      try {
        const d = JSON.parse(localStorage.getItem(DATA_KEY));
        return d && Array.isArray(d.clients) ? d : { clients: [] };
      } catch { return { clients: [] }; }
    },
    save(d) { localStorage.setItem(DATA_KEY, JSON.stringify(d)); }
  };

  /* ---------- Estado ---------- */
  const state = {
    user: null,
    data: { clients: [] },
    view: 'resumen',
    cview: 'lista',
    resumenOwner: '',
    editingId: null,
    filters: { q: '', status: '', service: '', type: '', city: '', owner: '', follow: '', sort: 'updated' }
  };
  const isAdmin = () => state.user && state.user.role === 'admin';

  /* ---------- Utilidades ---------- */
  const uid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now = () => new Date().toISOString();
  const pad = n => String(n).padStart(2, '0');
  const todayStr = (offset = 0) => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDay = s => s ? parseDay(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '';
  const fmtDT = iso => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const money = n => Number(n || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const userById = id => CFG.users.find(u => u.id === id);
  const ownerName = id => (userById(id) || {}).name || 'Sin asignar';
  const phoneDigits = p => {
    let d = String(p || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 9) d = '34' + d;
    return d;
  };

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ---------- SHA-256 ---------- */
  function sha256Fallback(str) {
    const rr = (v, a) => (v >>> a) | (v << (32 - a));
    const K = [], H = [];
    let p = 2, n = 0;
    while (n < 64) {
      let prime = true;
      for (let i = 2; i * i <= p; i++) if (p % i === 0) { prime = false; break; }
      if (prime) {
        if (n < 8) H[n] = (Math.pow(p, 0.5) % 1) * 4294967296 | 0;
        K[n] = (Math.pow(p, 1 / 3) % 1) * 4294967296 | 0;
        n++;
      }
      p++;
    }
    const bytes = new TextEncoder().encode(str);
    const l = bytes.length;
    const total = (((l + 8) >> 6) + 1) * 16;
    const words = new Array(total).fill(0);
    for (let i = 0; i < l; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
    words[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    words[total - 1] = l * 8;
    let h = H.slice();
    for (let o = 0; o < total; o += 16) {
      const w = words.slice(o, o + 16);
      for (let i = 16; i < 64; i++) {
        const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
        const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h = [h[0] + a | 0, h[1] + b | 0, h[2] + c | 0, h[3] + d | 0, h[4] + e | 0, h[5] + f | 0, h[6] + g | 0, h[7] + hh | 0];
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  async function hashCode(code) {
    const s = CFG.salt + code.trim().toUpperCase();
    if (window.crypto && crypto.subtle) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
      } catch { /* cae al respaldo */ }
    }
    return sha256Fallback(s);
  }

  /* ============================================================
     SESIÓN
     ============================================================ */
  function readSession() {
    for (const store of [sessionStorage, localStorage]) {
      try {
        const s = JSON.parse(store.getItem(SESSION_KEY));
        if (s && s.id && (!s.exp || s.exp > Date.now())) {
          const u = userById(s.id);
          if (u) return u;
        }
      } catch { /* ignorar */ }
    }
    return null;
  }
  function writeSession(user, remember) {
    clearSession();
    const payload = JSON.stringify({ id: user.id, exp: remember ? Date.now() + CFG.rememberHours * 3600e3 : 0 });
    (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, payload);
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch { /* ignorar */ }
  }
  const getLock = () => { try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } };

  function showLoginError(msg) {
    const e = $('#loginError');
    e.textContent = msg; e.hidden = !msg;
  }

  async function onLogin(ev) {
    ev.preventDefault();
    const lock = getLock();
    if (lock.until > Date.now()) {
      showLoginError(`Demasiados intentos. Espera ${Math.ceil((lock.until - Date.now()) / 1000)} s.`);
      return;
    }
    const code = $('#code').value.trim();
    if (!code) { showLoginError('Introduce tu código de alta.'); return; }
    const h = await hashCode(code);
    const user = CFG.users.find(u => u.hash === h);
    if (!user) {
      const n = lock.n + 1;
      const until = n >= 5 ? Date.now() + 60e3 : 0;
      localStorage.setItem(LOCK_KEY, JSON.stringify({ n: until ? 0 : n, until }));
      showLoginError(until ? 'Demasiados intentos. Espera 60 s.' : 'Código no válido. Revísalo o pídeselo al administrador.');
      $('#code').select();
      return;
    }
    localStorage.removeItem(LOCK_KEY);
    showLoginError('');
    writeSession(user, $('#remember').checked);
    $('#code').value = '';
    enterApp(user);
  }

  function logout() {
    clearSession();
    state.user = null;
    closeDialog();
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    $('#code').focus();
  }

  /* ============================================================
     ENTRADA A LA APP
     ============================================================ */
  function enterApp(user) {
    state.user = user;
    state.data = Store.load();
    state.view = 'resumen';
    state.cview = 'lista';
    state.resumenOwner = '';
    state.filters = { q: '', status: '', service: '', type: '', city: '', owner: '', follow: '', sort: 'updated' };
    $('#resumenOwner').innerHTML = '';
    $('#filters').classList.remove('is-open');
    $('#toggleFilters').setAttribute('aria-expanded', 'false');

    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    $('#userName').textContent = user.name;
    $('#userRole').textContent = user.role === 'admin' ? 'Administrador' : 'Comercial';
    $('#userAvatar').textContent = initials(user.name);
    $$('[data-admin]').forEach(el => { el.hidden = !isAdmin(); });
    $('#fOwnerWrap').hidden = !isAdmin();
    $('#resumenOwnerWrap').hidden = !isAdmin();
    $('#myBackup').hidden = isAdmin();

    buildFilterControls();
    $('#fQ').value = '';
    switchView('resumen');
  }

  /* ---------- Datos visibles ---------- */
  const allVisible = () => isAdmin() ? state.data.clients : state.data.clients.filter(c => c.owner === state.user.id);
  const persist = () => Store.save(state.data);

  /* ---------- Seguimiento ---------- */
  function followState(c) {
    if (!OPEN.includes(c.status)) return 'cerrado';
    if (!c.next) return 'sin';
    const t = todayStr();
    if (c.next < t) return 'vencido';
    if (c.next === t) return 'hoy';
    if (c.next <= todayStr(7)) return 'semana';
    return 'futuro';
  }
  function followHTML(c) {
    const f = followState(c);
    if (f === 'cerrado' || f === 'sin') return '<span class="muted">—</span>';
    if (f === 'vencido') return `<span class="pill pill--red">Vencido · ${fmtDay(c.next)}</span>`;
    if (f === 'hoy') return '<span class="pill pill--amber">Hoy</span>';
    if (f === 'semana') return `<span class="pill pill--blue">${fmtDay(c.next)}</span>`;
    return `<span>${fmtDay(c.next)}</span>`;
  }

  /* ---------- Estadísticas ---------- */
  function stats(list) {
    const s = { total: list.length, open: 0, won: 0, lost: 0, pipeline: 0, wonValue: 0, overdue: 0, last: '' };
    list.forEach(c => {
      if (OPEN.includes(c.status)) { s.open++; s.pipeline += Number(c.value) || 0; }
      if (c.status === 'ganado') { s.won++; s.wonValue += Number(c.value) || 0; }
      if (c.status === 'perdido') s.lost++;
      if (followState(c) === 'vencido') s.overdue++;
      if (c.updatedAt > s.last) s.last = c.updatedAt;
    });
    s.conv = s.won + s.lost ? Math.round(s.won / (s.won + s.lost) * 100) : null;
    return s;
  }

  /* ============================================================
     NAVEGACIÓN
     ============================================================ */
  function switchView(v) {
    if (v === 'equipo' && !isAdmin()) v = 'resumen';
    state.view = v;
    $('#viewResumen').hidden = v !== 'resumen';
    $('#viewClientes').hidden = v !== 'clientes';
    $('#viewEquipo').hidden = v !== 'equipo';
    $$('#tabs button').forEach(b => {
      if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    renderCurrent();
    window.scrollTo({ top: 0 });
  }
  function renderCurrent() {
    if (state.view === 'resumen') renderResumen();
    else if (state.view === 'clientes') renderClientes();
    else renderEquipo();
  }

  /* ============================================================
     RESUMEN
     ============================================================ */
  function renderResumen() {
    $('#resumenTitle').textContent = `Hola, ${state.user.name}`;
    let list = allVisible();
    if (isAdmin()) {
      const sel = $('#resumenOwner');
      if (!sel.options.length) {
        sel.innerHTML = '<option value="">Todo el equipo</option>' +
          CFG.users.map(u => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('');
      }
      sel.value = state.resumenOwner;
      if (state.resumenOwner) list = list.filter(c => c.owner === state.resumenOwner);
      $('#resumenSub').textContent = state.resumenOwner ? `Resumen de ${ownerName(state.resumenOwner)}.` : 'Resumen de todo el equipo comercial.';
    } else {
      $('#resumenSub').textContent = 'Este es el estado de tu cartera de clientes.';
    }

    const s = stats(list);
    const kpis = [
      ['Clientes', s.total, ''],
      ['En curso', s.open, ''],
      ['Ganados', s.won, 'kpi--ok'],
      ['Valor en curso', money(s.pipeline), ''],
      ['Conversión', s.conv === null ? '—' : s.conv + ' %', ''],
      ['Seguimientos vencidos', s.overdue, s.overdue ? 'kpi--alert' : '']
    ];
    $('#kpis').innerHTML = kpis.map(([l, v, c]) => `<div class="kpi ${c}"><span>${l}</span><strong>${v}</strong></div>`).join('');

    const max = Math.max(1, ...STATUSES.map(st => list.filter(c => c.status === st.id).length));
    $('#funnel').innerHTML = STATUSES.map(st => {
      const n = list.filter(c => c.status === st.id).length;
      return `<div class="funnel__row"><span>${st.label}</span><div class="funnel__bar"><i style="width:${n / max * 100}%;--c:${st.color}"></i></div><b>${n}</b></div>`;
    }).join('');

    const pending = list
      .filter(c => OPEN.includes(c.status) && c.next && c.next <= todayStr(7))
      .sort((a, b) => a.next.localeCompare(b.next)).slice(0, 6);
    $('#followList').innerHTML = pending.length
      ? pending.map(c => `<button type="button" class="follow-item" data-id="${esc(c.id)}">
          <span><strong>${esc(c.business)}</strong><small>${esc(c.contact || ST[c.status].label)}${isAdmin() ? ' · ' + esc(ownerName(c.owner)) : ''}</small></span>${followHTML(c)}</button>`).join('')
      : '<p class="empty">No tienes seguimientos pendientes esta semana.</p>';
  }

  /* ============================================================
     CLIENTES · filtros
     ============================================================ */
  function fillSelect(sel, items, allLabel) {
    const opts = items.map(i => Array.isArray(i) ? i : [i, i]);
    sel.innerHTML = (allLabel ? `<option value="">${allLabel}</option>` : '') +
      opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  }
  function buildFilterControls() {
    fillSelect($('#fStatus'), STATUSES.map(s => [s.id, s.label]), 'Todos');
    fillSelect($('#fService'), SERVICES, 'Todos');
    fillSelect($('#fType'), TYPES, 'Todos');
    fillSelect($('#fCity'), CITIES, 'Todos');
    fillSelect($('#fOwner'), CFG.users.map(u => [u.id, u.name]), 'Todos');
    fillSelect($('#fFollow'), FOLLOW);
    fillSelect($('#fSort'), SORTS);
    syncFilterInputs();
  }
  function syncFilterInputs() {
    const f = state.filters;
    $('#fQ').value = f.q; $('#fStatus').value = f.status; $('#fService').value = f.service; $('#fType').value = f.type;
    $('#fCity').value = f.city; $('#fOwner').value = f.owner; $('#fFollow').value = f.follow; $('#fSort').value = f.sort;
  }
  function readFilterInputs() {
    state.filters = {
      q: $('#fQ').value.trim(), status: $('#fStatus').value, service: $('#fService').value, type: $('#fType').value,
      city: $('#fCity').value, owner: isAdmin() ? $('#fOwner').value : '', follow: $('#fFollow').value, sort: $('#fSort').value
    };
  }
  function activeFilterCount() {
    const f = state.filters;
    return ['q', 'status', 'service', 'type', 'city', 'owner', 'follow'].filter(k => f[k]).length;
  }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  function filteredClients() {
    const f = state.filters;
    const q = norm(f.q);
    let list = allVisible().filter(c => {
      if (f.status && c.status !== f.status) return false;
      if (f.service && c.service !== f.service) return false;
      if (f.type && c.type !== f.type) return false;
      if (f.city && c.city !== f.city) return false;
      if (f.owner && c.owner !== f.owner) return false;
      if (f.follow) {
        const fs = followState(c);
        if (f.follow === 'sin') { if (!(OPEN.includes(c.status) && !c.next)) return false; }
        else if (f.follow === 'semana') { if (!['hoy', 'semana', 'vencido'].includes(fs)) return false; }
        else if (fs !== f.follow) return false;
      }
      if (q) {
        const hay = norm([c.business, c.contact, c.phone, c.email, c.notes, c.city, c.service].join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const by = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => a.business.localeCompare(b.business, 'es'),
      value: (a, b) => (Number(b.value) || 0) - (Number(a.value) || 0),
      follow: (a, b) => (a.next || '9999').localeCompare(b.next || '9999')
    };
    return list.sort(by[f.sort] || by.updated);
  }

  /* ============================================================
     CLIENTES · render
     ============================================================ */
  function renderClientes() {
    const list = filteredClients();
    const total = allVisible().length;
    $('#count').textContent = list.length === total ? `${total} cliente${total === 1 ? '' : 's'}` : `${list.length} de ${total} clientes`;
    const n = activeFilterCount();
    $('#filterBadge').hidden = !n; $('#filterBadge').textContent = n;
    $$('[data-cview]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cview === state.cview)));

    const out = $('#clientsOut');
    if (!list.length) {
      out.innerHTML = total
        ? '<div class="card"><p class="empty">Ningún cliente coincide con los filtros.</p></div>'
        : '<div class="card"><p class="empty">Todavía no hay clientes. Pulsa «+ Nuevo cliente» para añadir el primero.</p></div>';
      return;
    }
    out.innerHTML = state.cview === 'lista' ? tableHTML(list) : boardHTML(list);
  }

  function quickActions(c) {
    const a = [];
    if (c.phone) a.push(`<a class="qa" href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}">Llamar</a>`);
    if (phoneDigits(c.phone)) a.push(`<a class="qa qa--wa" href="https://wa.me/${phoneDigits(c.phone)}" target="_blank" rel="noopener">WhatsApp</a>`);
    if (c.email) a.push(`<a class="qa" href="mailto:${esc(c.email)}">Email</a>`);
    return a.join('');
  }

  function tableHTML(list) {
    const admin = isAdmin();
    const rows = list.map(c => `
      <tr class="row" data-id="${esc(c.id)}" tabindex="0">
        <td class="c-main" data-label="Negocio"><strong>${esc(c.business)}</strong><small>${esc(c.type || '')}${c.city ? ' · ' + esc(c.city) : ''}</small></td>
        <td data-label="Contacto"><span>${esc(c.contact || '—')}<small>${esc(c.phone || c.email || '')}</small></span></td>
        <td data-label="Servicio">${esc(c.service || '—')}</td>
        <td data-label="Estado"><span class="badge st-${c.status}">${ST[c.status].label}</span></td>
        <td data-label="Valor">${c.value ? money(c.value) : '—'}</td>
        <td data-label="Seguimiento">${followHTML(c)}</td>
        ${admin ? `<td data-label="Comercial">${esc(ownerName(c.owner))}</td>` : ''}
        <td class="c-act">${quickActions(c)}</td>
      </tr>`).join('');
    return `<table class="tbl"><thead><tr>
      <th>Negocio</th><th>Contacto</th><th>Servicio</th><th>Estado</th><th>Valor</th><th>Seguimiento</th>${admin ? '<th>Comercial</th>' : ''}<th></th>
      </tr></thead><tbody>${rows}</tbody></table>`;
  }

  function boardHTML(list) {
    const admin = isAdmin();
    const cols = STATUSES.map(st => {
      const items = list.filter(c => c.status === st.id);
      const sum = items.reduce((a, c) => a + (Number(c.value) || 0), 0);
      const cards = items.length ? items.map(c => `
        <article class="kcard" data-id="${esc(c.id)}" tabindex="0">
          <strong>${esc(c.business)}</strong>
          <small>${esc(c.contact || c.type || '')}</small>
          ${admin ? `<small>👤 ${esc(ownerName(c.owner))}</small>` : ''}
          <div class="kmeta"><span>${c.value ? money(c.value) : ''}</span>${followHTML(c)}</div>
        </article>`).join('') : '<p class="empty">Sin clientes</p>';
      return `<section class="col" aria-label="${st.label}">
        <div class="col__head"><span class="badge st-${st.id}">${st.label}</span><small>${items.length}${sum ? ' · ' + money(sum) : ''}</small></div>
        <div class="col__list">${cards}</div></section>`;
    }).join('');
    return `<div class="board">${cols}</div>`;
  }

  /* ============================================================
     EQUIPO (admin)
     ============================================================ */
  function renderEquipo() {
    const members = CFG.users.filter(u => u.role === 'comercial' || state.data.clients.some(c => c.owner === u.id));
    const rows = members.map(u => {
      const s = stats(state.data.clients.filter(c => c.owner === u.id));
      return `<tr>
        <td class="t-name"><div class="t-who"><span class="avatar">${esc(initials(u.name))}</span><div><strong>${esc(u.name)}</strong><small>${u.role === 'admin' ? 'Administrador' : 'Comercial'} · ${esc(u.id)}</small></div></div></td>
        <td data-label="Clientes">${s.total}</td>
        <td data-label="En curso">${s.open}</td>
        <td data-label="Ganados">${s.won}</td>
        <td data-label="Valor en curso">${money(s.pipeline)}</td>
        <td data-label="Conversión">${s.conv === null ? '—' : s.conv + ' %'}</td>
        <td data-label="Vencidos">${s.overdue ? `<span class="pill pill--red">${s.overdue}</span>` : '0'}</td>
        <td data-label="Última actividad">${s.last ? fmtDT(s.last) : '—'}</td>
        <td class="t-act"><button class="btn btn--ghost btn--sm" type="button" data-owner="${esc(u.id)}">Ver clientes</button></td>
      </tr>`;
    }).join('');
    $('#teamOut').innerHTML = `<table class="team"><thead><tr>
      <th>Comercial</th><th>Clientes</th><th>En curso</th><th>Ganados</th><th>Valor en curso</th><th>Conversión</th><th>Vencidos</th><th>Última actividad</th><th></th>
      </tr></thead><tbody>${rows}</tbody></table>`;
  }

  /* ============================================================
     DIÁLOGO DE CLIENTE
     ============================================================ */
  const dlg = () => $('#clientDialog');
  function closeDialog() { if (dlg().open) dlg().close(); state.editingId = null; }

  function openClient(id) {
    const c = id ? state.data.clients.find(x => x.id === id) : null;
    if (id && (!c || (!isAdmin() && c.owner !== state.user.id))) return;
    state.editingId = id || null;

    fillSelect($('#cType'), TYPES); fillSelect($('#cService'), SERVICES);
    fillSelect($('#cCity'), CITIES); fillSelect($('#cStatus'), STATUSES.map(s => [s.id, s.label]));
    fillSelect($('#cOwner'), CFG.users.map(u => [u.id, u.name]));

    $('#dlgTitle').textContent = c ? c.business : 'Nuevo cliente';
    $('#dlgSub').textContent = c ? `Alta: ${fmtDT(c.createdAt)} · Lleva: ${ownerName(c.owner)}` : '';
    $('#cBusiness').value = c ? c.business : '';
    $('#cContact').value = c ? c.contact : '';
    $('#cPhone').value = c ? c.phone : '';
    $('#cEmail').value = c ? c.email : '';
    $('#cType').value = c ? (c.type || TYPES[0]) : TYPES[0];
    $('#cService').value = c ? (c.service || SERVICES[3]) : SERVICES[3];
    $('#cCity').value = c ? (c.city || CITIES[0]) : CITIES[0];
    $('#cStatus').value = c ? c.status : 'nuevo';
    $('#cValue').value = c && c.value ? c.value : '';
    $('#cNext').value = c ? (c.next || '') : '';
    $('#cNotes').value = c ? c.notes : '';
    $('#cOwnerWrap').hidden = !isAdmin();
    $('#cOwner').value = c ? c.owner : (isAdmin() ? (CFG.users.find(u => u.role === 'comercial') || state.user).id : state.user.id);
    $('#formError').hidden = true;
    $('#dlgDelete').hidden = !c;
    $('#logSection').hidden = !c;
    $('#logInput').value = '';
    const q = $('#dlgQuick');
    const qa = c ? quickActions(c) : '';
    q.innerHTML = qa; q.hidden = !qa;
    if (c) renderLog(c);

    if (!dlg().open) dlg().showModal();
    if (!c) $('#cBusiness').focus();
  }

  function renderLog(c) {
    const items = (c.log || []).slice().reverse();
    $('#logList').innerHTML = items.length
      ? items.map(l => `<li class="${l.type === 'nota' ? '' : 'sys'}">${esc(l.text)}<small>${fmtDT(l.t)} · ${esc(ownerName(l.by))}</small></li>`).join('')
      : '<li class="sys">Sin actividad todavía.</li>';
  }

  function saveClient(ev) {
    ev.preventDefault();
    const business = $('#cBusiness').value.trim();
    const err = $('#formError');
    if (!business) { err.textContent = 'El nombre del negocio es obligatorio.'; err.hidden = false; $('#cBusiness').focus(); return; }
    const email = $('#cEmail').value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'El email no parece válido.'; err.hidden = false; $('#cEmail').focus(); return; }
    err.hidden = true;

    const fields = {
      business, contact: $('#cContact').value.trim(), phone: $('#cPhone').value.trim(), email,
      type: $('#cType').value, service: $('#cService').value, city: $('#cCity').value, status: $('#cStatus').value,
      value: Math.max(0, Number($('#cValue').value) || 0), next: $('#cNext').value || '', notes: $('#cNotes').value.trim(),
      owner: isAdmin() ? $('#cOwner').value : state.user.id
    };

    if (state.editingId) {
      const c = state.data.clients.find(x => x.id === state.editingId);
      if (!c) return;
      c.log = c.log || [];
      if (c.status !== fields.status) c.log.push({ t: now(), by: state.user.id, type: 'estado', text: `Estado: ${ST[c.status].label} → ${ST[fields.status].label}` });
      if (c.owner !== fields.owner) c.log.push({ t: now(), by: state.user.id, type: 'estado', text: `Reasignado a ${ownerName(fields.owner)}` });
      Object.assign(c, fields, { updatedAt: now() });
      toast('Cliente actualizado');
    } else {
      const t = now();
      state.data.clients.push({
        id: uid(), ...fields, createdAt: t, updatedAt: t,
        log: [{ t, by: state.user.id, type: 'estado', text: 'Cliente creado' }]
      });
      toast('Cliente añadido');
    }
    persist();
    closeDialog();
    renderCurrent();
  }

  function addNote() {
    const input = $('#logInput');
    const text = input.value.trim();
    const c = state.data.clients.find(x => x.id === state.editingId);
    if (!text || !c) return;
    c.log = c.log || [];
    c.log.push({ t: now(), by: state.user.id, type: 'nota', text });
    c.updatedAt = now();
    persist();
    input.value = '';
    renderLog(c);
    renderCurrent();
    toast('Nota añadida');
  }

  function deleteClient() {
    const c = state.data.clients.find(x => x.id === state.editingId);
    if (!c) return;
    if (!confirm(`¿Eliminar a «${c.business}»? Esta acción no se puede deshacer.`)) return;
    state.data.clients = state.data.clients.filter(x => x.id !== c.id);
    persist();
    closeDialog();
    renderCurrent();
    toast('Cliente eliminado');
  }

  /* ============================================================
     EXPORTAR / IMPORTAR
     ============================================================ */
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csvCell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita inyección de fórmulas en Excel
    return '"' + s.replace(/"/g, '""') + '"';
  };
  function exportCsv() {
    const list = filteredClients();
    if (!list.length) { toast('No hay clientes que exportar'); return; }
    const head = ['Negocio', 'Contacto', 'Teléfono', 'Email', 'Tipo', 'Servicio', 'Ciudad', 'Estado', 'Valor (€)', 'Próximo seguimiento', 'Comercial', 'Notas', 'Alta'];
    const rows = list.map(c => [c.business, c.contact, c.phone, c.email, c.type, c.service, c.city, ST[c.status].label, c.value || '', c.next, ownerName(c.owner), c.notes, c.createdAt.slice(0, 10)]);
    const csv = '﻿' + [head, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n');
    download(`clientes-appxpand-${todayStr()}.csv`, csv, 'text/csv;charset=utf-8');
  }
  function exportJson(onlyMine) {
    const clients = onlyMine ? allVisible() : state.data.clients;
    download(`appxpand-crm-${onlyMine ? state.user.id + '-' : ''}${todayStr()}.json`,
      JSON.stringify({ app: 'appxpand-crm', version: 1, exportedBy: state.user.id, exportedAt: now(), clients }, null, 2), 'application/json');
  }

  const str = (v, max) => String(v ?? '').slice(0, max);
  function cleanClient(c) {
    if (!c || typeof c !== 'object') return null;
    const business = str(c.business, 120).trim();
    if (!business) return null;
    const t = typeof c.createdAt === 'string' && !isNaN(Date.parse(c.createdAt)) ? c.createdAt : now();
    return {
      id: str(c.id || uid(), 40).replace(/[^\w-]/g, '') || uid(),
      business, contact: str(c.contact, 80), phone: str(c.phone, 30), email: str(c.email, 120),
      type: TYPES.includes(c.type) ? c.type : TYPES[4], service: SERVICES.includes(c.service) ? c.service : SERVICES[3],
      city: CITIES.includes(c.city) ? c.city : CITIES[3], status: ST[c.status] ? c.status : 'nuevo',
      value: Math.max(0, Number(c.value) || 0), next: /^\d{4}-\d{2}-\d{2}$/.test(c.next || '') ? c.next : '',
      notes: str(c.notes, 1500), owner: userById(c.owner) ? c.owner : 'admin',
      createdAt: t, updatedAt: typeof c.updatedAt === 'string' && !isNaN(Date.parse(c.updatedAt)) ? c.updatedAt : t,
      log: Array.isArray(c.log) ? c.log.slice(-200).map(l => ({
        t: typeof l.t === 'string' && !isNaN(Date.parse(l.t)) ? l.t : t, by: str(l.by, 40),
        type: l.type === 'nota' ? 'nota' : 'estado', text: str(l.text, 400)
      })) : []
    };
  }
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (!d || !Array.isArray(d.clients)) throw new Error('formato');
        let added = 0, updated = 0;
        d.clients.map(cleanClient).filter(Boolean).forEach(inc => {
          const cur = state.data.clients.find(c => c.id === inc.id);
          if (!cur) { state.data.clients.push(inc); added++; }
          else if (inc.updatedAt > cur.updatedAt) { Object.assign(cur, inc); updated++; }
        });
        persist(); renderCurrent();
        toast(`Importado: ${added} nuevos, ${updated} actualizados`);
      } catch { toast('Archivo no válido'); }
    };
    reader.readAsText(file);
  }

  function loadDemo() {
    if (!confirm('Se añadirán clientes de ejemplo a los que ya tienes. ¿Continuar?')) return;
    const reps = CFG.users.filter(u => u.role === 'comercial');
    const owners = reps.length ? reps : [state.user];
    const D = [
      ['Peluquería Estilo', 'Carmen López', 'Peluquería o estética', 'Paquete lanzadera', 'Albacete', 'contactado', 330, 1],
      ['Bar La Plaza', 'Andrés Ruiz', 'Restaurante o bar', 'Optimización de perfil de Google', 'Ciudad Real', 'reunion', 450, 3],
      ['Taller Hermanos Gil', 'Pedro Gil', 'Servicios (reformas, talleres, clínicas…)', 'Página web', 'Alicante', 'propuesta', 600, -2],
      ['Boutique Aurora', 'Lucía Marín', 'Tienda', 'Paquete lanzadera', 'Albacete', 'nuevo', 330, 0],
      ['Clínica Dental Sonríe', 'Dra. Vidal', 'Servicios (reformas, talleres, clínicas…)', 'Optimización de perfil de Google', 'Alicante', 'ganado', 520, ''],
      ['Restaurante El Olivo', 'Jorge Peña', 'Restaurante o bar', 'Página web', 'Ciudad Real', 'perdido', 700, ''],
      ['Estética Bella', 'Marina Soto', 'Peluquería o estética', 'Paquete lanzadera', 'Alicante', 'contactado', 330, 5],
      ['Ferretería Central', 'Luis Cano', 'Tienda', 'Página web', 'Albacete', 'reunion', 550, -4],
      ['Reformas Mediterráneo', 'Raúl Ferrer', 'Servicios (reformas, talleres, clínicas…)', 'Paquete lanzadera', 'Alicante', 'propuesta', 330, 2],
      ['Cafetería Dulce Luna', 'Eva Torres', 'Restaurante o bar', 'Paquete lanzadera', 'Albacete', 'ganado', 330, ''],
      ['Barbería Clásica', 'Iván Mora', 'Peluquería o estética', 'Optimización de perfil de Google', 'Ciudad Real', 'nuevo', 400, 4],
      ['Floristería Margarita', 'Rosa Gil', 'Tienda', 'Por definir', 'Albacete', 'contactado', 0, -1]
    ];
    D.forEach(([business, contact, type, service, city, status, value, off], i) => {
      const t = new Date(Date.now() - (i + 1) * 36e5 * 7).toISOString();
      const owner = owners[i % owners.length].id;
      state.data.clients.push({
        id: uid(), business, contact, phone: '600 00 00 ' + pad(10 + i), email: '', type, service, city, status, value,
        next: off === '' || !OPEN.includes(status) ? '' : todayStr(off), notes: 'Cliente de ejemplo.', owner,
        createdAt: t, updatedAt: t, log: [{ t, by: owner, type: 'estado', text: 'Cliente creado' }]
      });
    });
    persist(); renderCurrent(); toast('Datos de ejemplo cargados');
  }
  function wipeAll() {
    if (!confirm('¿Borrar TODOS los clientes de este dispositivo? No se puede deshacer.')) return;
    if (prompt('Escribe BORRAR para confirmar') !== 'BORRAR') return;
    state.data.clients = []; persist(); renderCurrent(); toast('Todos los clientes borrados');
  }

  /* ============================================================
     GENERADOR DE CÓDIGOS
     ============================================================ */
  async function generateCode(ev) {
    ev.preventDefault();
    const name = $('#genName').value.trim();
    if (!name) return;
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I/L
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const raw = [...bytes].map(b => alphabet[b % alphabet.length]).join('');
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    const hash = await hashCode(code);
    const id = norm(name).replace(/[^a-z0-9]+/g, '') || 'usuario';
    const role = $('#genRole').value;
    $('#genCode').textContent = code;
    $('#genLine').textContent = `{ id: '${id}', name: '${name.replace(/'/g, "\\'")}', role: '${role}', hash: '${hash}' },`;
    $('#genOut').hidden = false;
  }

  /* ============================================================
     EVENTOS
     ============================================================ */
  function bind() {
    $('#loginForm').addEventListener('submit', onLogin);
    $('#toggleCode').addEventListener('click', () => {
      const i = $('#code'); i.type = i.type === 'password' ? 'text' : 'password';
    });
    $('#logoutBtn').addEventListener('click', logout);

    $('#tabs').addEventListener('click', e => {
      const b = e.target.closest('button[data-view]'); if (b) switchView(b.dataset.view);
    });
    $('#resumenOwner').addEventListener('change', e => { state.resumenOwner = e.target.value; renderResumen(); });
    $('#followList').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) openClient(b.dataset.id); });

    // Filtros
    const refilter = () => { readFilterInputs(); renderClientes(); };
    $('#fQ').addEventListener('input', refilter);
    ['#fStatus', '#fService', '#fType', '#fCity', '#fOwner', '#fFollow', '#fSort'].forEach(s => $(s).addEventListener('change', refilter));
    $('#clearFilters').addEventListener('click', () => {
      state.filters = { q: '', status: '', service: '', type: '', city: '', owner: '', follow: '', sort: 'updated' };
      syncFilterInputs(); renderClientes();
    });
    $('#toggleFilters').addEventListener('click', () => {
      const open = $('#filters').classList.toggle('is-open');
      $('#toggleFilters').setAttribute('aria-expanded', String(open));
    });
    $$('[data-cview]').forEach(b => b.addEventListener('click', () => { state.cview = b.dataset.cview; renderClientes(); }));
    $('#exportCsv').addEventListener('click', exportCsv);
    $('#newClient').addEventListener('click', () => openClient(null));

    // Abrir cliente desde lista/tablero
    const openFromEvent = e => {
      if (e.target.closest('a')) return;
      const el = e.target.closest('[data-id]'); if (el) openClient(el.dataset.id);
    };
    $('#clientsOut').addEventListener('click', openFromEvent);
    $('#clientsOut').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-id]')) openFromEvent(e); });

    // Equipo
    $('#teamOut').addEventListener('click', e => {
      const b = e.target.closest('[data-owner]'); if (!b) return;
      state.filters = { q: '', status: '', service: '', type: '', city: '', owner: b.dataset.owner, follow: '', sort: 'updated' };
      syncFilterInputs(); switchView('clientes');
    });
    $('#genForm').addEventListener('submit', generateCode);
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-copy]'); if (!b) return;
      const txt = $(b.dataset.copy).textContent;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('Copiado'), () => toast('No se pudo copiar'));
    });
    $('#exportAll').addEventListener('click', () => exportJson(false));
    $('#exportMine').addEventListener('click', () => exportJson(true));
    $('#importFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importJson(f); e.target.value = ''; });
    $('#loadDemo').addEventListener('click', loadDemo);
    $('#wipeAll').addEventListener('click', wipeAll);

    // Diálogo
    $('#clientForm').addEventListener('submit', saveClient);
    $('#dlgClose').addEventListener('click', closeDialog);
    $('#dlgCancel').addEventListener('click', closeDialog);
    $('#dlgDelete').addEventListener('click', deleteClient);
    $('#logAdd').addEventListener('click', addNote);
    $('#logInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } });
    dlg().addEventListener('click', e => { if (e.target === dlg()) closeDialog(); });
    dlg().addEventListener('close', () => { state.editingId = null; });

    // Sincronizar si cambia en otra pestaña
    window.addEventListener('storage', e => {
      if (e.key === DATA_KEY && state.user) { state.data = Store.load(); if (!dlg().open) renderCurrent(); }
      if (e.key === SESSION_KEY && !e.newValue && !sessionStorage.getItem(SESSION_KEY) && state.user) logout();
    });
  }

  /* ---------- Arranque ---------- */
  bind();
  const existing = readSession();
  if (existing) enterApp(existing); else $('#code').focus();
})();
