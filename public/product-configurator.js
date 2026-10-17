// Shared product dialog components. Pricing and each product's controls stay with their existing handlers.
export const configurationBadge = number => `<span class="config-step" aria-hidden="true">${number}</span>`;

export function configurationSection(number, title, content, {className='', action=''} = {}) {
  return `<section class="config-section ${className}"><div class="config-section-heading"><h3>${configurationBadge(number)}<span>${title}</span></h3>${action}</div><div class="config-section-content">${content}</div></section>`;
}

export function configurationFinishing(number, content, available = true) {
  return configurationSection(number, 'FINISHING', `<div class="finishing-dropdowns" id="finishing-grid">${content}</div>`, {
    className:'config-finishing', action:available?'<button id="add-finishing" type="button" class="text-button">+ Tambah Finishing</button>':''
  });
}

export const configurationDesign = (number, content) => `<div class="config-design">${configurationBadge(number)}${content}</div>`;
export const configurationNotes = () => '<label class="config-production-note"><textarea id="production-note" rows="1" aria-label="Catatan produksi (opsional)" placeholder="Catatan produksi (opsional)"></textarea></label>';
export const configurationActions = () => '<div class="item-action-bar"><div class="price-preview"><div><span>Estimasi Harga</span><p id="formula-text">—</p><strong id="item-price">Rp0</strong></div></div><button id="add-item" class="primary" type="button">+ Tambah ke Pesanan</button></div>';

export function bindConfigurationNotes(scope) {
  const input = scope.querySelector('.config-production-note textarea');
  if (!input) return;
  const resize = () => { input.style.height = '0px'; input.style.height = `${Math.max(40, input.scrollHeight + 2)}px`; };
  input.addEventListener('input', resize);
  let width = -1;
  const observer = new ResizeObserver(([entry]) => {
    if (!input.isConnected) return observer.disconnect();
    if (entry.contentRect.width !== width) { width = entry.contentRect.width; resize(); }
  });
  observer.observe(input.parentElement);
  resize();
  return () => observer.disconnect();
}
