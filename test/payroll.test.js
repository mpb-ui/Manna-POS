import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePayroll, workingDays, validDate, periodBounds } from '../public/payroll-domain.js';
import { initializePayroll, saveEmployee, createPayrollPeriod, updatePayroll, changePayrollStatus } from '../lib/payroll.js';
const employee = () => ({ id: 'one', code: 'K003', name: 'Maria', position: '', startDate: '2024-09-01', basicSalary: 2000000, allowance: 150000, attendanceBonus: 250000, overtimeRate: 10000, employmentStatus: 'ACTIVE', active: true, revision: 1 });
const fixture = () => { const state = {}; initializePayroll(state); return state; };
test('payroll penuh mengikuti gaji, tunjangan dan bonus standar', () => {
  const c = calculatePayroll(employee(), '2026-09');
  assert.equal(c.amounts.basicSalary, 2000000); assert.equal(c.amounts.allowance, 150000);
  assert.equal(c.amounts.attendanceBonus, 250000); assert.equal(c.amounts.netSalary, 2400000);
});
test('absen selalu dibagi 26 untuk setiap bulan, tunjangan tidak terpotong', () => {
  for (const period of ['2026-02', '2026-09', '2026-10']) {
    const c = calculatePayroll(employee(), period, { absentDays: 2 });
    assert.equal(c.amounts.absenceDeduction, 153846); assert.equal(c.amounts.basicSalary, 2000000);
    assert.equal(c.amounts.allowance, 150000); assert.equal(c.amounts.attendanceBonus, 0);
    assert.equal(c.amounts.netSalary, 1996154);
  }
});
test('cuti dan sakit dengan surat tidak dipotong; tanpa surat dihitung absen', () => {
  for (const field of ['leaveDays', 'sickWithNoteDays']) {
    const c = calculatePayroll(employee(), '2026-09', { [field]: 1 });
    assert.equal(c.amounts.totalDeductions, 0); assert.equal(c.amounts.attendanceBonus, 0);
  }
  const c = calculatePayroll(employee(), '2026-09', { absentDays: 1, sickWithoutNoteDays: 1 });
  assert.equal(c.absenceDays, 2); assert.equal(c.amounts.absenceDeduction, 153846);
});
test('terlambat 07:51 sampai 08:00 Rp15000, 08:10 Rp25000; total kejadian tidak dobel', () => {
  assert.equal(calculatePayroll(employee(), '2026-09', { lateIncidents: 1 }).amounts.lateDeduction, 15000);
  const c = calculatePayroll(employee(), '2026-09', { lateIncidents: 1, lateExtraMinutes: 10 });
  assert.equal(c.amounts.lateDeduction, 25000); assert.equal(c.amounts.attendanceBonus, 0);
  assert.equal(calculatePayroll(employee(), '2026-09', { lateIncidents: 3, lateExtraMinutes: 20 }).amounts.lateDeduction, 65000);
});
test('lembur pecahan memakai tarif per karyawan dan pembulatan Rupiah', () => {
  assert.equal(calculatePayroll(employee(), '2026-09', { overtimeHours: 1.5 }).amounts.overtimePay, 15000);
  assert.equal(calculatePayroll({ ...employee(), overtimeRate: 15000 }, '2026-09', { overtimeHours: 1.5 }).amounts.overtimePay, 22500);
});
test('prorata Senin–Sabtu, training tanpa tunjangan, bulan pertama tanpa bonus', () => {
  const person = { ...employee(), startDate: '2026-09-16', employmentStatus: 'TRAINING' };
  const c = calculatePayroll(person, '2026-09');
  assert.equal(workingDays('2026-09-16', '2026-09-30'), 13);
  assert.equal(c.amounts.basicSalary, 1000000); assert.equal(c.amounts.allowance, 0); assert.equal(c.amounts.attendanceBonus, 0);
  const manualSchedule = calculatePayroll(person, '2026-09', { prorataDays: 12 });
  assert.equal(manualSchedule.amounts.basicSalary, 923077);
  assert.equal(calculatePayroll(person, '2026-10').amounts.attendanceBonus, 250000);
  assert.equal(calculatePayroll(person, '2026-10').amounts.allowance, 0);
});
test('nominal manual dipertahankan saat jumlah berubah dan reset kembali otomatis', () => {
  const c = calculatePayroll(employee(), '2026-09', { absentDays: 2 }, { absenceDeduction: 100000, attendanceBonus: 50000, allowance: 300000 });
  assert.equal(c.amounts.absenceDeduction, 100000); assert.equal(c.amounts.attendanceBonus, 50000); assert.equal(c.amounts.allowance, 300000);
  assert.equal(calculatePayroll(employee(), '2026-09', { absentDays: 3 }, c.overrides).amounts.absenceDeduction, 100000);
  assert.equal(calculatePayroll(employee(), '2026-09', { absentDays: 3 }, { attendanceBonus: 50000 }).amounts.absenceDeduction, 230769);
});
test('override total dan gaji bersih tetap cocok dengan rincian penyesuaian', () => {
  const c = calculatePayroll(employee(), '2026-09', {}, { totalIncome: 2500000, totalDeductions: 100000, netSalary: 2300000 });
  assert.equal(c.amounts.totalIncome - c.amounts.totalDeductions, c.amounts.netSalary);
  assert.equal(c.amounts.netSalary, 2300000); assert.equal(c.incomeAdjustment, 0); assert.equal(c.deductionAdjustment, 100000);
  const c2 = calculatePayroll(employee(), '2026-09', {}, { netSalary: 2000000 });
  assert.equal(c2.incomeAdjustment, -400000);
});
test('input payroll salah ditolak tanpa NaN atau periode/tanggal palsu', () => {
  for (const input of [{ absentDays: -1 }, { absentDays: 1.2 }, { absentDays: 30 }, { lateExtraMinutes: 1 }, { overtimeHours: Infinity }]) assert.throws(() => calculatePayroll(employee(), '2026-09', input));
  assert.throws(() => calculatePayroll(employee(), '2026-09', {}, { unknown: 1 }));
  assert.throws(() => calculatePayroll(employee(), '2026-09', {}, { basicSalary: NaN }));
  assert.throws(() => periodBounds('2026-13')); assert.equal(validDate('2026-02-30'), false);
  assert.throws(() => calculatePayroll({ ...employee(), startDate: '2026-10-01' }, '2026-09'));
});
test('seed hanya Maria; arsip tidak muncul kembali dan periode tidak menggandakan slip', () => {
  const state = fixture(); assert.deepEqual(state.employees.map(item => item.name), ['Maria']);
  createPayrollPeriod(state, '2026-09', 'Owner'); createPayrollPeriod(state, '2026-09', 'Owner'); assert.equal(state.payrolls.length, 1);
  state.employees[0].deletedAt = 'old'; state.employees[0].active = false;
  initializePayroll(state); assert.equal(state.employees.length, 1);
  createPayrollPeriod(state, '2026-10', 'Owner'); assert.equal(state.payrolls.length, 1);
});
test('snapshot gaji dan riwayat tetap utuh setelah perubahan/hapus karyawan', () => {
  const state = fixture(); const [row] = createPayrollPeriod(state, '2026-09', 'Owner');
  saveEmployee(state, { ...state.employees[0], basicSalary: 3000000, name: 'Maria Baru' }, row.employeeId);
  assert.equal(row.employee.name, 'Maria'); assert.equal(row.calculation.amounts.basicSalary, 2000000);
  state.employees[0].deletedAt = 'old';
  assert.equal(row.employee.basicSalary, 2000000);
});
test('slip final terkunci, dibayar bertanggal, buka kembali menyimpan versi dan alasan', () => {
  const state = fixture(); const [row] = createPayrollPeriod(state, '2026-09', 'Owner');
  updatePayroll(state, row.id, { revision: 1, input: { absentDays: 1 }, overrides: {}, notes: 'Tes' }, 'Owner');
  assert.throws(() => updatePayroll(state, row.id, { revision: 1 }, 'Owner'), /berubah/);
  changePayrollStatus(state, row.id, { revision: 2, action: 'FINALIZE' }, 'Owner');
  assert.throws(() => updatePayroll(state, row.id, { revision: 3 }, 'Owner'), /Buka kembali/);
  assert.throws(() => changePayrollStatus(state, row.id, { revision: 3, action: 'PAY', paidDate: '2026-02-30' }, 'Owner'));
  changePayrollStatus(state, row.id, { revision: 3, action: 'PAY', paidDate: '2026-10-01' }, 'Owner');
  assert.throws(() => changePayrollStatus(state, row.id, { revision: 4, action: 'REOPEN' }, 'Owner'), /alasan/);
  changePayrollStatus(state, row.id, { revision: 4, action: 'REOPEN', reason: 'Koreksi absen' }, 'Owner');
  assert.equal(row.status, 'DRAFT'); assert.equal(row.paidDate, null); assert.equal(row.previousVersions[0].paidDate, '2026-10-01');
  assert.equal(row.previousVersions[0].calculation.amounts.absenceDeduction, 76923);
  updatePayroll(state, row.id, { revision: 5, input: {}, overrides: {}, notes: '' }, 'Owner');
  assert.equal(row.previousVersions[0].calculation.amounts.absenceDeduction, 76923);
});
test('gaji negatif tidak dapat difinalisasi dan training masih bisa ditimpa manual', () => {
  const state = fixture(); const [row] = createPayrollPeriod(state, '2026-09', 'Owner');
  updatePayroll(state, row.id, { revision: 1, input: {}, overrides: { otherDeduction: 1000000000 } }, 'Owner');
  assert.throws(() => changePayrollStatus(state, row.id, { revision: 2, action: 'FINALIZE' }, 'Owner'), /negatif/);
  assert.equal(calculatePayroll({ ...employee(), employmentStatus: 'TRAINING' }, '2026-09', {}, { allowance: 100000 }).amounts.allowance, 100000);
});

test('karyawan baru default lembur Rp10000 dan Gema Rp15000, bisa ditimpa manual', () => {
  const state = fixture();
  const body = { name: 'Gema Bayu Ananda', startDate: '2026-06-16', basicSalary: 2500000, employmentStatus: 'ACTIVE' };
  const gema = saveEmployee(state, body);
  assert.equal(gema.overtimeRate, 15000);
  assert.equal(saveEmployee(state, { ...body, name: 'Gema Manual', overtimeRate: 20000 }).overtimeRate, 20000);
  assert.equal(saveEmployee(state, { ...body, name: 'Karyawan Lain' }).overtimeRate, 10000);
});
