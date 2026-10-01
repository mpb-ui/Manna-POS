import crypto from 'node:crypto';
import { calculatePayroll, periodBounds, validDate } from '../public/payroll-domain.js';
const stamp = () => new Date().toISOString();
export function initializePayroll(state) {
  if (!Array.isArray(state.employees)) state.employees = [{ id: 'emp-maria', code: 'K003', name: 'Maria', position: '', startDate: '2024-09-01', basicSalary: 2000000, allowance: 0, attendanceBonus: 250000, overtimeRate: 10000, employmentStatus: 'ACTIVE', bank: '', accountNumber: '', accountName: '', active: true, revision: 1, createdAt: stamp(), updatedAt: stamp() }];
  state.payrolls ||= [];
}
export function saveEmployee(state, body, id = null) {
  const current = id ? state.employees.find(item => item.id === id && !item.deletedAt) : null;
  if (id && !current) throw new Error('Karyawan tidak ditemukan');
  if (current && Number(body.revision) !== current.revision) throw new Error('Data karyawan berubah. Muat ulang sebelum menyimpan.');
  const clean = (field, max = 100) => { const value = String(body[field] ?? '').trim(); if (value.length > max) throw new Error('Teks karyawan terlalu panjang'); return value; };
  const money = field => { const value = Number(body[field] ?? (field === 'attendanceBonus' ? 250000 : field === 'overtimeRate' ? (/^gema(?:\s|$)/i.test(String(body.name || '').trim()) ? 15000 : 10000) : 0)); if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) throw new Error('Nominal gaji tidak valid'); return value; };
  const name = clean('name'); const position = clean('position');
  if (!name || !validDate(body.startDate) || body.startDate < '2000-01-01' || body.startDate > '2100-12-31') throw new Error('Nama dan tanggal mulai kerja wajib valid');
  if (!['ACTIVE', 'TRAINING'].includes(body.employmentStatus)) throw new Error('Pilih status Aktif atau Training');
  const code = clean('code') || current?.code || `K${String(Math.max(0, ...state.employees.map(item => Number(item.code.replace(/^K/, '')) || 0)) + 1).padStart(3, '0')}`;
  if (state.employees.some(item => item.id !== id && item.code.toLowerCase() === code.toLowerCase())) throw new Error('ID karyawan sudah digunakan');
  const data = { id: id || `emp-${crypto.randomUUID()}`, code, name, position, startDate: body.startDate, basicSalary: money('basicSalary'), allowance: money('allowance'), attendanceBonus: money('attendanceBonus'), overtimeRate: money('overtimeRate'), employmentStatus: body.employmentStatus, active: body.active !== false, bank: clean('bank'), accountNumber: clean('accountNumber'), accountName: clean('accountName'), revision: (current?.revision || 0) + 1, createdAt: current?.createdAt || stamp(), updatedAt: stamp() };
  if (current) Object.assign(current, data); else state.employees.push(data);
  return data;
}
export function createPayrollPeriod(state, period, actor) {
  const { last } = periodBounds(period);
  for (const employee of state.employees.filter(item => item.active !== false && !item.deletedAt && item.startDate <= last)) {
    if (state.payrolls.some(item => item.employeeId === employee.id && item.period === period)) continue;
    const snapshot = structuredClone(employee); const calculation = calculatePayroll(snapshot, period);
    state.payrolls.push({ id: `pay-${crypto.randomUUID()}`, employeeId: employee.id, period, employee: snapshot, input: calculation.input, overrides: {}, calculation, notes: '', status: 'DRAFT', revision: 1, paidDate: null, createdAt: stamp(), updatedAt: stamp(), events: [{ at: stamp(), actor, action: 'DRAFT_CREATE' }], previousVersions: [] });
  }
  return state.payrolls.filter(item => item.period === period);
}
export function findPayroll(state, id, revision) {
  const row = state.payrolls.find(item => item.id === id);
  if (!row) throw new Error('Slip gaji tidak ditemukan');
  if (Number(revision) !== row.revision) throw new Error('Slip berubah. Muat ulang sebelum menyimpan.');
  return row;
}
export function updatePayroll(state, id, body, actor) {
  const row = findPayroll(state, id, body.revision);
  if (row.status !== 'DRAFT') throw new Error('Buka kembali slip sebelum mengubah nilai');
  const calculation = calculatePayroll(row.employee, row.period, body.input, body.overrides);
  const notes = String(body.notes || '').trim(); if (notes.length > 2000) throw new Error('Catatan maksimal 2000 karakter');
  row.input = calculation.input; row.overrides = calculation.overrides; row.calculation = calculation; row.notes = notes;
  row.revision += 1; row.updatedAt = stamp(); row.events.push({ at: stamp(), actor, action: 'DRAFT_UPDATE' });
  return row;
}
export function changePayrollStatus(state, id, body, actor) {
  const row = findPayroll(state, id, body.revision); const action = body.action;
  if (action === 'FINALIZE') {
    if (row.status !== 'DRAFT') throw new Error('Hanya draft yang dapat difinalisasi');
    row.calculation = calculatePayroll(row.employee, row.period, row.input, row.overrides);
    if (row.calculation.amounts.netSalary < 0) throw new Error('Gaji bersih tidak boleh negatif saat finalisasi');
    row.status = 'FINAL';
  } else if (action === 'PAY') {
    if (row.status !== 'FINAL') throw new Error('Finalisasi slip sebelum mencatat pembayaran');
    if (!validDate(body.paidDate)) throw new Error('Isi tanggal pembayaran yang valid');
    row.status = 'PAID'; row.paidDate = body.paidDate;
  } else if (action === 'REOPEN') {
    if (!['FINAL', 'PAID'].includes(row.status)) throw new Error('Slip masih berupa draft');
    const reason = String(body.reason || '').trim();
    if (!reason || reason.length > 500) throw new Error('Isi alasan membuka kembali slip (maksimal 500 karakter)');
    row.previousVersions.push({ revision: row.revision, savedAt: stamp(), status: row.status, paidDate: row.paidDate, input: structuredClone(row.input), overrides: structuredClone(row.overrides), calculation: structuredClone(row.calculation), notes: row.notes });
    row.status = 'DRAFT'; row.paidDate = null;
    row.events.push({ at: stamp(), actor, action: 'REOPEN_REASON', reason });
  } else throw new Error('Tindakan slip tidak valid');
  row.revision += 1; row.updatedAt = stamp(); row.events.push({ at: stamp(), actor, action });
  return row;
}
