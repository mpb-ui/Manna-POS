// Shared payroll rules: the server always validates and calculates again before saving.
export const PAYROLL_RULES = Object.freeze({ divisor: 26, lateIncidentRate: 15000, lateMinuteRate: 1000, attendanceBonus: 250000 });
export const PAYROLL_INPUTS = ['absentDays', 'leaveDays', 'sickWithNoteDays', 'sickWithoutNoteDays', 'lateIncidents', 'lateExtraMinutes', 'overtimeHours', 'prorataDays'];
export const PAYROLL_AMOUNTS = ['basicSalary', 'allowance', 'attendanceBonus', 'extraBonus', 'overtimePay', 'absenceDeduction', 'leaveDeduction', 'lateDeduction', 'otherDeduction', 'totalIncome', 'totalDeductions', 'netSalary'];
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function periodBounds(period) {
  if (typeof period !== 'string' || !/^\d{4}-\d{2}$/.test(period)) throw new Error('Pilih bulan payroll yang valid');
  const [year, month] = period.split('-').map(Number);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) throw new Error('Periode payroll tidak valid');
  return { first: `${period}-01`, last: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
}
export function workingDays(start, end) {
  let count = 0;
  for (let day = new Date(`${start}T00:00:00Z`); day <= new Date(`${end}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) if (day.getUTCDay() !== 0) count += 1;
  return count;
}
export function normalizePayrollInputs(values = {}) {
  const input = {};
  for (const field of PAYROLL_INPUTS) {
    if (field === 'prorataDays' && (values[field] == null || values[field] === '')) { input[field] = null; continue; }
    const number = Number(values[field] ?? 0);
    const max = field.endsWith('Days') ? 31 : field === 'overtimeHours' ? 744 : field === 'lateIncidents' ? 31 : 44640;
    if (!Number.isFinite(number) || number < 0 || number > max || (field !== 'overtimeHours' && !Number.isInteger(number))) throw new Error(`Input ${field} tidak valid`);
    input[field] = number;
  }
  return input;
}
export function normalizeOverrides(values = {}) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Penyesuaian payroll tidak valid');
  const result = {};
  for (const [field, value] of Object.entries(values)) {
    if (!PAYROLL_AMOUNTS.includes(field)) throw new Error('Komponen payroll tidak valid');
    if (value == null || value === '') continue;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0 || number > 1000000000) throw new Error(`Nominal ${field} tidak valid`);
    result[field] = number;
  }
  return result;
}
export function calculatePayroll(employee, period, values = {}, manualValues = {}) {
  const { first, last } = periodBounds(period);
  if (!validDate(employee.startDate) || employee.startDate > last) throw new Error('Karyawan belum mulai bekerja pada periode ini');
  const input = normalizePayrollInputs(values); const overrides = normalizeOverrides(manualValues);
  const partialMonth = employee.startDate > first;
  const calendarDays = workingDays(partialMonth ? employee.startDate : first, last);
  const defaultProrataDays = partialMonth ? Math.min(26, calendarDays) : 26;
  const prorataDays = input.prorataDays ?? defaultProrataDays;
  const absenceDays = input.absentDays + input.sickWithoutNoteDays;
  if (input.absentDays + input.leaveDays + input.sickWithNoteDays + input.sickWithoutNoteDays > calendarDays) throw new Error('Jumlah hari absen, cuti, dan sakit melebihi hari kerja periode ini');
  if (input.lateIncidents > calendarDays) throw new Error('Jumlah kejadian terlambat melebihi hari kerja');
  if (input.lateExtraMinutes > 0 && input.lateIncidents === 0) throw new Error('Isi jumlah kejadian terlambat sebelum menit tambahan');
  const eligibleBonus = !partialMonth && prorataDays >= 26 && absenceDays === 0 && input.leaveDays === 0 && input.sickWithNoteDays === 0 && input.lateIncidents === 0;
  const auto = {
    basicSalary: Math.round(employee.basicSalary / 26 * Math.min(26, prorataDays)),
    allowance: employee.employmentStatus === 'TRAINING' ? 0 : employee.allowance,
    attendanceBonus: eligibleBonus ? employee.attendanceBonus : 0,
    extraBonus: 0, overtimePay: Math.round(input.overtimeHours * employee.overtimeRate),
    absenceDeduction: Math.round(employee.basicSalary / 26 * absenceDays), leaveDeduction: 0,
    lateDeduction: input.lateIncidents * 15000 + input.lateExtraMinutes * 1000, otherDeduction: 0
  };
  const amounts = Object.fromEntries(Object.entries(auto).map(([field, value]) => [field, overrides[field] ?? value]));
  const incomeSubtotal = ['basicSalary', 'allowance', 'attendanceBonus', 'extraBonus', 'overtimePay'].reduce((sum, field) => sum + amounts[field], 0);
  const deductionSubtotal = ['absenceDeduction', 'leaveDeduction', 'lateDeduction', 'otherDeduction'].reduce((sum, field) => sum + amounts[field], 0);
  auto.totalIncome = incomeSubtotal; auto.totalDeductions = deductionSubtotal;
  amounts.totalIncome = overrides.totalIncome ?? incomeSubtotal;
  amounts.totalDeductions = overrides.totalDeductions ?? deductionSubtotal;
  auto.netSalary = amounts.totalIncome - amounts.totalDeductions;
  const netAdjustment = overrides.netSalary === undefined ? 0 : overrides.netSalary - auto.netSalary;
  // A manual net value appears as an explicit income adjustment, keeping the slip reconciled.
  amounts.totalIncome += netAdjustment;
  amounts.netSalary = amounts.totalIncome - amounts.totalDeductions;
  return { input, overrides, auto, amounts, incomeAdjustment: amounts.totalIncome - incomeSubtotal, deductionAdjustment: amounts.totalDeductions - deductionSubtotal, netAdjustment, partialMonth, calendarDays, defaultProrataDays, prorataDays, absenceDays, eligibleBonus, rules: { ...PAYROLL_RULES, overtimeRate: employee.overtimeRate } };
}
