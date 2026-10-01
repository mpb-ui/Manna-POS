import { saveEmployee, createPayrollPeriod, findPayroll, updatePayroll, changePayrollStatus } from './payroll.js';
import { calculatePayroll, periodBounds } from '../public/payroll-domain.js';
export function registerPayrollRoutes(app, store, admin, audit) {
  const route = (method, path, handler) => app[method](path, admin, async (req, res, next) => { try { res.json(await handler(req)); } catch (error) { next(error); } });
  route('get', '/api/employees', async () => (await store.read()).employees);
  for (const [method, path] of [['post', '/api/employees'], ['put', '/api/employees/:id']]) route(method, path, req => store.mutate(state => {
    const employee = saveEmployee(state, req.body, req.params.id);
    audit(state, req.user, req.params.id ? 'EMPLOYEE_UPDATE' : 'EMPLOYEE_CREATE', 'Memperbarui data karyawan', { employeeId: employee.id });
    return employee;
  }));
  route('delete', '/api/employees/:id', req => store.mutate(state => {
    const employee = state.employees.find(item => item.id === req.params.id && !item.deletedAt);
    if (!employee) throw new Error('Karyawan tidak ditemukan');
    if (Number(req.body?.revision) !== employee.revision) throw new Error('Data karyawan berubah. Muat ulang sebelum menghapus.');
    employee.active = false; employee.deletedAt = new Date().toISOString(); employee.revision += 1;
    audit(state, req.user, 'EMPLOYEE_ARCHIVE', 'Mengarsipkan karyawan; riwayat slip tetap tersimpan', { employeeId: employee.id });
    return { ok: true };
  }));
  route('get', '/api/payrolls', async req => {
    if (req.query.period) periodBounds(req.query.period);
    return (await store.read()).payrolls.filter(row => (!req.query.period || row.period === req.query.period) && (!req.query.employeeId || row.employeeId === req.query.employeeId));
  });
  route('post', '/api/payrolls/period', req => store.mutate(state => {
    const result = createPayrollPeriod(state, req.body.period, req.user.name);
    audit(state, req.user, 'PAYROLL_PERIOD_CREATE', 'Menyiapkan payroll bulanan', { period: req.body.period });
    return result;
  }));
  route('post', '/api/payrolls/preview', async req => {
    const state = await store.read(); const row = findPayroll(state, req.body.id, req.body.revision);
    return calculatePayroll(row.employee, row.period, req.body.input, req.body.overrides);
  });
  route('put', '/api/payrolls/:id', req => store.mutate(state => {
    const row = updatePayroll(state, req.params.id, req.body, req.user.name);
    audit(state, req.user, 'PAYROLL_UPDATE', 'Menyimpan draft slip gaji', { payrollId: row.id });
    return row;
  }));
  route('patch', '/api/payrolls/:id/status', req => store.mutate(state => {
    const row = changePayrollStatus(state, req.params.id, req.body, req.user.name);
    audit(state, req.user, `PAYROLL_${req.body.action}`, 'Memperbarui status slip gaji', { payrollId: row.id });
    return row;
  }));
  route('post', '/api/payrolls/period/finalize', req => store.mutate(state => {
    periodBounds(req.body.period);
    const rows = state.payrolls.filter(row => row.period === req.body.period && row.status === 'DRAFT');
    if (!rows.length) throw new Error('Tidak ada draft untuk difinalisasi');
    // Require the exact revisions seen by the reviewer, including the complete draft set.
    const expected = req.body.revisions;
    if (!Array.isArray(expected) || expected.length !== rows.length || new Set(expected.map(item => item.id)).size !== rows.length || rows.some(row => !expected.some(item => item.id === row.id && item.revision === row.revision))) throw new Error('Daftar payroll berubah. Muat ulang dan periksa kembali.');
    rows.forEach(row => changePayrollStatus(state, row.id, { revision: row.revision, action: 'FINALIZE' }, req.user.name));
    audit(state, req.user, 'PAYROLL_PERIOD_FINALIZE', 'Memfinalisasi payroll bulanan', { period: req.body.period });
    return state.payrolls.filter(row => row.period === req.body.period);
  }));
}
