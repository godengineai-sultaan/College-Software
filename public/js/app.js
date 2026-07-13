/* College Software — small client-side helpers (no framework needed) */
(function () {
  'use strict';

  // Mobile sidebar toggle
  var burger = document.querySelector('.hamburger');
  var sidebar = document.querySelector('.sidebar');
  var backdrop = document.querySelector('.backdrop');
  function closeNav() { if (sidebar) sidebar.classList.remove('open'); if (backdrop) backdrop.classList.remove('show'); }
  if (burger && sidebar) {
    burger.addEventListener('click', function () {
      sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('show');
    });
  }
  if (backdrop) backdrop.addEventListener('click', closeNav);

  // Confirm destructive actions (forms/links with data-confirm)
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute && e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });
  document.querySelectorAll('a[data-confirm]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (!window.confirm(a.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // Auto-dismiss flash alerts
  setTimeout(function () {
    document.querySelectorAll('.alert[data-auto]').forEach(function (el) {
      el.style.transition = 'opacity .4s'; el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 400);
    });
  }, 4500);

  // "Select all" checkboxes in tables (used by attendance / bulk actions)
  document.querySelectorAll('[data-check-all]').forEach(function (master) {
    master.addEventListener('change', function () {
      var name = master.getAttribute('data-check-all');
      document.querySelectorAll('input[type=checkbox][data-check="' + name + '"]').forEach(function (cb) {
        cb.checked = master.checked;
      });
    });
  });
})();
