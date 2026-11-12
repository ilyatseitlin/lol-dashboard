'use strict';
// Нижнее меню на телефоне: каждая вкладка показывает свою группу блоков (CSS в style.css, ширина до 640 px).
(function () {
  var TABS = ['roster', 'champions', 'stats', 'plan', 'tasks'];
  var ALIAS = { insights: 'stats', training: 'plan', tasksSec: 'tasks' };
  var buttons = [].slice.call(document.querySelectorAll('#tabbar [data-go]'));
  if (!buttons.length) return;

  function fromHash() {
    var h = (location.hash || '').replace('#', '');
    return TABS.indexOf(h) >= 0 ? h : ALIAS[h] || null;
  }
  function saved() { try { var t = localStorage.getItem('lol-tab'); return TABS.indexOf(t) >= 0 ? t : null; } catch (e) { return null; } }

  function show(tab, scroll) {
    document.body.setAttribute('data-view', tab);
    buttons.forEach(function (b) { b.setAttribute('aria-current', String(b.getAttribute('data-go') === tab)); });
    try { localStorage.setItem('lol-tab', tab); } catch (e) { /* без хранилища работает так же */ }
    if (scroll) window.scrollTo(0, 0);
  }

  buttons.forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-go'), true); }); });
  show(fromHash() || saved() || 'roster', false);
})();
