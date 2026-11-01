// Index once per catalog render; searching never needs an API request.
export function productSearchIndex(products) {
  return products.filter(product => product.active !== false).map(product => ({ product, text: `${product.name} ${product.category || ''} ${product.sku || ''} ${product.barcode || ''}`.toLocaleLowerCase('id') }));
}

export function matchingProducts(index, query) {
  const text = query.trim().toLocaleLowerCase('id');
  return text ? index.filter(entry => entry.text.includes(text)).map(entry => entry.product) : [];
}

export function mountPosSearch({ root, products, escapeHtml: e, price, onSelect }) {
  const input = root.querySelector('#product-search');
  const shell = input.closest('.pos-search-shell');
  const popover = shell.querySelector('#search-popover');
  const list = shell.querySelector('#pos-search-results');
  const status = shell.querySelector('[data-search-status]');
  const index = productSearchIndex(products), listeners = new AbortController();
  let rows = [], active = -1, frame;
  const listen = (target, name, handler, options = {}) => target.addEventListener(name, handler, { ...options, signal: listeners.signal });
  const close = () => {
    shell.classList.remove('is-open');
    popover.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const size = () => {
    if (!input.isConnected) return;
    const viewport = window.visualViewport;
    const bottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight);
    shell.style.setProperty('--pos-results-space', `${Math.max(0, bottom - shell.getBoundingClientRect().bottom - 14)}px`);
  };
  const scheduleSize = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(size); };
  const highlight = (next, scroll = false) => {
    active = next;
    rows.forEach((row, i) => {
      row.classList.toggle('keyboard-active', i === active);
      row.setAttribute('aria-selected', String(i === active));
    });
    if (rows[active]) {
      input.setAttribute('aria-activedescendant', rows[active].id);
      if (scroll) rows[active].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };
  const refresh = () => {
    if (!input.value.trim()) { rows = []; active = -1; list.replaceChildren(); status.textContent = ''; close(); return; }
    const matches = matchingProducts(index, input.value);
    list.innerHTML = matches.map((product, i) => `<button type="button" role="option" aria-selected="false" tabindex="-1" id="pos-search-option-${i}" class="search-result" data-search-product="${e(product.id)}" title="${e(product.name)} · ${e(product.category || '')}"><strong class="pos-search-name">${e(product.name)}</strong><span class="pos-search-price"><b>${e(price(product))}</b><small>${e(product.unitLabel || '')}</small></span></button>`).join('') || '<div class="search-empty">Produk tidak ditemukan</div>';
    rows = [...list.querySelectorAll('[data-search-product]')];
    active = -1;
    input.removeAttribute('aria-activedescendant');
    list.scrollTop = 0;
    status.textContent = `${matches.length} produk ditemukan`;
    shell.classList.add('is-open');
    popover.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    size();
  };
  listen(input, 'focus', refresh);
  listen(input, 'input', refresh);
  listen(input, 'keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); input.blur(); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      if (popover.hidden) refresh();
      if (!rows.length) return;
      const next = active < 0 ? event.key === 'ArrowDown' ? 0 : rows.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      highlight(next, true);
    }
    if (event.key === 'Enter' && !popover.hidden && rows.length) {
      event.preventDefault();
      const id = rows[Math.max(0, active)].dataset.searchProduct;
      close(); onSelect(id);
    }
  });
  listen(list, 'click', event => { const row = event.target.closest('[data-search-product]'); if (row) { close(); onSelect(row.dataset.searchProduct); } });
  listen(list, 'pointermove', event => { const row = event.target.closest('[data-search-product]'); if (row) { const next = rows.indexOf(row); if (next !== active) highlight(next); } });
  listen(document, 'pointerdown', event => { if (!shell.contains(event.target)) close(); });
  listen(document, 'focusin', event => { if (!shell.contains(event.target)) close(); });
  listen(document, 'keydown', event => {
    if (input.isConnected && !document.querySelector('dialog[open]') && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault(); input.focus();
    }
  });
  listen(window, 'resize', scheduleSize);
  listen(window, 'scroll', scheduleSize, { capture: true, passive: true });
  if (window.visualViewport) {
    listen(window.visualViewport, 'resize', scheduleSize);
    listen(window.visualViewport, 'scroll', scheduleSize);
  }
  shell.querySelector('kbd').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  return () => { listeners.abort(); cancelAnimationFrame(frame); close(); };
}
