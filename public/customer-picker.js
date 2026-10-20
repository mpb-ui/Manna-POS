// A compact, anchored dialog keeps the search above the sticky checkout footer.
export function customerPickerPopup(anchor, html) {
  const dialog = document.createElement('dialog');
  dialog.className = 'customer-dialog customer-search-popup';
  dialog.setAttribute('aria-label', 'Cari Pelanggan');
  dialog.innerHTML = html;
  document.body.append(dialog);
  const listeners = new AbortController();
  const position = () => {
    if (!anchor.isConnected) return dialog.close();
    const rect = anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    const popupWidth = Math.min(rect.width, width - 24);
    const below = top + height - rect.top - 12;
    const above = rect.bottom - top - 12;
    const upwards = below < 220 && above > below;
    const available = Math.max(0, upwards ? above : below);
    dialog.style.width = `${popupWidth}px`;
    dialog.style.maxHeight = `${Math.max(0, Math.min(390, available, height - 24))}px`;
    dialog.style.left = `${Math.max(left + 12, Math.min(rect.left, left + width - popupWidth - 12))}px`;
    const popupHeight = dialog.getBoundingClientRect().height;
    const desiredTop = upwards ? rect.bottom - popupHeight : rect.top;
    dialog.style.top = `${Math.max(top + 12, Math.min(desiredTop, top + height - popupHeight - 12))}px`;
  };
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.querySelector('[data-close-picker]').onclick = () => dialog.close();
  const resize = new ResizeObserver(position);
  resize.observe(dialog);
  dialog.addEventListener('close', () => { listeners.abort(); resize.disconnect(); dialog.remove(); }, { once: true });
  window.addEventListener('resize', position, { signal: listeners.signal });
  window.addEventListener('scroll', position, { signal: listeners.signal, capture: true });
  window.visualViewport?.addEventListener('resize', position, { signal: listeners.signal });
  window.visualViewport?.addEventListener('scroll', position, { signal: listeners.signal });
  dialog.showModal();
  position();
  return dialog;
}
