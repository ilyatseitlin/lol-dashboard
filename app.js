'use strict';

const ROLE_ICON = {
  Top: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 14V2h12M5 11V5h6"/></svg>',
  Jungle: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 14V6M8 6 3 2M8 8l5-5M8 11l-4-3"/></svg>',
  Mid: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 14 14 2M2 9v5h5M9 2h5v5"/></svg>',
  ADC: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 14V2H2M11 11V5H5"/></svg>',
  Support: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 2v12M3 6h10M5 14h6"/></svg>'
};
const ROLE_RU = { Top: 'Топ', Jungle: 'Лес', Mid: 'Мид', ADC: 'АДК', Support: 'Саппорт' };
const TIER_COLOR = { Iron:'#7a6a5e', Bronze:'#a86a3c', Silver:'#9aa5b1', Gold:'#e0b24a', Platinum:'#4e9996', Emerald:'#2da05f', Diamond:'#576bce', Master:'#b24ad6', Grandmaster:'#e5484d', Challenger:'#f4c874' };
const INSIGHT_ICON = {
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 17 6-6 4 4 8-8M15 7h6v6"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-5M12 8h.01"/></svg>'
};

const $ = (id) => document.getElementById(id);
const pct = (x) => Math.round(x * 100) + '%';
const num = (x, d = 2) => Number(x).toFixed(d);
const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const dateRu = (iso) => new Date(iso + 'T00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const state = { data: null, training: null, sel: 'top', ver: '14.23.1' };

const champImg = (id, cls = '') =>
  `<img class="${cls}" loading="lazy" alt="${esc(id)}" src="https://ddragon.leagueoflegends.com/cdn/${state.ver}/img/champion/${encodeURIComponent(id)}.png" onerror="this.style.visibility='hidden'">`;
const avatar = (p, cls = 'av') => champImg(p.champions[0].id, cls);

function emblem(tier) {
  const c = TIER_COLOR[tier] || '#888';
  return `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 9l-9 13L3 9z" fill="${c}" fill-opacity=".25" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 7l4 3-4 6-4-6z" fill="${c}"/></svg>`;
}

function ring(score) {
  const r = 26, c = 2 * Math.PI * r, col = score >= 70 ? 'var(--teal)' : 'var(--gold)';
  return `<div class="ring"><svg width="60" height="60"><circle cx="30" cy="30" r="${r}" fill="none" stroke="#222b45" stroke-width="5"/><circle cx="30" cy="30" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * score) / 100} ${c}"/></svg><span>${score}</span></div>`;
}

function spark(arr) {
  if (!arr || arr.length < 2) return '<div class="spark empty">история копится</div>';
  const w = 200, h = 44, min = Math.min(...arr), max = Math.max(...arr), span = max - min || 1;
  const pts = arr.map((v, i) => [(i / (arr.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 10)]);
  const line = pts.map((p) => p.join(',')).join(' ');
  const up = arr[arr.length - 1] >= arr[0], col = up ? '#0ac8b9' : '#e84057';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polygon points="0,${h} ${line} ${w},${h}" fill="${col}" fill-opacity=".15"/><polyline points="${line}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

const bar = (v, cls = '') => `<span class="bar ${cls}"><i style="width:${Math.round(v * 100)}%"></i></span>`;

function renderHeader() {
  const { meta, team } = state.data;
  document.title = `${meta.team} — LoL Dashboard`;
  $('teamName').textContent = meta.team;
  $('teamSub').textContent = `Патч ${meta.patch} · Обновлено ${new Date(meta.generatedAt + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  const tier = team.rankLabel.split(' ')[0];
  $('teamRating').innerHTML = `
    <div class="rk">${emblem(tier).replace('width="22" height="22"', 'width="38" height="38"')}<div><small>Рейтинг команды</small><span class="big">≈ ${esc(team.rankLabel)}</span></div></div>
    <span class="sep"></span><div><small>Team Score</small><span class="big">${team.rankScore}</span></div>
    <span class="sep"></span><div><small>Винрейт</small><span class="big up">${pct(team.winrate)}</span></div>`;
}

function renderRoster() {
  $('rosterGrid').innerHTML = state.data.players.map((p) => {
    const s = p.stats, d = p.formDelta, hasLp = p.lpHistory && p.lpHistory.length > 1, lp = hasLp ? p.lpHistory[p.lpHistory.length - 1] : 0;
    return `<article class="pcard ${p.id === state.sel ? 'sel' : ''}" data-id="${p.id}">
      <div class="role">${ROLE_ICON[p.role]} ${ROLE_RU[p.role]}</div>
      <div class="who">${avatar(p)}<div><b><a href="${p.opgg}" target="_blank" rel="noopener">${esc(p.name)}</a></b>
        <div class="rank">${emblem(p.rank.tier)} ${p.rank.tier} ${p.rank.division || ''} · ${p.rank.lp} LP</div>
        <div class="wr">${pct(s.winrate)} · ${s.wins}W ${s.losses}L</div></div></div>
      <div class="mini"><div><small>KDA</small><b>${num(s.kda)}</b></div><div><small>CS/мин</small><b>${num(s.csPerMin, 1)}</b></div><div><small>Обзор/мин</small><b>${num(s.visionPerMin)}</b></div></div>
      <div class="formrow">${ring(p.formScore)}<div><small>Form Score</small><b class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${sign(d)}</b></div></div>
      <div class="lp"><span>LP (динамика)</span><b class="${lp >= 0 ? 'up' : 'down'}">${hasLp ? sign(lp) + ' LP' : '—'}</b></div>
      ${spark(p.lpHistory)}
    </article>`;
  }).join('');
  document.querySelectorAll('.pcard').forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    selectPlayer(el.dataset.id);
  }));
}

function renderLeaderboard() {
  const ps = [...state.data.players].sort((a, b) => b.formScore - a.formScore);
  $('leaderboard').innerHTML = `<thead><tr><th>#</th><th>Игрок</th><th>Роль</th><th>Form Score</th><th class="num">Тренд</th></tr></thead><tbody>` +
    ps.map((p, i) => `<tr><td><span class="idx ${i < 3 ? 'i' + (i + 1) : ''}">${i + 1}</span></td>
      <td><div class="cell">${avatar(p, '')}<b>${esc(p.name)}</b></div></td><td>${ROLE_RU[p.role]}</td>
      <td><div class="barcell"><b>${p.formScore}</b>${bar(p.formScore / 100, p.formScore < 70 ? 'gold' : '')}</div></td>
      <td class="num ${p.formDelta >= 0 ? 'up' : 'down'}">${p.formDelta >= 0 ? '▲' : '▼'} ${sign(p.formDelta)}</td></tr>`).join('') + '</tbody>';
}

function renderBestAt() {
  const ps = state.data.players;
  const top = (f) => ps.reduce((a, b) => (f(b) > f(a) ? b : a));
  const rows = [
    ['Лучший KDA', top((p) => p.stats.kda), (p) => num(p.stats.kda)],
    ['Лучший CS/мин', top((p) => p.stats.csPerMin), (p) => num(p.stats.csPerMin, 1)],
    ['Лучший обзор/мин', top((p) => p.stats.visionPerMin), (p) => num(p.stats.visionPerMin)],
    ['Лучший винрейт', top((p) => p.stats.winrate), (p) => pct(p.stats.winrate)]
  ];
  $('bestAtList').innerHTML = rows.map(([l, p, f]) => `<div class="best"><span class="l">${l}</span><span class="r">${avatar(p, '')}${f(p)} · ${esc(p.name)}</span></div>`).join('');
}

const champRows = (list, withIdx = true) => list.map((c, i) => `<tr>
  ${withIdx ? `<td>${i + 1}</td>` : ''}<td><div class="cell">${champImg(c.id)}${esc(c.name)}</div></td>
  <td class="num">${c.games}</td>
  <td><div class="barcell">${bar(c.winrate, c.winrate < 0.55 ? 'gold' : '')}<span class="${c.winrate >= 0.55 ? 'up' : ''}">${pct(c.winrate)}</span></div></td>
  <td class="num">${num(c.kda)}</td></tr>`).join('');
const champHead = '<thead><tr><th>#</th><th>Чемпион</th><th class="num">Игры</th><th>Винрейт</th><th class="num">KDA</th></tr></thead>';

function renderChampions() {
  $('teamChamps').innerHTML = champHead + '<tbody>' + champRows(state.data.team.champions) + '</tbody>';
  $('playerTabs').innerHTML = state.data.players.map((p) => `<button role="tab" class="${p.id === state.sel ? 'on' : ''}" data-id="${p.id}">${esc(p.name)}</button>`).join('');
  $('playerTabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => selectPlayer(b.dataset.id)));
  const p = state.data.players.find((x) => x.id === state.sel);
  $('playerChampsTitle').textContent = `${p.name}: топ чемпионов (последние 30 игр)`;
  $('playerChamps').innerHTML = champHead + '<tbody>' + champRows(p.champions) + '</tbody>';
}

function selectPlayer(id) {
  state.sel = id;
  renderRoster();
  renderChampions();
}

function renderStats() {
  const t = state.data.team;
  $('tiles').innerHTML = [
    ['Винрейт', pct(t.winrate), 'up'], ['Игры', t.games, ''], ['Средняя игра', t.avgDuration, ''], ['First Blood', pct(t.firstBlood), '']
  ].map(([l, v, c]) => `<div class="tile"><small>${l}</small><b class="${c}">${v}</b></div>`).join('');
  $('formStrip').innerHTML = t.form.map((r) => `<span class="${r}">${r === 'W' ? 'П' : 'Л'}</span>`).join('');
  const names = { dragons: 'Драконы', barons: 'Бароны', towers: 'Башни' };
  $('objectives').innerHTML = Object.entries(t.objectives).map(([k, v]) => `<div class="obj"><span>${names[k]}</span>${bar(v)}<b>${pct(v)}</b></div>`).join('');
}

function renderInsights() {
  $('insightList').innerHTML = state.data.insights.map((i) => `<div class="ins ${i.type}">${INSIGHT_ICON[i.icon] || INSIGHT_ICON.info}<div><b>${esc(i.title)}</b><p>${esc(i.text)}</p></div></div>`).join('');
}

function renderTraining() {
  const t = state.training, byId = Object.fromEntries(state.data.players.map((p) => [p.id, p]));
  $('focus').innerHTML = `<small>Фокус недели</small><h3>${esc(t.focus.title)}</h3><p>${esc(t.focus.text)}</p>`;
  const sorted = [...t.sessions].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const up = sorted.filter((s) => s.status !== 'done').slice(0, 3);
  const lastDone = sorted.filter((s) => s.status === 'done').slice(-1);
  const shown = [...lastDone, ...up];
  $('sessions').innerHTML = '<thead><tr><th>Дата</th><th>Время</th><th>Тема</th><th>Участники</th><th>Статус</th></tr></thead><tbody>' +
    shown.map((s) => `<tr><td>${dateRu(s.date)}</td><td>${s.time}</td><td>${esc(s.title)}</td>
      <td><div class="avs">${s.participants.map((id) => avatar(byId[id], '')).join('')}</div></td>
      <td><span class="status ${s.status}">${s.status === 'done' ? 'Проведена' : 'Запланирована'}</span></td></tr>`).join('') + '</tbody>';
  $('goals').innerHTML = t.goals.map((g) => {
    const f = (v) => (g.format === 'pct' ? pct(v) : g.format === 'int' ? String(v) : num(v));
    const r = Math.min(g.value / g.target, 1);
    return `<div class="goal"><div class="row"><span>${esc(g.title)}</span><b>${f(g.value)} / ${f(g.target)}</b></div>${bar(r)}</div>`;
  }).join('');
}

function setupNav() {
  const links = [...document.querySelectorAll('#nav a')];
  const secs = links.map((a) => document.querySelector(a.getAttribute('href')));
  const onScroll = () => {
    const y = window.scrollY + 160;
    let cur = 0;
    secs.forEach((s, i) => { if (s && s.offsetTop <= y) cur = i; });
    links.forEach((a, i) => a.classList.toggle('active', i === cur));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(url + ': ' + r.status);
  return r.json();
}

async function init() {
  try {
    const [data, training] = await Promise.all([getJSON('data.json'), getJSON('training.json')]);
    state.data = data;
    state.training = training;
    fetch('https://ddragon.leagueoflegends.com/api/versions.json').then((r) => r.json()).then((v) => { state.ver = v[0]; render(); }).catch(() => {});
    render();
    setupNav();
  } catch (e) {
    document.querySelector('main').innerHTML = `<p class="card">Не удалось загрузить данные: ${esc(e.message)}. Откройте страницу через веб-сервер, а не как файл.</p>`;
  }
}

function render() {
  renderHeader(); renderRoster(); renderLeaderboard(); renderBestAt(); renderChampions(); renderStats(); renderInsights(); renderTraining();
}

init();
