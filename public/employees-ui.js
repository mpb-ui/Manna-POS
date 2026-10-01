import { calculatePayroll, periodBounds } from './payroll-domain.js';
let ctx; let generation = 0; let modalUnsaved = false;
const ui = { tab: 'employees', period: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7), historyPeriod: '', historyEmployee: '', employees: [], payrolls: [], drafts: new Map() };
const labels = { basicSalary: 'Gaji pokok', allowance: 'Tunjangan', attendanceBonus: 'Bonus kehadiran', extraBonus: 'Bonus tambahan', overtimePay: 'Lembur', absenceDeduction: 'Potongan absen', leaveDeduction: 'Potongan cuti', lateDeduction: 'Potongan terlambat', otherDeduction: 'Potongan lainnya', totalIncome: 'Total penghasilan', totalDeductions: 'Total potongan', netSalary: 'Gaji bersih' };
const inputLabels = { absentDays: 'Absen (hari)', leaveDays: 'Cuti (hari)', sickWithNoteDays: 'Sakit + surat (hari)', sickWithoutNoteDays: 'Sakit tanpa surat (hari)', lateIncidents: 'Kejadian terlambat', lateExtraMinutes: 'Menit setelah 08:00', overtimeHours: 'Lembur (jam)', prorataDays: 'Hari dasar prorata' };
const statusLabel = value => ({ DRAFT: 'Draft', FINAL: 'Final', PAID: 'Dibayar' }[value] || value);
const e = value => ctx.escapeHtml(value);
const money = value => ctx.rupiah.format(value);
const monthLabel = period => new Date(`${period}-01T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const badge = row => `<span class="payroll-status ${row.status.toLowerCase()}">${statusLabel(row.status)}</span>`;
const post = (path, method, body) => ctx.api(path, { method, body: JSON.stringify(body) });
export function hasUnsavedPayroll() { return modalUnsaved || [...ui.drafts.values()].some(row => row.dirty); }
export function clearEmployeeSession() { generation += 1; modalUnsaved = false; ui.employees = []; ui.payrolls = []; ui.drafts.clear(); }
export function discardPayrollDrafts() { ui.drafts.clear(); modalUnsaved = false; }
export async function mountEmployees(context) {
  ctx = context; const token = ++generation;
  ui.drafts.clear();
  ctx.root.innerHTML = '<section class="panel panel-body">Memuat data karyawan…</section>';
  try {
    const [employees, payrolls] = await Promise.all([ctx.api('/api/employees'), ctx.api('/api/payrolls')]);
    if (token !== generation || !ctx.isActive()) return;
    ui.employees = employees; ui.payrolls = payrolls; ui.drafts.clear(); draw();
  } catch (error) { if (token === generation && ctx.isActive()) ctx.root.innerHTML = `<section class="panel panel-body">${e(error.message)} <button class="secondary" id="retry-employees">Coba lagi</button></section>`; ctx.root.querySelector('#retry-employees')?.addEventListener('click', () => mountEmployees(ctx)); }
}
async function refresh() {
  const token = generation;
  const [employees, payrolls] = await Promise.all([ctx.api('/api/employees'), ctx.api('/api/payrolls')]);
  if (token !== generation || !ctx.isActive()) return;
  ui.employees = employees; ui.payrolls = payrolls; draw();
}
function currentDraft(row) { return ui.drafts.get(row.id) || row; }
function markDirty(row) { row.dirty = true; ui.drafts.set(row.id, row); }
function header() {
  return `<div class="master-top"><div><h1>Karyawan</h1><p>Kelola karyawan, hitung payroll, dan simpan slip setiap bulan.</p></div>${ui.tab === 'employees' ? '<button class="primary" id="add-employee">+ Tambah Karyawan</button>' : ''}</div><div class="master-tabs">${[['employees', 'Daftar Karyawan'], ['payroll', 'Payroll Bulanan'], ['history', 'Riwayat Slip']].map(([id, title]) => `<button data-employee-tab="${id}" class="${ui.tab === id ? 'active' : ''}">${title}</button>`).join('')}</div>`;
}
function draw() {
  if (!ctx.isActive()) return;
  ctx.root.innerHTML = `<div class="master-page employees-page">${header()}<div id="employees-content"></div></div>`;
  ctx.root.querySelectorAll('[data-employee-tab]').forEach(button => button.onclick = () => { ui.tab = button.dataset.employeeTab; draw(); });
  if (ui.tab === 'employees') drawEmployees(); else if (ui.tab === 'payroll') drawPayroll(); else drawHistory();
}
function tenure(start) {
  const now = today(); const a = new Date(`${start}T00:00:00Z`); const b = new Date(`${now}T00:00:00Z`);
  if (start > now) return 'Belum mulai';
  const months = Math.max(0, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth() - (b.getUTCDate() < a.getUTCDate() ? 1 : 0));
  return `${Math.floor(months / 12)} tahun ${months % 12} bulan`;
}
function drawEmployees() {
  const rows = ui.employees.filter(employee => !employee.deletedAt);
  const content = ctx.root.querySelector('#employees-content');
  content.innerHTML = `<section class="panel"><div class="panel-head master-list-head"><h2>Daftar Karyawan</h2><input class="search" id="employee-search" placeholder="Cari nama atau jabatan…"></div><div class="table-wrap master-table"><table><thead><tr><th>Karyawan</th><th>Jabatan</th><th>Mulai kerja</th><th>Gaji pokok</th><th>Tunjangan</th><th>Bonus kehadiran</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(employee => `<tr data-employee-search="${e(`${employee.name} ${employee.position} ${employee.code}`.toLowerCase())}"><td><strong>${e(employee.name)}</strong><small>${e(employee.code)}</small></td><td>${e(employee.position || '—')}</td><td>${e(employee.startDate)}<small>${tenure(employee.startDate)}</small></td><td>${money(employee.basicSalary)}</td><td>${money(employee.employmentStatus === 'TRAINING' ? 0 : employee.allowance)}</td><td>${money(employee.attendanceBonus)}</td><td>${employee.active === false ? 'Nonaktif' : employee.employmentStatus === 'TRAINING' ? 'Training' : 'Aktif'}</td><td><button class="secondary" data-edit-employee="${e(employee.id)}">Edit</button></td></tr>`).join('') || '<tr><td colspan="8">Belum ada karyawan. Tambahkan karyawan untuk membuat payroll.</td></tr>'}</tbody></table></div></section><p class="product-note payroll-note">Karyawan terpisah dari akun User dan PIC. Mengubah gaji hanya memengaruhi slip baru; slip yang sudah dibuat tetap memakai salinan datanya.</p>`;
  ctx.root.querySelector('#add-employee').onclick = () => employeeForm();
  content.querySelector('#employee-search').oninput = event => content.querySelectorAll('[data-employee-search]').forEach(row => row.classList.toggle('hidden', !row.dataset.employeeSearch.includes(event.target.value.toLowerCase())));
  content.querySelectorAll('[data-edit-employee]').forEach(button => button.onclick = () => employeeForm(ui.employees.find(item => item.id === button.dataset.editEmployee)));
}
function showDialog(title, html) {
  ctx.dialog.classList.add('master-dialog', 'payroll-dialog');
  const detail = ctx.dialog.querySelector('#order-detail');
  detail.innerHTML = `<div class="detail-head"><div><span class="eyebrow">Karyawan</span><h2>${e(title)}</h2></div><button type="button" class="detail-close" aria-label="Tutup">×</button></div><div class="detail-body">${html}</div>`;
  detail.querySelector('.detail-close').onclick = () => ctx.dialog.close();
  ctx.dialog.onclose = () => { ctx.dialog.classList.remove('master-dialog', 'payroll-dialog'); ctx.dialog.onclose = null; };
  ctx.dialog.showModal(); return detail;
}
function ask(title, explanation, extra = '', destructive = false) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'); dialog.className = 'delete-confirm';
    dialog.innerHTML = `<form class="delete-confirm-body"><h3>${e(title)}</h3><p>${e(explanation)}</p>${extra}<div class="delete-confirm-actions"><button type="submit" class="${destructive ? 'delete-trigger' : 'primary'}">${destructive ? 'Ya, Hapus' : 'Lanjutkan'}</button><button type="button" class="secondary">Batal</button></div></form>`;
    document.body.append(dialog); const close = value => { dialog.close(); dialog.remove(); resolve(value); };
    dialog.querySelector('form').onsubmit = event => { event.preventDefault(); close(Object.fromEntries(new FormData(event.target))); };
    dialog.querySelector('button[type=button]').onclick = () => close(null); dialog.oncancel = event => { event.preventDefault(); close(null); }; dialog.showModal();
  });
}
function employeeForm(employee = null) {
  const detail = showDialog(employee ? 'Edit Karyawan' : 'Tambah Karyawan', `<form id="employee-form" class="master-form"><div class="form-grid"><label class="field"><span>Nama karyawan *</span><input name="name" required maxlength="100" value="${e(employee?.name || '')}"></label><label class="field"><span>ID karyawan</span><input name="code" maxlength="100" value="${e(employee?.code || '')}" placeholder="Otomatis jika kosong"></label><label class="field"><span>Jabatan</span><input name="position" maxlength="100" value="${e(employee?.position || '')}"></label><label class="field"><span>Tanggal mulai kerja *</span><input name="startDate" type="date" min="2000-01-01" max="2100-12-31" required value="${e(employee?.startDate || today())}"></label><label class="field"><span>Status kerja</span><select name="employmentStatus"><option value="TRAINING" ${!employee || employee.employmentStatus === 'TRAINING' ? 'selected' : ''}>Training</option><option value="ACTIVE" ${employee?.employmentStatus === 'ACTIVE' ? 'selected' : ''}>Aktif</option></select></label><label class="field"><span>Status payroll</span><select name="active"><option value="true" ${employee?.active !== false ? 'selected' : ''}>Diikutkan payroll</option><option value="false" ${employee?.active === false ? 'selected' : ''}>Nonaktif</option></select></label>${['basicSalary', 'allowance', 'attendanceBonus', 'overtimeRate'].map(field => `<label class="field"><span>${({ ...labels, overtimeRate: 'Tarif lembur / jam' })[field]}</span>${ctx.moneyField(field, employee?.[field] ?? (field === 'attendanceBonus' ? 250000 : field === 'overtimeRate' ? 10000 : 0))}</label>`).join('')}<label class="field"><span>Bank (opsional)</span><input name="bank" maxlength="100" value="${e(employee?.bank || '')}"></label><label class="field"><span>Nomor rekening (opsional)</span><input name="accountNumber" maxlength="100" value="${e(employee?.accountNumber || '')}"></label><label class="field full"><span>Nama penerima rekening (opsional)</span><input name="accountName" maxlength="100" value="${e(employee?.accountName || '')}"></label></div><p class="product-note">Training: tunjangan otomatis Rp0. Tarif lembur default Rp10.000/jam; atur Rp15.000/jam untuk manajer. Bonus bulan pertama yang belum penuh otomatis Rp0.</p><div class="form-footer">${employee ? '<button type="button" class="delete-trigger" id="delete-employee">Hapus Karyawan</button>' : ''}<button type="button" class="secondary" id="cancel-employee">Batal</button><button class="primary" type="submit">Simpan Karyawan</button></div></form>`);
  const form = detail.querySelector('form'); ctx.bindMoneyInputs(detail);
  let overtimeManual = Boolean(employee);
  form.elements.overtimeRate.addEventListener('moneychange', () => { overtimeManual = true; });
  form.elements.name.addEventListener('input', () => { if (!overtimeManual) form.elements.overtimeRate.value = (/^gema(?:\s|$)/i.test(form.elements.name.value.trim()) ? 15000 : 10000).toLocaleString('id-ID'); });
  const updateTraining = () => { form.elements.allowance.disabled = form.elements.employmentStatus.value === 'TRAINING'; };
  form.elements.employmentStatus.onchange = updateTraining; updateTraining();
  detail.querySelector('#cancel-employee').onclick = () => ctx.dialog.close();
  form.onsubmit = async event => {
    event.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form)); body.active = body.active === 'true'; body.revision = employee?.revision;
      ['basicSalary', 'allowance', 'attendanceBonus', 'overtimeRate'].forEach(field => { body[field] = field === 'allowance' && body.employmentStatus === 'TRAINING' ? 0 : ctx.parseMoney(form.elements[field].value); });
      await post(`/api/employees${employee ? `/${employee.id}` : ''}`, employee ? 'PUT' : 'POST', body); await refresh(); ctx.dialog.close(); ctx.toast('Karyawan berhasil disimpan');
    } catch (error) { ctx.toast(error.message, 'error'); button.disabled = false; }
  };
  detail.querySelector('#delete-employee')?.addEventListener('click', async () => {
    if (!await ask('Apakah anda yakin mau menghapus karyawan ini?', 'Karyawan diarsipkan dan tidak masuk payroll baru. Seluruh slip dan draft lama tetap tersimpan.', '', true)) return;
    try { await post(`/api/employees/${employee.id}`, 'DELETE', { revision: employee.revision }); await refresh(); ctx.dialog.close(); ctx.toast('Karyawan diarsipkan'); } catch (error) { ctx.toast(error.message, 'error'); }
  });
}
function countField(row, field) {
  return `<label><span>${e(inputLabels[field])}</span><input type="number" min="0" max="${field.endsWith('Days') || field === 'lateIncidents' ? 31 : field === 'overtimeHours' ? 744 : 44640}" step="${field === 'overtimeHours' ? '.25' : '1'}" data-payroll-input="${field}" value="${row.input[field] ?? ''}" ${row.status !== 'DRAFT' ? 'disabled' : ''} aria-label="${e(`${inputLabels[field]} ${row.employee.name}`)}"></label>`;
}
function drawPayroll() {
  const rows = ui.payrolls.filter(row => row.period === ui.period);
  const content = ctx.root.querySelector('#employees-content');
  const totals = rows.reduce((sum, row) => sum + row.calculation.amounts.netSalary, 0);
  content.innerHTML = `<div class="payroll-toolbar"><label class="field"><span>Periode payroll</span><input id="payroll-period" type="month" min="2000-01" max="2100-12" value="${e(ui.period)}"></label><button class="primary" id="create-payroll">${rows.length ? 'Tambahkan Karyawan Baru' : 'Buat Payroll'}</button>${rows.length ? '<button class="secondary" id="save-all-payroll">Simpan Semua Draft</button><button class="secondary" id="finalize-payroll">Finalisasi Draft</button><button class="secondary" id="print-payroll">Cetak / PDF Semua</button>' : ''}</div><div class="payroll-summary"><span>${rows.length} slip · ${rows.filter(row => row.status === 'DRAFT').length} draft</span><strong>Total gaji bersih: <b id="payroll-grand-total">${money(totals)}</b></strong></div><section class="panel"><div class="table-wrap master-table payroll-table"><table><thead><tr><th>Karyawan</th><th>Kehadiran</th><th>Terlambat</th><th>Lembur</th><th>Bonus kehadiran</th><th>Total potongan</th><th>Gaji bersih</th><th></th></tr></thead><tbody>${rows.map(original => {
    const row = currentDraft(original); return `<tr data-payroll-row="${e(row.id)}"><td><strong>${e(row.employee.name)}</strong><small>${e(row.employee.position || row.employee.code)}</small>${badge(row)}<small class="payroll-save-state">${row.dirty ? 'Belum disimpan' : 'Tersimpan'}</small></td><td><div class="payroll-count-grid">${['absentDays', 'leaveDays', 'sickWithNoteDays', 'sickWithoutNoteDays'].map(field => countField(row, field)).join('')}</div></td><td><div class="payroll-count-grid single">${['lateIncidents', 'lateExtraMinutes'].map(field => countField(row, field)).join('')}</div></td><td>${countField(row, 'overtimeHours')}<small>${money(row.employee.overtimeRate)}/jam</small></td><td><strong data-payroll-total="attendanceBonus">${money(row.calculation.amounts.attendanceBonus)}</strong><small>Ubah nominal melalui Rincian</small></td><td><strong data-payroll-total="totalDeductions">${money(row.calculation.amounts.totalDeductions)}</strong></td><td><strong class="payroll-net" data-payroll-total="netSalary">${money(row.calculation.amounts.netSalary)}</strong><small class="payroll-row-error"></small></td><td><div class="payroll-row-actions"><button class="secondary" data-payroll-detail="${e(row.id)}">Rincian</button>${row.status === 'DRAFT' ? `<button class="primary" data-save-payroll="${e(row.id)}">Simpan</button>` : `<button class="secondary" data-print-one="${e(row.id)}">Cetak</button>`}</div></td></tr>`;
  }).join('') || '<tr><td colspan="8" class="payroll-empty">Pilih periode, lalu klik Buat Payroll. Data gaji akan diambil dari daftar karyawan.</td></tr>'}</tbody></table></div></section><div class="payroll-rules"><p><strong>Aturan otomatis:</strong> absen dan sakit tanpa surat = gaji pokok ÷ 26 per hari. Cuti dan sakit dengan surat tidak dipotong, tetapi menggugurkan bonus. Tunjangan tetap utuh.</p><p>Terlambat = Rp15.000 per kejadian + Rp1.000 per menit setelah 08:00. Contoh 08:10: 1 kejadian, 10 menit tambahan. Lembur mengikuti tarif karyawan.</p><p>Isi Absen tanpa menghitung ulang hari sakit tanpa surat. Semua nominal dan hari dasar prorata dapat diubah di Rincian. Perubahan tabel perlu disimpan.</p></div>`;
  content.querySelector('#payroll-period').onchange = event => { try { periodBounds(event.target.value); ui.period = event.target.value; drawPayroll(); } catch (error) { ctx.toast(error.message, 'error'); } };
  content.querySelector('#create-payroll').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try { await post('/api/payrolls/period', 'POST', { period: ui.period }); await refresh(); ctx.toast('Payroll disiapkan tanpa membuat slip ganda'); } catch (error) { ctx.toast(error.message, 'error'); button.disabled = false; }
  };
  content.querySelectorAll('[data-payroll-input]').forEach(input => input.oninput = () => {
    const tr = input.closest('[data-payroll-row]'); const original = rows.find(row => row.id === tr.dataset.payrollRow); const row = currentDraft(original) === original ? structuredClone(original) : currentDraft(original);
    row.input[input.dataset.payrollInput] = input.value; markDirty(row); tr.querySelector('.payroll-save-state').textContent = 'Belum disimpan';
    try { row.calculation = calculatePayroll(row.employee, row.period, row.input, row.overrides); row.invalid = false; tr.querySelector('.payroll-row-error').textContent = ''; tr.querySelectorAll('[data-payroll-total]').forEach(cell => cell.textContent = money(row.calculation.amounts[cell.dataset.payrollTotal])); updateGrandTotal(rows); }
    catch (error) { row.invalid = true; tr.querySelector('.payroll-row-error').textContent = error.message; }
  });
  content.querySelectorAll('[data-save-payroll]').forEach(button => button.onclick = async () => { button.disabled = true; try { await saveDraft(button.dataset.savePayroll); drawPayroll(); ctx.toast('Draft slip disimpan'); } catch (error) { ctx.toast(error.message, 'error'); button.disabled = false; } });
  content.querySelectorAll('[data-payroll-detail]').forEach(button => button.onclick = () => payrollForm(currentDraft(rows.find(row => row.id === button.dataset.payrollDetail))));
  content.querySelectorAll('[data-print-one]').forEach(button => button.onclick = () => printSlips([rows.find(row => row.id === button.dataset.printOne)]));
  content.querySelector('#save-all-payroll')?.addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true;
    try { for (const row of rows) if (ui.drafts.get(row.id)?.dirty) await saveDraft(row.id); drawPayroll(); ctx.toast('Semua perubahan draft disimpan'); } catch (error) { ctx.toast(error.message, 'error'); button.disabled = false; }
  });
  content.querySelector('#finalize-payroll')?.addEventListener('click', async () => {
    if (rows.some(row => ui.drafts.get(row.id)?.dirty)) return ctx.toast('Simpan perubahan dan periksa nominal sebelum finalisasi', 'error');
    const drafts = rows.filter(row => row.status === 'DRAFT'); if (!drafts.length) return ctx.toast('Tidak ada draft untuk difinalisasi');
    if (!await ask('Finalisasi payroll?', `${drafts.length} slip periode ${monthLabel(ui.period)} akan dikunci. Slip dapat dibuka kembali dengan alasan perubahan.`)) return;
    try { await post('/api/payrolls/period/finalize', 'POST', { period: ui.period, revisions: drafts.map(row => ({ id: row.id, revision: row.revision })) }); await refresh(); ctx.toast('Payroll difinalisasi'); } catch (error) { ctx.toast(error.message, 'error'); }
  });
  content.querySelector('#print-payroll')?.addEventListener('click', () => {
    if (rows.some(row => ui.drafts.get(row.id)?.dirty)) return ctx.toast('Simpan perubahan sebelum mencetak', 'error');
    printSlips(rows);
  });
  updateGrandTotal(rows);
}
function updateGrandTotal(rows) { ctx.root.querySelector('#payroll-grand-total').textContent = money(rows.reduce((sum, row) => sum + currentDraft(row).calculation.amounts.netSalary, 0)); }
async function saveDraft(id) {
  const original = ui.payrolls.find(row => row.id === id); const row = currentDraft(original);
  if (row.invalid) throw new Error('Perbaiki input payroll sebelum menyimpan');
  const saved = await post(`/api/payrolls/${id}`, 'PUT', { revision: row.revision, input: row.input, overrides: row.overrides, notes: row.notes });
  ui.payrolls[ui.payrolls.findIndex(item => item.id === id)] = saved; ui.drafts.delete(id); return saved;
}
function payrollForm(original) {
  let row = structuredClone(original); const locked = row.status !== 'DRAFT';
  const detail = showDialog(`Slip ${row.employee.name} · ${monthLabel(row.period)}`, `<form id="payroll-form" class="master-form"><div class="payroll-dialog-meta">${badge(row)}<span>${e(row.employee.code)} · ${e(row.employee.position || 'Jabatan belum diisi')}</span>${row.paidDate ? `<span>Dibayar ${e(row.paidDate)}</span>` : ''}</div><p class="product-note">Gaji pokok standar ${money(row.employee.basicSalary)}. ${row.employee.employmentStatus === 'TRAINING' ? 'Training: tunjangan otomatis Rp0.' : ''} ${row.calculation.partialMonth ? 'Bulan pertama: gaji diprorata Senin–Sabtu dan bonus otomatis Rp0.' : ''} Hari dasar normal: 26.</p><div class="form-grid payroll-input-fields">${Object.keys(inputLabels).map(field => `<label class="field"><span>${e(inputLabels[field])}</span><input name="${field}" type="number" min="0" step="${field === 'overtimeHours' ? '.25' : '1'}" value="${row.input[field] ?? ''}" ${locked ? 'disabled' : ''} ${field === 'prorataDays' ? `placeholder="Otomatis: ${row.calculation.defaultProrataDays}"` : 'required'}></label>`).join('')}</div><p class="product-note">Hari dasar prorata kosong = otomatis. Isi manual untuk penyesuaian jadwal/libur khusus. Absen dan sakit tanpa surat diinput terpisah.</p><div class="payroll-amount-grid">${Object.entries(labels).map(([field, label]) => `<label class="field payroll-amount-field"><span>${e(label)} <small data-mode="${field}"></small></span>${ctx.moneyField(field, row.calculation.amounts[field], locked ? 'disabled' : '')}${locked ? '' : `<button class="payroll-auto-reset" type="button" data-reset-amount="${field}">Kembalikan Otomatis</button>`}</label>`).join('')}</div><div class="payroll-reconciliation" id="payroll-reconciliation"></div><p class="payroll-row-error" id="payroll-form-error"></p><label class="field"><span>Catatan bonus/potongan atau penyesuaian</span><textarea name="notes" rows="3" maxlength="2000" ${locked ? 'disabled' : ''}>${e(row.notes)}</textarea></label>${row.previousVersions.length ? `<details class="payroll-versions"><summary>Versi slip sebelumnya (${row.previousVersions.length})</summary>${row.previousVersions.map(version => `<p>Versi ${version.revision} · ${statusLabel(version.status)} · ${money(version.calculation.amounts.netSalary)}${version.paidDate ? ` · dibayar ${e(version.paidDate)}` : ''}</p>`).join('')}</details>` : ''}<details class="payroll-versions"><summary>Riwayat perubahan</summary>${row.events.map(event => `<p>${e(event.at.slice(0, 16).replace('T', ' '))} UTC · ${e(event.actor)} · ${e(event.action)}${event.reason ? ` · ${e(event.reason)}` : ''}</p>`).join('')}</details><div class="form-footer"><button type="button" class="secondary" id="print-slip">Cetak / PDF</button>${locked ? `<button type="button" class="secondary" id="reopen-slip">Buka Kembali</button>${row.status === 'FINAL' ? '<button type="button" class="primary" id="pay-slip">Tandai Dibayar</button>' : ''}` : '<button type="submit" class="primary">Simpan Draft</button>'}<button type="button" class="secondary" id="close-slip">Tutup</button></div></form>`);
  const form = detail.querySelector('form'); ctx.bindMoneyInputs(detail);
  let modalDirty = Boolean(row.dirty); modalUnsaved = modalDirty;
  function recalc() {
    try {
      if (!locked) {
        row.input = Object.fromEntries(Object.keys(inputLabels).map(field => [field, form.elements[field].value]));
        row.calculation = calculatePayroll(row.employee, row.period, row.input, row.overrides);
      }
      row.invalid = false;
      Object.keys(labels).forEach(field => { const input = form.elements[field]; if (document.activeElement !== input) input.value = row.calculation.amounts[field].toLocaleString('id-ID'); detail.querySelector(`[data-mode="${field}"]`).textContent = Object.hasOwn(row.overrides, field) ? 'Manual' : 'Otomatis'; });
      detail.querySelector('#payroll-form-error').textContent = '';
      const c = row.calculation;
      detail.querySelector('#payroll-reconciliation').textContent = `Gaji bersih ${money(c.amounts.netSalary)}${c.incomeAdjustment ? ` · Penyesuaian penghasilan ${money(c.incomeAdjustment)}` : ''}${c.deductionAdjustment ? ` · Penyesuaian potongan ${money(c.deductionAdjustment)}` : ''}`;
    } catch (error) { row.invalid = true; detail.querySelector('#payroll-form-error').textContent = error.message; }
  }
  Object.keys(inputLabels).forEach(field => form.elements[field].oninput = () => { if (!locked) { modalDirty = true; modalUnsaved = true; recalc(); } });
  Object.keys(labels).forEach(field => form.elements[field].addEventListener('moneychange', () => { if (!locked) { modalDirty = true; modalUnsaved = true; row.overrides[field] = ctx.parseMoney(form.elements[field].value); recalc(); } }));
  detail.querySelectorAll('[data-reset-amount]').forEach(button => button.onclick = () => { modalDirty = true; modalUnsaved = true; delete row.overrides[button.dataset.resetAmount]; recalc(); });
  form.onsubmit = async event => {
    event.preventDefault(); if (locked) return; recalc(); if (row.invalid) return;
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    try { row.notes = form.elements.notes.value; markDirty(row); await saveDraft(row.id); ctx.dialog.close(); draw(); ctx.toast('Draft slip disimpan'); } catch (error) { ctx.toast(error.message, 'error'); button.disabled = false; }
  };
  const closeModal = () => { if (!locked && modalDirty && !window.confirm('Buang perubahan yang belum disimpan?')) return; ctx.dialog.close(); };
  form.elements.notes.oninput = () => { modalDirty = true; modalUnsaved = true; };
  detail.querySelector('#close-slip').onclick = closeModal;
  detail.querySelector('.detail-close').onclick = closeModal;
  ctx.dialog.oncancel = event => { event.preventDefault(); closeModal(); };
  ctx.dialog.addEventListener('close', () => { ctx.dialog.oncancel = null; modalUnsaved = false; }, { once: true });
  detail.querySelector('#print-slip').onclick = () => {
    if (!locked && modalDirty) return ctx.toast('Simpan perubahan sebelum mencetak slip', 'error');
    printSlips([row]);
  };
  detail.querySelector('#reopen-slip')?.addEventListener('click', async () => {
    const values = await ask('Buka kembali slip?', 'Status dibayar akan dihapus. Versi sebelumnya tetap disimpan.', '<label class="field"><span>Alasan perubahan *</span><textarea name="reason" required maxlength="500"></textarea></label>');
    if (!values) return; try { await post(`/api/payrolls/${row.id}/status`, 'PATCH', { revision: row.revision, action: 'REOPEN', reason: values.reason }); await refresh(); ctx.dialog.close(); ctx.toast('Slip dibuka kembali sebagai draft'); } catch (error) { ctx.toast(error.message, 'error'); }
  });
  detail.querySelector('#pay-slip')?.addEventListener('click', async () => {
    const values = await ask('Tandai slip sudah dibayar?', 'Ini mencatat pembayaran payroll tanpa melakukan transfer bank.', `<label class="field"><span>Tanggal pembayaran *</span><input name="paidDate" type="date" required value="${today()}"></label>`);
    if (!values) return; try { await post(`/api/payrolls/${row.id}/status`, 'PATCH', { revision: row.revision, action: 'PAY', paidDate: values.paidDate }); await refresh(); ctx.dialog.close(); ctx.toast('Pembayaran gaji dicatat'); } catch (error) { ctx.toast(error.message, 'error'); }
  });
  recalc();
}
function drawHistory() {
  const rows = ui.payrolls.filter(row => (!ui.historyPeriod || row.period === ui.historyPeriod) && (!ui.historyEmployee || row.employeeId === ui.historyEmployee)).sort((a, b) => b.period.localeCompare(a.period) || a.employee.name.localeCompare(b.employee.name));
  const names = [...new Map([...ui.employees.map(employee => [employee.id, employee.name]), ...ui.payrolls.map(row => [row.employeeId, row.employee.name])]).entries()];
  const content = ctx.root.querySelector('#employees-content');
  content.innerHTML = `<div class="payroll-toolbar"><label class="field"><span>Bulan</span><input id="history-period" type="month" value="${e(ui.historyPeriod)}"></label><label class="field"><span>Karyawan</span><select id="history-employee"><option value="">Semua karyawan</option>${names.map(([id, name]) => `<option value="${e(id)}" ${ui.historyEmployee === id ? 'selected' : ''}>${e(name)}</option>`).join('')}</select></label><button class="secondary" id="clear-history">Semua Periode</button>${rows.length ? '<button class="secondary" id="print-history">Cetak / PDF Hasil Filter</button>' : ''}</div><section class="panel"><div class="table-wrap master-table"><table><thead><tr><th>Periode</th><th>Karyawan</th><th>Penghasilan</th><th>Potongan</th><th>Gaji bersih</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(row => `<tr><td>${monthLabel(row.period)}</td><td><strong>${e(row.employee.name)}</strong><small>${e(row.employee.code)}</small></td><td>${money(row.calculation.amounts.totalIncome)}</td><td>${money(row.calculation.amounts.totalDeductions)}</td><td><strong>${money(row.calculation.amounts.netSalary)}</strong></td><td>${badge(row)}${row.paidDate ? `<small>${e(row.paidDate)}</small>` : ''}</td><td><button class="secondary" data-history-slip="${e(row.id)}">Lihat Slip</button></td></tr>`).join('') || '<tr><td colspan="7">Belum ada slip untuk filter ini.</td></tr>'}</tbody></table></div></section>`;
  content.querySelector('#history-period').onchange = event => { ui.historyPeriod = event.target.value; drawHistory(); };
  content.querySelector('#history-employee').onchange = event => { ui.historyEmployee = event.target.value; drawHistory(); };
  content.querySelector('#clear-history').onclick = () => { ui.historyPeriod = ''; ui.historyEmployee = ''; drawHistory(); };
  content.querySelectorAll('[data-history-slip]').forEach(button => button.onclick = () => payrollForm(currentDraft(rows.find(row => row.id === button.dataset.historySlip))));
  content.querySelector('#print-history')?.addEventListener('click', () => { if (rows.some(row => ui.drafts.get(row.id)?.dirty)) return ctx.toast('Simpan perubahan sebelum mencetak', 'error'); printSlips(rows); });
}
function slipHtml(row) {
  const c = row.calculation; const a = c.amounts; const employee = row.employee;
  const line = (label, value) => `<div class="salary-line"><span>${e(label)}</span><strong>${money(value)}</strong></div>`;
  return `<article class="salary-slip"><header><div><h1>SLIP GAJI</h1><p>${monthLabel(row.period)} · ${statusLabel(row.status)}</p></div><div class="salary-brand">manna<span>Print</span></div></header><div class="salary-meta"><p><span>ID Karyawan</span>${e(employee.code)}</p><p><span>Nama</span><strong>${e(employee.name)}</strong></p><p><span>Jabatan</span>${e(employee.position || '—')}</p><p><span>Tanggal slip</span>${today()}</p>${row.paidDate ? `<p><span>Tanggal dibayar</span>${e(row.paidDate)}</p>` : ''}</div><div class="salary-columns"><section><h2>Penghasilan</h2>${['basicSalary', 'allowance', 'attendanceBonus', 'extraBonus', 'overtimePay'].map(field => line(field === 'overtimePay' ? `Lembur (${c.input.overtimeHours} jam)` : labels[field], a[field])).join('')}${c.incomeAdjustment ? line('Penyesuaian penghasilan', c.incomeAdjustment) : ''}${line('Total penghasilan', a.totalIncome)}</section><section><h2>Potongan</h2>${line(`Absen (${c.absenceDays} hari)`, a.absenceDeduction)}${line(`Cuti (${c.input.leaveDays} hari)`, a.leaveDeduction)}${line(`Terlambat (${c.input.lateIncidents} kali + ${c.input.lateExtraMinutes} menit)`, a.lateDeduction)}${line('Potongan lainnya', a.otherDeduction)}${c.deductionAdjustment ? line('Penyesuaian potongan', c.deductionAdjustment) : ''}${line('Total potongan', a.totalDeductions)}</section></div><div class="salary-net"><span>Gaji Bersih</span><strong>${money(a.netSalary)}</strong></div><p class="salary-note">${c.partialMonth ? `Prorata: ${c.prorataDays}/26 hari. ` : ''}Cuti: ${c.input.leaveDays} hari · Sakit dengan surat: ${c.input.sickWithNoteDays} hari · Sakit tanpa surat: ${c.input.sickWithoutNoteDays} hari.${row.notes ? `<br>Catatan: ${e(row.notes)}` : ''}</p><footer><div>Ditransfer / diserahkan kepada<br><strong>${e(employee.accountName || employee.name)}</strong>${employee.bank || employee.accountNumber ? `<p>${e(employee.bank)} ${e(employee.accountNumber)}</p>` : ''}</div><div class="salary-signature">Diterima<br><br><br><strong>${e(employee.name)}</strong></div></footer></article>`;
}
function printSlips(rows) {
  if (!rows.length) return;
  ctx.printDocument.className = 'print-document payroll-print';
  ctx.printDocument.innerHTML = '<style>@media print{@page{size:A4;margin:12mm}}</style>' + rows.map(slipHtml).join('');
  document.body.classList.add('printing');
  window.onafterprint = () => { document.body.classList.remove('printing'); ctx.printDocument.innerHTML = ''; };
  window.print();
}
