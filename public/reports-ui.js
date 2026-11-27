import {goodsReturnReportHtml} from './goods-returns-ui.js';
import { bindCalendarPicker } from './calendar-picker.js';
import { itemQuantityLabel } from './item-workflow.js';
import { witaDay } from './order-rules.js';

const compactDay = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
const compactDate = day => compactDay.format(new Date(`${day}T00:00:00Z`));
const witaDate = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Makassar' });
const witaTime = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Makassar' });
const isRankingTab = tab => ['categories', 'products', 'machines'].includes(tab);
function shiftDay(day, offset) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function createReportsUI(c) {
  const {root,api,escapeHtml:e,money,toast}=c;
  let generation=0,report=null,tab='sales',sort={key:'date',direction:-1},page=1;
  let filters={from:'',to:'',paymentStatus:'',paymentMethod:''};
  let openingOrder = null;
  let selected = null;
  const pageSize=25;
  const tabs=[['sales','Penjualan'],['payments','Mutasi Kas'],['categories','Kategori'],['products','Produk'],['machines','Mesin']];
  const title=()=>[...tabs,['receivables','Piutang'],['returns','Retur Barang'],['po','Dokumen PO']].find(t=>t[0]===tab)?.[1] || 'Penjualan';
  const date=value=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Makassar'}).format(new Date(value));
  const day = value => witaDate.format(new Date(`${value}T00:00:00+08:00`));
  const method=value=>({TUNAI:'Tunai',TRANSFER:'Transfer',DEPOSIT:'Deposit',QRIS:'QRIS'}[value] || value || '-');
  const kind=r=>r.paid<0?'Refund':r.kind==='TOPUP' || r.paymentType==='TOPUP'?'Top up deposit':r.kind==='DP' || r.paymentType==='DP'?'Pembayaran DP':'Pembayaran';
  const selectedRows=()=>tab==='sales'?report.rows:tab==='payments'?report.receipts:tab==='receivables'?report.receivables:tab==='returns'?report.goodsReturns.rows:tab==='po'?report.purchaseOrders:report[tab] || [];
  const rows=()=>[...selectedRows()].sort((a,b)=>{const x=a[sort.key],y=b[sort.key];return (typeof x==='number'?x-y:String(x??'').localeCompare(String(y??''),'id',{numeric:true}))*sort.direction;});
  const link = (id, code) => id && code && c.canOpenOrder() ? `<button type="button" class="report-invoice" aria-controls="report-order-panel" aria-pressed="false" data-report-order="${e(id)}">${e(code)}</button>` : e(code);
  const qty=r=>(r.quantities || [{quantity:r.quantity,unit:r.unit || 'pcs'}]).map(q=>`${Number(q.quantity).toLocaleString('id-ID',{maximumFractionDigits:3})} ${e(q.unit)}`).join(' · ');
  const headers=()=>tab==='sales'?['Tanggal','Invoice','Pelanggan',...(report.capabilities.money?['Total','Piutang','Pembayaran','Metode']:['Produk'])]:tab==='payments'?['Tanggal pembayaran','Invoice','Pelanggan','Jenis','Metode','Uang masuk','Uang keluar']:tab==='receivables'?['Tanggal invoice','Invoice','Pelanggan','Total','Dibayar','Piutang']:tab==='po'?['Tanggal PO','Invoice','Pelanggan','Nomor PO']:['#',tab==='categories'?'Kategori':tab==='products'?'Produk':'Mesin','Invoice','Jumlah terjual',...(report.capabilities.money?['Penjualan']:[])];

  function salesCells(row, invoice, interactive) {
    const at = new Date(row.date);
    const dateHtml = interactive ? `${e(witaDate.format(at))}<small class="report-row-time">${e(witaTime.format(at).replace('.', ':'))}</small>` : e(date(row.date));
    const note = row.kind === 'CANCELLATION' ? 'Koreksi pembatalan' : row.kind === 'DISCOUNT' ? 'Diskon invoice' : row.cancelled ? 'Dibatalkan' : '';
    const values = [dateHtml, `${invoice}${row.hasTax ? '<span class="report-tax-badge">Pajak</span>' : ''}${note ? `<small class="report-correction">${note}</small>` : ''}`, e(row.customer)];
    if (!report.capabilities.money) return [...values, e(row.products)];
    const paid = row.paymentStatus === 'LUNAS';
    const paymentMethod = e(row.methods.map(method).join(' + ') || (row.poNumbers?.length ? 'PO' : '-'));
    const remove = interactive && report.capabilities.delete && row.kind === 'SALE' && !row.cancelled
      ? `<button type="button" class="report-delete" data-report-delete="${e(row.id)}" aria-label="Hapus transaksi ${e(row.code)}" title="Hapus Transaksi">⋯</button>` : '';
    return [...values, money(row.sales), money(row.outstanding), paid ? 'Lunas' : '<span class="payment-unpaid">Belum Lunas</span>',
      remove ? `<div class="report-method-cell"><span>${paymentMethod}</span>${remove}</div>` : paymentMethod];
  }

  const cells=(r,index,interactive=true)=>{
    const inv=(id,code)=>interactive?link(id,code):e(code);
    if(tab==='sales')return salesCells(r, inv(r.id,r.code), interactive);
    if(tab==='payments')return [date(r.date),inv(r.orderId,r.code),e(r.customer),e(kind(r)),e(method(r.method)),r.paid>=0?money(r.paid):'-',r.paid<0?money(-r.paid):'-'];
    if(tab==='receivables')return [date(r.date),inv(r.id,r.code),e(r.customer),money(r.sales),money(r.paid),money(r.outstanding)];
    if(tab==='po')return [date(r.createdAt),inv(r.orderId,r.code),e(r.customer),e(r.poNumber)];
    return [index+1,e(r.label),Number(r.orders || 0).toLocaleString('id-ID'),qty(r),...(report.capabilities.money?[money(r.sales)]:[])];
  };
  const scopeNote=()=>report.range.locked?'Akses dibatasi pada data hari ini.':report.range.scope==='own'?'Hanya transaksi yang dibuat atau ditugaskan kepada Anda.':'';
  function table(data, offset = 0, interactive = true) {
    const columns = headers();
    const sales = tab === 'sales' && report.capabilities.money;
    const body = data.map((row, index) => {
      const orderId = interactive && row.code && c.canOpenOrder() && (tab === 'sales' || tab === 'receivables' ? row.id : row.orderId);
      const key = row.eventId || row.id || `${row.orderId}:${row.poNumber}:${row.createdAt}`;
      return `<tr${orderId ? ` data-report-order-row="${e(orderId)}" data-report-select-row="${e(key)}"` : ''}>${cells(row, offset + index, interactive).map(cell => `<td>${cell}</td>`).join('')}</tr>`;
    }).join('');
    return `<div class="table-wrap report-table-wrap"><table class="report-table${sales ? ' report-sales-table' : ''}" aria-label="${e(title())}"${interactive ? ' aria-describedby="report-table-note"' : ''}>
      ${sales ? '<colgroup><col><col><col><col><col><col><col></colgroup>' : ''}
      <thead><tr>${columns.map(label => `<th scope="col"${label === 'Piutang' && sales ? ' class="report-receivable-heading"' : ''}>${label}</th>`).join('')}</tr></thead>
      <tbody>${body || `<tr><td colspan="${columns.length}" class="report-empty">Belum ada data untuk filter ini.</td></tr>`}</tbody>
    </table></div>`;
  }
  async function mount() {if(!filters.from){const t=witaDay();filters.from=t.slice(0,7)+'-01';filters.to=t;}await refresh();}
  function reportQuery(targetTab) {
    return isRankingTab(targetTab) ? {from:filters.from, to:filters.to} : filters;
  }

  async function refresh(targetTab = tab) {
    const token = ++generation, identity = c.identity();
    const active = () => token === generation && identity === c.identity() && c.isActive();
    const query = new URLSearchParams(Object.entries(reportQuery(targetTab)).filter(([,value]) => value));
    root.setAttribute('aria-busy', 'true');
    if (!report) root.innerHTML = '<div class="report-page report-foundation"><header class="page-toolbar"><h1>Laporan</h1></header><div class="report-body"><p>Memuat laporan…</p></div></div>';
    try {
      const next = await api('/api/reports?' + query);
      if (!active()) return;
      const changedTab = targetTab !== tab;
      report = next;
      filters = {...filters, from:next.range.from, to:next.range.to};
      if (changedTab) activateTab(targetTab);
      selected = null;
      page = 1;
      draw();
      if (changedTab) focusTab();
    } catch (error) {
      if (!active()) return;
      toast(error.message, 'error');
      if (report) {
        filters = {...filters, from:report.range.from, to:report.range.to};
        if (!isRankingTab(tab)) {
          filters.paymentStatus = report.paymentStatus;
          filters.paymentMethod = report.paymentMethod;
        }
        draw();
      } else {
        root.innerHTML = '<div class="category-empty"><strong>Laporan tidak dapat dimuat</strong><button class="secondary" data-report-retry>Coba lagi</button></div>';
        root.querySelector('[data-report-retry]').onclick = () => refresh();
      }
    } finally {
      if (token === generation) root.removeAttribute('aria-busy');
    }
  }
  function metricsHtml() {
    const { sales, paid, orders } = report.summary;
    const metric = (className, label, value, currency) => {
      const prefix = value < 0 ? '−Rp' : 'Rp';
      const amount = Math.abs(Number(value)).toLocaleString('id-ID', { maximumFractionDigits: 0 });
      return `<div class="report-summary-card ${className}"><span>${label}</span><strong>${currency ? `<small>${prefix}</small> ` : ''}${amount}</strong></div>`;
    };
    return `<section class="report-summary-line" aria-label="Ringkasan laporan">
      ${report.capabilities.money ? metric('report-summary-card-sales', 'Omzet', sales, true) + metric('report-summary-card-paid', 'Uang Masuk', paid, true) : ''}
      ${metric('report-summary-card-orders', 'Transaksi', orders, false)}
    </section>`;
  }

  function navigationHtml() {
    const { money: showMoney, export: canExport, print: canPrint } = report.capabilities;
    const other = [...(showMoney ? [['receivables', 'Piutang'], ['po', 'Dokumen PO']] : []),
      ['returns', 'Retur Barang'], ...(c.canAssets() ? [['assets', 'Aset & Penyusutan']] : [])];
    return `<div class="report-navigation">
      <div class="report-main-tabs" role="tablist" aria-label="Laporan">
        ${tabs.filter(([id]) => id !== 'payments' || showMoney).map(([id, label]) => `<button type="button" role="tab" aria-selected="${tab === id}" data-report-tab="${id}">${label}</button>`).join('')}
      </div>
      <div class="report-secondary-actions">
        <select id="report-other" aria-label="Laporan lain"><option value="">Laporan Lain</option>
          ${other.map(([id, label]) => `<option value="${id}" ${tab === id ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        ${canExport ? '<button type="button" class="secondary" id="report-export">Download CSV</button>' : ''}
        ${canPrint ? '<button type="button" class="secondary" id="report-print">Print</button>' : ''}
      </div>
    </div>`;
  }

  function filtersHtml() {
    const ranking = isRankingTab(tab);
    const payment = report.capabilities.money && !ranking ? `
      <select id="report-payment" aria-label="Status pembayaran">
        <option value="">Status pembayaran</option>
        <option value="BELUM_LUNAS" ${filters.paymentStatus === 'BELUM_LUNAS' ? 'selected' : ''}>Belum Lunas</option>
        <option value="LUNAS" ${filters.paymentStatus === 'LUNAS' ? 'selected' : ''}>Lunas</option>
      </select>
      <select id="report-method" aria-label="Metode Pembayaran">
        <option value="">Metode Pembayaran</option>
        ${['TUNAI','QRIS','TRANSFER','DEPOSIT'].map(key => `<option value="${key}" ${filters.paymentMethod === key ? 'selected' : ''}>${method(key)}</option>`).join('')}
      </select>` : '';
    const sortOptions = [
      ...(report.capabilities.money ? [['sales', 'Penjualan tertinggi']] : []),
      ['orders', 'Invoice terbanyak'], ...(tab === 'products' ? [['quantity', 'Jumlah terjual']] : []), ['label', 'Nama A–Z']
    ];
    const sortControl = ranking ? `<select id="report-ranking-sort" aria-label="Urutkan ranking">
      ${sortOptions.map(([key, label]) => `<option value="${key}" ${sort.key === key ? 'selected' : ''}>${label}</option>`).join('')}
    </select>` : '';
    return payment || sortControl ? `<div class="report-payment-filters">${payment}${sortControl}</div>` : '';
  }

  function tableNote() {
    if (tab === 'payments') return 'Setiap penerimaan dan refund adalah satu baris. Penggunaan deposit tidak dihitung sebagai uang masuk baru. Transaksi deposit tanpa invoice hanya tampil pada Semua pembayaran.';
    if (tab === 'receivables') return 'Piutang seluruh invoice sampai akhir periode; pembayaran setelah tanggal akhir belum mengurangi piutang di sini.';
    if (tab === 'returns') return 'Retur penggantian barang memotong stok tanpa menambah omzet atau uang masuk.';
    if (tab === 'po') return 'Dokumen PO adalah persetujuan pembelian; uang masuk dicatat saat pembayaran diterima.';
    const scope = tab === 'sales' ? 'Status pembayaran dan piutang mengikuti kondisi akhir periode.' : 'Penjualan bersih setelah diskon; koreksi mengikuti tanggal pembatalan.';
    return scope + (report.paymentMethod ? ' Filter metode mencakup seluruh nilai invoice yang memakai metode tersebut.' : '');
  }

  function draw() {
    const cap = report.capabilities;
    if (!cap.money && ['payments', 'receivables', 'po'].includes(tab)) tab = 'sales';
    const dateWasFocused = document.activeElement?.id === 'report-range' && root.contains(document.activeElement);
    const data = rows(), total = data.length, pages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(page, pages);
    const dateLabel = `${compactDate(filters.from)} – ${compactDate(filters.to)}`;
    const offset = (page - 1) * pageSize;
    root.innerHTML = `<div class="report-page report-foundation"><header class="page-toolbar"><h1>Laporan</h1></header>
      <div class="report-body">
        <div class="report-period">
          <button type="button" class="secondary report-range-trigger" id="report-range" aria-haspopup="dialog" aria-expanded="false" aria-label="Periode laporan WITA, ${e(dateLabel)}" ${report.range.locked ? 'disabled' : ''}>
            <span>${e(dateLabel)}</span><img src="/report-assets/range-chevron.svg" width="16" height="16" alt="">
          </button>
          ${scopeNote() ? `<p class="report-period-note">${scopeNote()}</p>` : ''}
        </div>
        <div class="report-overview">
          ${metricsHtml()}
          <div class="report-selection" hidden><span role="status">1 baris dipilih</span><button type="button" class="report-clear-selection" data-report-clear-selection>Hapus pilihan</button></div>
        </div>
        <div class="report-layout">
          <section class="report-data" aria-label="${e(title())}">
            ${navigationHtml()}
            ${filtersHtml()}
            <p id="report-table-note" class="${tab === 'sales' || tab === 'returns' ? 'sr-only' : 'report-table-note'}">${tableNote()}</p>
            ${tab === 'returns' ? goodsReturnReportHtml(report, e, money, c.canOpenOrder() ? link : undefined) : table(data.slice(offset, offset + pageSize), offset)}
            ${tab !== 'returns' && pages > 1 ? `<div class="report-pagination">
              <span>${offset + 1}–${Math.min(offset + pageSize, total)} dari ${total} baris</span>
              <div><button type="button" class="secondary" id="report-prev" ${page === 1 ? 'disabled' : ''}>Sebelumnya</button><span>${page} / ${pages}</span><button type="button" class="secondary" id="report-next" ${page === pages ? 'disabled' : ''}>Berikutnya</button></div>
            </div>` : ''}
          </section>
          <aside class="report-order-panel" id="report-order-panel" aria-labelledby="report-order-heading" hidden>
            <h2 id="report-order-heading"><button type="button" data-report-show-detail aria-label="Buka detail pesanan" aria-haspopup="dialog">Pesanan</button></h2>
            <div data-report-order-items aria-live="polite"></div>
          </aside>
        </div>
      </div>
    </div>`;
    const rangeTrigger = root.querySelector('#report-range');
    if (!report.range.locked) bindReportRange(rangeTrigger);
    if (dateWasFocused) rangeTrigger.focus({ preventScroll: true });
    for (const [id, key] of [['report-payment', 'paymentStatus'], ['report-method', 'paymentMethod']]) {
      root.querySelector('#' + id)?.addEventListener('change', event => { filters[key] = event.target.value; refresh(); });
    }
    root.querySelectorAll('[data-report-tab]').forEach(button => button.onclick = () => selectTab(button.dataset.reportTab));
    root.querySelector('#report-other').onchange = event => {
      if (event.target.value === 'assets') c.openAssets();
      else if (event.target.value) selectTab(event.target.value);
    };
    root.querySelector('#report-ranking-sort')?.addEventListener('change', event => {
      sort = { key: event.target.value, direction: event.target.value === 'label' ? 1 : -1 };
      page = 1;
      draw();
    });
    for (const [id, step] of [['report-prev', -1], ['report-next', 1]]) {
      root.querySelector('#' + id)?.addEventListener('click', () => { selected = null; page += step; draw(); });
    }
    bindOrderDetails(root.querySelector('.report-data'));
    root.querySelector('#report-export')?.addEventListener('click', exportCsv);
    root.querySelector('#report-print')?.addEventListener('click', print);
  }

  function activateTab(value) {
    selected = null;
    tab = value;
    const rankingOrder = report.capabilities.money ? 'sales' : 'orders';
    sort = { key: isRankingTab(tab) ? rankingOrder : 'date', direction: -1 };
    page = 1;
  }

  function focusTab() {
    root.querySelector("[data-report-tab='" + tab + "']")?.focus({ preventScroll: true });
  }

  function selectTab(value) {
    const {from, to, paymentStatus = '', paymentMethod = ''} = reportQuery(value);
    if (report.range.from !== from || report.range.to !== to
        || report.paymentStatus !== paymentStatus || report.paymentMethod !== paymentMethod) {
      return refresh(value);
    }
    generation++;
    root.removeAttribute('aria-busy');
    activateTab(value);
    draw();
    focusTab();
  }
  function modal(name,body){const d=document.createElement('dialog');d.className='report-dialog';d.innerHTML=`<div class="detail-head"><h2>${e(name)}</h2><button type="button" class="detail-close" aria-label="Tutup">×</button></div><div class="report-dialog-body">${body}</div>`;document.body.append(d);d.querySelector('.detail-close').onclick=()=>d.close();d.onclose=()=>d.remove();d.showModal();return d;}
  function bindReportRange(trigger) {
    const apply = (from, to) => {
      if (from === filters.from && to === filters.to) return;
      filters = { ...filters, from, to };
      refresh();
    };
    bindCalendarPicker(trigger, today => {
      const monthStart = `${today.slice(0, 7)}-01`;
      const yesterday = shiftDay(today, -1);
      const presets = [
        ['Kemarin', yesterday, yesterday], ['Bulan ini', monthStart, today],
        ['30 hari terakhir', shiftDay(today, -29), today]
      ];
      const picker = {
        label: 'Pilih periode laporan WITA', range: true, from: filters.from, to: filters.to,
        clearLabel: 'Atur ulang',
        below: `<p class="report-range-hint" data-range-hint role="status"></p>
          <div class="report-range-presets">${presets.map(([label], index) => `<button type="button" data-range-preset="${index}">${label}</button>`).join('')}</div>`,
        pick(day) {
          if (picker.to) { picker.from = day; picker.to = ''; }
          else [picker.from, picker.to] = [picker.from, day].sort();
        },
        pickToday(day) { picker.from = picker.to = day; },
        clear() { apply(monthStart, today); },
        done() { apply(picker.from, picker.to || picker.from); },
        render(panel) {
          const start = compactDate(picker.from);
          panel.querySelector('[data-range-hint]').textContent = picker.to
            ? `${start} – ${compactDate(picker.to)}` : `Mulai ${start}. Pilih tanggal akhir.`;
        },
        bind(panel, { signal, showDate }) {
          panel.querySelector('.report-range-presets').addEventListener('click', event => {
            const button = event.target.closest('[data-range-preset]');
            if (!button) return;
            [, picker.from, picker.to] = presets[Number(button.dataset.rangePreset)];
            showDate(picker.from);
          }, { signal });
        }
      };
      return picker;
    });
  }

  function bindOrderDetails(section) {
    const selection = root.querySelector('.report-selection');
    const clear = selection.querySelector('[data-report-clear-selection]');
    const panel = root.querySelector('#report-order-panel');
    const content = panel.querySelector('[data-report-order-items]');
    const detail = panel.querySelector('[data-report-show-detail]');
    const identity = c.identity();
    const active = () => section.isConnected && c.isActive() && c.identity() === identity && c.canOpenOrder();
    const isSelected = row => selected?.key === row.dataset.reportSelectRow && selected?.id === row.dataset.reportOrderRow;
    const fetchOrder = id => api('/api/order-history/' + encodeURIComponent(id));

    function syncSelection() {
      for (const row of section.querySelectorAll('[data-report-select-row]')) {
        const chosen = isSelected(row);
        row.toggleAttribute('data-selected', chosen);
        row.querySelector('[data-report-order]')?.setAttribute('aria-pressed', String(chosen));
      }
      panel.hidden = selection.hidden = !selected;
      detail.disabled = !selected?.order;
      if (!selected) { content.replaceChildren(); return; }
      if (selected.order) content.innerHTML = orderItemsHtml(selected.order);
      else content.innerHTML = `<p class="report-order-message">${e(selected.error || 'Memuat pesanan…')}</p>`;
    }

    function choose(row) {
      if (!active()) return null;
      if (isSelected(row) && !selected.error) return selected;
      const choice = { key: row.dataset.reportSelectRow, id: row.dataset.reportOrderRow, order: null, error: '' };
      selected = choice;
      syncSelection();
      choice.request = fetchOrder(choice.id).then(order => {
        choice.order = order;
        return order;
      }).catch(error => {
        choice.error = error.message || 'Pesanan tidak dapat dimuat.';
        return null;
      }).finally(() => {
        if (selected === choice && active()) syncSelection();
      });
      return choice;
    }

    async function open(choice) {
      if (!choice || openingOrder === choice) return;
      openingOrder = choice;
      try {
        const order = await (choice.order ? fetchOrder(choice.id) : choice.request);
        if (order && openingOrder === choice && selected === choice && active()) {
          choice.order = order;
          syncSelection();
          c.openOrder(order);
        }
      } catch (error) {
        if (openingOrder === choice && selected === choice && active()) toast(error.message, 'error');
      } finally {
        if (openingOrder === choice) openingOrder = null;
      }
    }

    const targetRow = event => event.target.closest('button:not([data-report-order]), a, input, select, textarea, summary')
      ? null : event.target.closest('[data-report-order-row]');
    section.addEventListener('click', event => {
      const remove = event.target.closest('[data-report-delete]');
      if (remove) { openDelete(remove.dataset.reportDelete); return; }
      const row = targetRow(event);
      if (row) choose(row);
    });
    section.addEventListener('dblclick', event => {
      const row = targetRow(event);
      if (!row) return;
      row.querySelector('[data-report-order]')?.focus({ preventScroll: true });
      open(choose(row));
      event.preventDefault();
    });
    clear.onclick = () => {
      const invoice = section.querySelector('[data-selected] [data-report-order]');
      selected = null;
      syncSelection();
      invoice?.focus({ preventScroll: true });
    };
    detail.onclick = () => open(selected);
    syncSelection();
  }

  function orderItemsHtml(order) {
    if (!order.items?.length) return '<p class="report-order-message">Belum ada item pesanan.</p>';
    return `<ol class="report-order-items" role="list">${order.items.map((item, index) => `<li>
      <span class="report-item-number" aria-hidden="true">${index + 1}</span>
      <div class="report-item-description"><strong>${e(item.productName)}</strong><small>${e(item.displaySize || itemQuantityLabel(item))}</small></div>
      ${report.capabilities.money && item.subtotal != null ? `<strong class="report-item-price">${money(item.subtotal)}</strong>` : ''}
    </li>`).join('')}</ol>`;
  }
  async function openDelete(id){
    try{
      const o=await api('/api/order-history/'+encodeURIComponent(id));if(!c.isActive() || !report.capabilities.delete)return;
      const cash=(o.payments || []).filter(p=>p.amount>0 && !['PO','DEPOSIT'].includes(p.type)).reduce((n,p)=>n+Number(p.amount),0),deposit=(o.payments || []).filter(p=>p.type==='DEPOSIT' && p.amount>0).reduce((n,p)=>n+Number(p.amount),0);
      const d=modal('Hapus Transaksi',`<form><p><strong>${e(o.code)}</strong> · ${e(o.customerName)}</p><div class="report-cancel-impact"><span>Koreksi omzet pada tanggal pembatalan<strong>− ${money(o.total)}</strong></span><span>Piutang setelah pembatalan<strong>${money(0)}</strong></span>${deposit?`<span>Deposit yang dipulihkan<strong>${money(deposit)}</strong></span>`:''}</div><p class="report-table-note">Invoice dan riwayat pembayaran tetap disimpan. Stok fisik tidak otomatis bertambah.</p>${cash?`<label class="field"><span>Penyelesaian pembayaran</span><select name="disposition"><option value="REFUND">Refund</option><option value="DEPOSIT">Jadikan Deposit</option></select></label><label class="field" data-refund-method><span>Metode refund</span><select name="method"><option value="TUNAI">Tunai</option><option value="TRANSFER">Transfer</option><option value="QRIS">QRIS</option></select></label><p class="report-cash-impact"></p>`:'<input name="disposition" value="REFUND" type="hidden">'}<label class="field"><span>Alasan pembatalan *</span><textarea name="reason" required maxlength="1000"></textarea></label><p class="report-form-error" role="alert"></p><div class="form-footer"><button type="button" class="secondary" data-cancel>Batal</button><button type="submit" class="delete-trigger">Konfirmasi Hapus Transaksi</button></div></form>`);
      const form=d.querySelector('form'),requestId=crypto.randomUUID();let saving=false;
      const sync=()=>{if(!cash)return;const refund=form.elements.disposition.value==='REFUND';d.querySelector('[data-refund-method]').hidden=!refund;d.querySelector('.report-cash-impact').textContent=refund?`Uang keluar (refund): ${money(cash)}. Uang masuk bersih berkurang pada tanggal refund.`:`Deposit bertambah ${money(cash)}. Uang yang telah diterima tetap berada di toko.`;};sync();form.elements.disposition.onchange=sync;d.querySelector('[data-cancel]').onclick=()=>{if(!saving)d.close();};
      d.oncancel=event=>{if(saving)event.preventDefault();};d.querySelector('.detail-close').onclick=()=>{if(!saving)d.close();};
      form.onsubmit=async event=>{event.preventDefault();if(saving)return;saving=true;form.querySelector('[type=submit]').disabled=true;try{await api('/api/reports/orders/'+encodeURIComponent(id)+'/cancel',{method:'POST',body:JSON.stringify({...Object.fromEntries(new FormData(form)),requestId,expectedUpdatedAt:o.updatedAt,expectedTotal:o.total,expectedPaidAmount:o.paidAmount})});d.close();await refresh();toast('Transaksi dibatalkan; koreksi dicatat pada tanggal pembatalan.');}catch(error){d.querySelector('.report-form-error').textContent=error.message;saving=false;form.querySelector('[type=submit]').disabled=false;}};
    }catch(error){toast(error.message,'error');}
  }
  function exportData(){
    const data=rows();
    if(tab==='returns')return {headers:['Tanggal','Retur','Invoice','Pelanggan','Produk','Jumlah','Satuan','Perubahan stok',...(report.capabilities.cost?['Biaya pengganti']:[])],data:data.map(r=>[date(r.date),r.code,r.invoice,r.customer,r.product,r.quantity,r.unitName,r.stockChange,...(report.capabilities.cost?[r.cost]:[])])};
    if(tab==='sales')return {headers:['Tanggal','Invoice','Pelanggan',...(report.capabilities.money?['Pembayaran','Total','Piutang','Metode','Pajak']:['Produk']),'Jenis baris'],data:data.map(r=>[date(r.date),r.code,r.customer,...(report.capabilities.money?[r.paymentStatus==='LUNAS'?'Lunas':'Belum Lunas',r.sales,r.outstanding,r.methods.map(method).join(' + ') || '-',r.hasTax?'Ya':'']:[r.products]),r.kind==='CANCELLATION'?'Koreksi pembatalan':r.kind==='DISCOUNT'?'Diskon invoice':'Penjualan'])};
    if(tab==='payments')return {headers:headers(),data:data.map(r=>[date(r.date),r.code,r.customer,kind(r),method(r.method),Math.max(0,r.paid),Math.max(0,-r.paid)])};
    if(tab==='receivables')return {headers:headers(),data:data.map(r=>[date(r.date),r.code,r.customer,r.sales,r.paid,r.outstanding])};
    if(tab==='po')return {headers:headers(),data:data.map(r=>[date(r.createdAt),r.code,r.customer,r.poNumber])};
    return {headers:['#',title(),'Invoice','Jumlah terjual','Satuan',...(report.capabilities.money?['Penjualan']:[])],data:data.map((r,i)=>[i+1,r.label,r.orders,r.quantities?.length===1?r.quantities[0].quantity:(r.quantities || []).map(q=>`${q.quantity} ${q.unit}`).join('; '),(r.quantities || []).map(q=>q.unit).join('; '),...(report.capabilities.money?[r.sales]:[])])};
  }
  function exportCsv(){const data=exportData(),cell=value=>{let v=String(value??'');if(typeof value==='string' && /^[=+@\-\t\r]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';};const blob=new Blob(['\uFEFF'+[data.headers,...data.data].map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`laporan-${tab}-${report.range.from}-${report.range.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function print() {
    const {range, paymentStatus, paymentMethod, summary} = report;
    const period = `${e(day(range.from))} – ${e(day(range.to))} WITA`;
    const status = paymentStatus === 'LUNAS' ? 'Lunas' : paymentStatus === 'BELUM_LUNAS' ? 'Belum Lunas' : 'Semua pembayaran';
    const payment = isRankingTab(tab) ? '' : ` · ${status} · ${e(method(paymentMethod || 'Semua metode'))}`;
    const totals = report.capabilities.money ? `<p>Omzet ${money(summary.sales)} · Uang Masuk Bersih ${money(summary.paid)} · Piutang ${money(summary.outstanding)}</p>` : '';
    const detail = tab === 'returns' ? goodsReturnReportHtml(report, e, money) : table(rows(), 0, false);
    c.print(`<div class="print-brand">MANNA PRINT</div><h2>Laporan ${e(title())}</h2><p>${period}${payment}</p>${totals}${detail}`);
  }
  function reset(){generation++;report=null;openingOrder=selected=null;filters={from:'',to:'',paymentStatus:'',paymentMethod:''};tab='sales';sort={key:'date',direction:-1};page=1;document.querySelectorAll('.report-dialog').forEach(d=>d.close());}
  return {mount,reset};
}
