'use strict';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TYPE = { vod: 'Разбор VOD', scrim: 'Скрим', drill: 'Тренировка', review: 'Обзор' };
const dateRu = (iso) => new Date(iso + 'T00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
const fmt = (g, v) => (g.format === 'pct' ? Math.round(v * 100) + '%' : g.format === 'int' ? String(v) : Number(v).toFixed(2));

let ver = '14.23.1';
const champImg = (id) => `<img alt="${esc(id)}" src="https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${encodeURIComponent(id)}.png" onerror="this.style.visibility='hidden'">`;

function card(s, byId) {
  return `<article class="scard ${s.status}">
    <div class="sdate"><b>${dateRu(s.date)}</b><span>${s.time}</span></div>
    <div class="sbody">
      <div class="shead"><span class="stype">${TYPE[s.type] || 'Сессия'}</span><span class="status ${s.status}">${s.status === 'done' ? 'Проведена' : 'Запланирована'}</span></div>
      <h3>${esc(s.title)}</h3>
      ${s.notes ? `<p>${esc(s.notes)}</p>` : ''}
      <div class="avs">${s.participants.map((id) => byId[id] ? champImg(byId[id].champions[0].id) : '').join('')}</div>
    </div></article>`;
}

async function init() {
  try {
    const [t, d] = await Promise.all([fetch('training.json', { cache: 'no-cache' }).then((r) => r.json()), fetch('data.json', { cache: 'no-cache' }).then((r) => r.json())]);
    try { ver = (await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json())[0]; } catch (e) {}
    const byId = Object.fromEntries(d.players.map((p) => [p.id, p]));
    $('teamName').textContent = d.meta.team;
    $('mockChip').hidden = !d.meta.mock;
    $('upd').textContent = 'Обновлено ' + new Date(t.updated + 'T00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    $('focus').innerHTML = `<small>Фокус недели</small><h3>${esc(t.focus.title)}</h3><p>${esc(t.focus.text)}</p>`;
    $('goals').innerHTML = t.goals.map((g) => `<div class="goal"><div class="row"><span>${esc(g.title)}</span><b>${fmt(g, g.value)} / ${fmt(g, g.target)}</b></div><span class="bar"><i style="width:${Math.round(Math.min(g.value / g.target, 1) * 100)}%"></i></span></div>`).join('');
    const sorted = [...t.sessions].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const up = sorted.filter((s) => s.status !== 'done'), done = sorted.filter((s) => s.status === 'done').reverse();
    $('upcoming').innerHTML = up.map((s) => card(s, byId)).join('') || '<p class="muted">Нет запланированных сессий.</p>';
    $('done').innerHTML = done.map((s) => card(s, byId)).join('') || '<p class="muted">Пока ничего.</p>';
  } catch (e) {
    document.querySelector('main').innerHTML = `<p class="card">Не удалось загрузить данные: ${esc(e.message)}</p>`;
  }
}
init();
