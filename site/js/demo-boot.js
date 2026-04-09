(function(global) {
  async function fetchJson(path) {
    var resp = await fetch(String(path || '').replace(/^\/+/, '') + '?v=' + Date.now(), {
      cache: 'no-store'
    });
    if (!resp.ok) return null;
    return resp.json();
  }

  function cloneItems(items) {
    return Array.isArray(items) ? items.slice() : [];
  }

  async function applyDemoState(options, hidden) {
    var current = cloneItems(options.getItems());
    current = current.filter(function(item) { return !(item && item.demo); });

    if (!hidden) {
      var demo = await fetchJson(options.demoPath);
      if (demo) current.unshift(demo);
    }

    options.setItems(current);
    localStorage.setItem(options.storeKey, JSON.stringify(current));
    options.renderBoard();
  }

  function init(options) {
    if (!options || !options.getItems || !options.setItems || !options.renderBoard || !options.storeKey || !options.demoPath) {
      return;
    }

    var button = document.getElementById(options.buttonId || 'toggleDemoBtn');
    if (!button) return;

    var hiddenKey = options.hiddenKey || (options.storeKey + '_hide_demo');
    var hidden = localStorage.getItem(hiddenKey) === '1';

    function updateButton() {
      button.textContent = hidden ? 'Show Demo Data' : 'Clear Demo Data';
    }

    button.addEventListener('click', function() {
      hidden = !hidden;
      localStorage.setItem(hiddenKey, hidden ? '1' : '0');
      updateButton();
      applyDemoState(options, hidden);
    });

    updateButton();
    applyDemoState(options, hidden);
  }

  global.BonfyreDemoBoot = {
    init: init
  };
})(window);
