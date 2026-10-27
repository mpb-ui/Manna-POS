const key = (color, size) => `${color}:${size}`;
const amount = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const identity = row => row?.materialId || key(row?.color, row?.size);

// Availability from the server already excludes confirmed production orders.
// The local cart is pending, so subtract it here without reserving/deducting it.
export function remainingShirtStock(stock, cart, productId) {
  const byVariant = new Map(stock.map(row => [key(row.color, row.size), row]));
  const used = new Map();
  for (const line of cart) {
    if (line.productId !== productId) continue;
    for (const variant of line.shirtVariants || []) {
      const id = identity(byVariant.get(key(variant.color, variant.size)) || variant);
      used.set(id, (used.get(id) || 0) + amount(variant.quantity));
    }
  }
  return stock.map(row => ({ ...row, available: Math.max(0, amount(row.available) - (used.get(identity(row)) || 0)) }));
}

export function validateShirtSelection(variants, stock) {
  const byVariant = new Map(stock.map(row => [key(row.color, row.size), row]));
  const ids = variants.map(v => identity(byVariant.get(key(v.color, v.size)) || v));
  const counts = new Map(); ids.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
  const rows = variants.map((variant, index) => {
    const available = amount(byVariant.get(key(variant.color, variant.size))?.available);
    const label = `${variant.color} ${variant.size}`;
    let error = '', kind = '';
    if (!Number.isSafeInteger(variant.quantity) || variant.quantity < 1) { error = 'Jumlah kaos harus bilangan bulat positif.'; kind = 'quantity'; }
    else if (!available) { error = `Stok ${label} habis (0 pcs). Pilih warna atau ukuran lain.`; kind = 'empty'; }
    else if (counts.get(ids[index]) > 1) { error = `Kombinasi ${label} memakai stok yang sama dengan baris lain. Gabungkan jumlahnya.`; kind = 'duplicate'; }
    else if (variant.quantity > available) { error = `Stok ${label} tidak cukup: tersedia ${available} pcs, diminta ${variant.quantity} pcs.`; kind = 'quantity'; }
    return { available, error, kind };
  });
  const message = !variants.length ? 'Isi minimal satu kombinasi kaos.' : rows.find(row => row.error)?.error || '';
  return { valid: !message, message, rows };
}

export function bindShirtStockSelection({ scope, productId, getStock, setStock, getCart, readLine, api, onAdd, toast, minimum = 1 }) {
  const rowsElement = scope.querySelector('#dtf-shirt-rows');
  const button = scope.querySelector('#add-item');
  const feedback = scope.querySelector('[data-dtf-stock-feedback]');
  const messageElement = scope.querySelector('[data-dtf-stock-message]');
  const retry = scope.querySelector('[data-dtf-stock-retry]');
  let loading = false, saving = false, failed = '', pending = null;
  const active = () => scope.contains(rowsElement) && scope.querySelector('#add-item') === button;
  const remaining = () => remainingShirtStock(getStock(), getCart(), productId);

  function sync() {
    if (!active()) return;
    const stock = remaining(), variants = readLine().shirtVariants;
    const result = validateShirtSelection(variants, stock);
    if(!result.message && variants.reduce((sum,v)=>sum+v.quantity,0)<minimum){result.valid=false;result.message=`Minimum pembelian ${minimum} pcs`;}
    rowsElement.querySelectorAll('[data-shirt-row]').forEach((row, index) => {
      const color = row.querySelector('[data-shirt-color]');
      const size = row.querySelector('[data-shirt-size]');
      const quantity = row.querySelector('[data-shirt-quantity]');
      const note = row.querySelector('[data-shirt-stock]');
      if (!note.id) note.id = `dtf-stock-note-${crypto.randomUUID()}`;
      for (const option of size.options) {
        option.textContent = option.value;
      }
      const validation = result.rows[index];
      note.textContent = validation.error || `Tersedia ${validation.available} pcs`;
      note.classList.toggle('stock-error', Boolean(validation.error));
      row.classList.toggle('dtf-stock-error', Boolean(validation.error));
      quantity.max = String(validation.available);
      for (const input of [color, size, quantity]) input.setAttribute('aria-describedby', note.id);
      quantity.setAttribute('aria-invalid', String(validation.kind === 'quantity'));
      size.setAttribute('aria-invalid', String(['empty','duplicate'].includes(validation.kind)));
    });
    const error = failed || result.message;
    messageElement.textContent = loading ? 'Memeriksa stok kaos…' : error ? 'Periksa pilihan dan jumlah kaos sebelum menambahkan.' : '';
    if (failed && !loading) messageElement.textContent = failed;
    feedback.hidden = !loading && !error;
    feedback.classList.toggle('stock-error', Boolean(error) && !loading);
    retry.hidden = !error || loading;
    button.disabled = loading || saving || Boolean(error);
    button.setAttribute('aria-busy', String(loading || saving));
    button.setAttribute('aria-describedby', 'dtf-stock-feedback-message');
    return result;
  }

  async function refresh() {
    if (pending) return pending;
    loading = true; failed = ''; sync();
    pending = (async () => {
      try {
        const data = await api('/api/pos/shirt-stock', { signal: AbortSignal.timeout(8000) });
        if (!active()) return false;
        if (!Array.isArray(data.shirtStock)) throw new Error('Data stok kaos belum tersedia');
        setStock(data.shirtStock);
        return true;
      } catch (error) {
        if (active()) failed = ['TimeoutError','AbortError'].includes(error.name) ? 'Pemeriksaan stok kaos terlalu lama. Coba cek ulang.' : `Stok kaos belum dapat diperiksa. ${error.message}`;
        return false;
      } finally { loading = false; pending = null; sync(); }
    })();
    return pending;
  }

  button.onclick = async () => {
    if (loading || saving || !sync()?.valid || failed) return;
    saving = true; sync();
    try {
      if (!await refresh() || !active()) return;
      const result = sync();
      if (!result.valid) return toast(result.message, 'error');
      await onAdd(readLine());
    } finally { saving = false; sync(); }
  };
  retry.onclick = refresh;
  refresh();
  return { sync };
}
