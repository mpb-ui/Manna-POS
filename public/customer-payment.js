import { customerPhone, customerNameKey } from './customer-identity.js';

export function paymentDepositAmounts({ total, paid = 0, balance = 0, use = true, planned, received = 0, withholding = 0, po = false }) {
  const outstanding = Math.max(0, total - paid);
  const netOutstanding = outstanding - (po ? 0 : Math.max(0, Math.min(outstanding, withholding)));
  const available = Math.max(0, Math.min(balance, netOutstanding, planned ?? balance));
  const used = !po && use ? available : 0;
  const due = netOutstanding - used;
  return { outstanding, available, used, due, remaining: Math.max(0, due - (po ? 0 : received)), excess: po ? 0 : Math.max(0, received - due) };
}

export function halfPaymentAmount(total, paid, used, due) {
  return Math.max(0, Math.min(due, Math.round(total * .5) - Number(paid || 0) - used));
}

export async function mountCustomerPayment({ form, order, initial, api, can, uid, modal, e, money, parseMoney }) {
  const identity = uid(), amount = form.elements.amount, ownerDialog = form.closest('dialog');
  const methods = [...form.querySelectorAll('[name=method]')];
  const useDeposit = form.querySelector('[data-payment-use]');
  const depositOption = form.querySelector('[data-payment-deposit]');
  const depositUsed = form.querySelector('[data-payment-deposit-used]');
  const depositBadge = ownerDialog.querySelector('[data-payment-deposit-badge]');
  const depositBalance = depositBadge.querySelector('strong');
  const depositCovered = form.querySelector('[data-payment-deposit-covered]');
  const balanceAfter = form.querySelector('[data-payment-deposit-after]');
  const excessNotice = form.querySelector('[data-payment-excess]');
  const excessLabel = form.querySelector('[data-payment-excess-label]');
  const excessAmount = form.querySelector('[data-payment-excess-amount]');
  const dueLabel = form.querySelector('[data-payment-due-label]');
  const dueTotal = form.querySelector('[data-payment-due]');
  const remaining = ownerDialog.querySelector('[data-payment-remaining]');
  const status = ownerDialog.querySelector('[data-payment-status]');
  const customerRequestId = crypto.randomUUID();
  let customer = null, use = initial.depositAmount !== 0, dirtyAmount = false, halfAmount = false;
  const valid = () => uid() === identity && form.isConnected && ownerDialog.open;
  const isPo = () => form.querySelector('[name=type]:checked')?.value === 'PO';
  const excessAction = () => ({ TUNAI: 'CHANGE', QRIS: 'DEPOSIT', TRANSFER: 'DEPOSIT' })[form.elements.method.value];
  const balance = () => can('deposit.use') ? customer?.depositBalance || 0 : 0;
  const figures = () => paymentDepositAmounts({ total: order.total, paid: order.paidAmount, balance: balance(), use, planned: initial.depositAmount || undefined, received: parseMoney(amount.value), withholding: parseMoney(form.elements.taxWithheld?.value), po: isPo() });
  const formatAmount = value => value.toLocaleString('id-ID');
  const setAmount = value => { amount.value = formatAmount(value); };

  function sync() {
    const n = figures();
    const po = isPo();
    const action = excessAction();
    const depositExcess = n.excess > 0 && action === 'DEPOSIT';
    const chooseMethod = n.excess > 0 && !action;
    const partiallyPaid = n.remaining < n.outstanding || Number(order.paidAmount) > 0;
    depositOption.hidden = po || !n.available;
    depositBadge.hidden = po || !balance();
    useDeposit.checked = use;
    depositBalance.textContent = money(balance());
    depositUsed.textContent = n.used ? formatAmount(-n.used) : '—';
    depositCovered.hidden = !n.used || n.due > 0;
    excessLabel.textContent = action === 'DEPOSIT' ? 'Lebih Bayar' : 'Kembali';
    excessAmount.textContent = chooseMethod ? '—' : formatAmount(n.excess);
    excessNotice.hidden = !depositExcess;
    excessNotice.textContent = depositExcess ? `Kelebihan Pembayaran ${money(n.excess)}` : '';
    balanceAfter.hidden = !n.used || depositExcess;
    balanceAfter.querySelector('strong').textContent = money(balance() - n.used);
    dueLabel.textContent = po ? 'Sisa Tagihan PO' : 'Perlu Dibayar';
    dueTotal.textContent = formatAmount(n.due);
    methods.forEach(method => { method.required = !po && parseMoney(amount.value) > 0; });
    remaining.textContent = money(n.remaining);
    status.textContent = po ? 'PO / Tempo' : depositExcess ? 'Lebih Bayar' : chooseMethod ? 'Pilih Metode' :
      n.remaining ? (partiallyPaid ? 'Bayar Sebagian' : 'Belum Lunas') : 'Lunas';
    status.dataset.state = po ? 'po' : depositExcess || chooseMethod || n.remaining ? 'pending' : 'paid';
  }
  function draw() {
    if (!dirtyAmount) setAmount(figures().due);
    sync();
  }
  useDeposit.addEventListener('change', event => {
    use = event.target.checked;
    const { used, due } = figures();
    if (halfAmount) setAmount(halfPaymentAmount(order.total, order.paidAmount, used, due));
    else { dirtyAmount = false; setAmount(due); }
    sync();
  });
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
    async confirm() {
      if (!valid()) return null;
      const n = figures();
      const values = { customerId: customer?.id || order.customerId || null, depositAmount: n.used, confirmDeposit: false };
      if (!n.excess) return values;
      const action = excessAction();
      if (!action) throw new Error('Metode pembayaran wajib dipilih');
      Object.assign(values, { excessAction: action, expectedExcess: n.excess });
      if (action === 'CHANGE') return values;
      if (!can('customers.view')) throw new Error('Akses pelanggan diperlukan untuk menyimpan kelebihan pembayaran');
      const accepted = await new Promise(resolve => {
        let yes = false;
        const d = modal(`Kelebihan Pembayaran ${money(n.excess)}`, `<p class="deposit-confirm-question">Simpan sebagai deposit?</p><p class="deposit-confirm-customer">${e(customer?.name || order.customerName)} · ${e(customer?.phone || order.phone)}</p><div class="deposit-confirm-actions"><button type="button" class="secondary" data-check-payment>Cek Kembali</button><button type="button" class="primary" data-confirm-excess>Simpan ke Deposit</button></div>`);
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
