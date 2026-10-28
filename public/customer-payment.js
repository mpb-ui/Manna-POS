import { customerPhone, customerNameKey } from './customer-identity.js';

export function paymentDepositAmounts({ total, paid = 0, balance = 0, use = true, planned, received = 0, po = false }) {
  const outstanding = Math.max(0, total - paid);
  const available = Math.max(0, Math.min(balance, outstanding, planned ?? balance));
  const used = !po && use ? available : 0;
  const due = outstanding - used;
  return { outstanding, available, used, due, remaining: Math.max(0, due - (po ? 0 : received)), excess: po ? 0 : Math.max(0, received - due) };
}

export function halfPaymentAmount(total, paid, used, due) {
  return Math.max(0, Math.min(due, Math.round(total * .5) - Number(paid || 0) - used));
}

export async function mountCustomerPayment({ form, order, initial, api, can, uid, modal, e, money, parseMoney }) {
  const identity = uid(), amount = form.elements.amount, ownerDialog = form.closest('dialog');
  const methods = [...form.querySelectorAll('[name=method]')];
  const customerRequestId = crypto.randomUUID();
  let customer = null, use = initial.depositAmount !== 0, dirtyAmount = false, halfAmount = false;
  const valid = () => uid() === identity && form.isConnected && (!ownerDialog || ownerDialog.open);
  const isPo = () => form.querySelector('[name=type]:checked')?.value === 'PO';
  const figures = () => paymentDepositAmounts({ total: order.total, paid: order.paidAmount, balance: can('deposit.use') ? customer?.depositBalance || 0 : 0, use, planned: initial.depositAmount || undefined, received: parseMoney(amount.value), po: isPo() });
  const setAmount = value => { amount.value = String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); };
  const slot = document.createElement('section');
  slot.className = 'payment-deposit-summary';
  slot.hidden = true;
  form.before(slot);

  function sync() {
    const n = figures(), po = isPo();
    slot.hidden = po || !n.available;
    slot.querySelector('[data-total-due]')?.replaceChildren(document.createTextNode(money(n.due)));
    methods.forEach(method => { method.required = !po && parseMoney(amount.value) > 0; });
    const remaining = form.querySelector('.payment-balance strong');
    if (remaining) remaining.textContent = `Sisa tagihan: ${money(n.remaining)}`;
  }
  function draw() {
    const n = figures();
    slot.innerHTML = n.available ? `<div class="payment-deposit-option"><label class="deposit-check"><input type="checkbox" data-payment-use ${use ? 'checked' : ''}> Gunakan deposit</label><strong>${money(n.available)}</strong></div><div class="payment-total-due"><span>Tagihan setelah deposit</span><strong data-total-due>${money(n.due)}</strong></div>` : '';
    slot.querySelector('[data-payment-use]')?.addEventListener('change', event => { use = event.target.checked; if (halfAmount) setAmount(halfPaymentAmount(order.total,order.paidAmount,figures().used,figures().due)); else { dirtyAmount = false; setAmount(figures().due); } sync(); });
    if (!dirtyAmount) setAmount(n.due);
    sync();
  }
  amount.addEventListener('input', () => { dirtyAmount = true; halfAmount = false; sync(); });
  form.addEventListener('payment:totalchange', () => { if (halfAmount) setAmount(halfPaymentAmount(order.total,order.paidAmount,figures().used,figures().due)); draw(); });
  form.addEventListener('change', sync);
  form.querySelector('#payment-half')?.addEventListener('click', () => { dirtyAmount = true; halfAmount = true; setAmount(halfPaymentAmount(order.total,order.paidAmount,figures().used,figures().due)); sync(); });
  form.querySelector('#payment-dp')?.addEventListener('change', event => { if (!event.target.checked) { halfAmount = false; dirtyAmount = false; setAmount(figures().due); sync(); } });
  draw();

  if (order.customerId && can('customers.view')) {
    // Failure must block payment, rather than silently charging the full invoice.
    const data = await api(`/api/customers/${order.customerId}/balance`);
    if (valid()) { customer = data.customer; draw(); }
  }

  async function customerForCredit() {
    if (customer) return customer;
    if (!can('customers.view')) throw new Error('Akses pelanggan diperlukan untuk menyimpan deposit');
    // An unlinked invoice may use a shared phone: match BOTH name and phone.
    for (let page = 1; ; page++) {
      const data = await api('/api/customers?' + new URLSearchParams({ q: customerPhone(order.phone), pageSize: 100, page }));
      if (!valid()) return null;
      const match = data.rows.find(c => customerPhone(c.phone) === customerPhone(order.phone) && customerNameKey(c.name) === customerNameKey(order.customerName));
      if (match) return match;
      if (page >= data.pages) break;
    }
    if (!can('customers.create')) throw new Error('Hubungkan nota dengan akun pelanggan sebelum menyimpan deposit');
    const create = () => api('/api/customers', { method: 'POST', body: JSON.stringify({ name: order.customerName, phone: order.phone, requestId: customerRequestId }) });
    try { return await create(); }
    catch (error) {
      // Another cashier may have created this same account in the meantime.
      const data = await api('/api/customers?' + new URLSearchParams({ q: order.customerName, pageSize: 100 }));
      const match = data.rows.find(c => customerPhone(c.phone) === customerPhone(order.phone) && customerNameKey(c.name) === customerNameKey(order.customerName));
      if (match) return match;
      throw error;
    }
  }

  return {
    values: () => ({ customerId: customer?.id || order.customerId || null, depositAmount: figures().used, excessAction: 'DEPOSIT', confirmDeposit: false }),
    async confirm() {
      if (!valid()) return null;
      const n = figures();
      const values = this.values();
      if (!n.excess) return values;
      if (!can('customers.view')) throw new Error('Akses pelanggan diperlukan untuk menyimpan kelebihan pembayaran');
      const accepted = await new Promise(resolve => {
        let yes = false;
        const d = modal(`Kelebihan Pembayaran ${money(n.excess)}`, `<p class="deposit-confirm-question">Simpan sebagai deposit?</p><p class="deposit-confirm-customer">${e(customer?.name || order.customerName)} · ${e(customer?.phone || order.phone)}</p><div class="deposit-confirm-actions"><button type="button" class="secondary" data-check-payment>Cek Kembali</button><button type="button" class="primary" data-confirm-excess>Ya, Lanjutkan</button></div>`);
        d.classList.add('deposit-confirm-dialog');
        d.setAttribute('aria-label', 'Konfirmasi kelebihan pembayaran');
        d.querySelector('[data-check-payment]').onclick = () => d.close();
        d.querySelector('[data-confirm-excess]').onclick = () => { yes = true; d.close(); };
        d.addEventListener('close', () => resolve(yes), { once: true });
        d.querySelector('[data-check-payment]').focus();
      });
      if (!accepted || !valid()) return null;
      const account = await customerForCredit();
      if (!account || !valid()) return null;
      if (!customer) { customer = account; use = false; draw(); }
      return { ...values, customerId: account.id, confirmDeposit: true };
    }
  };
}
