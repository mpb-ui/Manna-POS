import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentDepositAmounts, halfPaymentAmount } from '../public/customer-payment.js';

test('compact payment summary applies available deposit without changing invoice total', () => {
  assert.deepEqual(paymentDepositAmounts({ total: 8000, balance: 5000, received: 3000 }), { outstanding: 8000, available: 5000, used: 5000, due: 3000, remaining: 0, excess: 0 });
  assert.equal(paymentDepositAmounts({ total: 8000, balance: 5000, use: false }).due, 8000);
  assert.equal(paymentDepositAmounts({ total: 8000, balance: 10000 }).used, 8000);
  assert.equal(paymentDepositAmounts({ total: 8000, paid: 2000, balance: 5000 }).due, 1000);
  assert.equal(paymentDepositAmounts({ total: 8000, balance: 5000, planned: 2000 }).used, 2000);
  assert.equal(paymentDepositAmounts({ total: 8000, balance: 0 }).available, 0);
});

test('overpayment confirmation uses remaining invoice after deposit, and excludes PO', () => {
  assert.equal(paymentDepositAmounts({ total: 125000, received: 152000 }).excess, 27000);
  assert.equal(paymentDepositAmounts({ total: 8000, balance: 5000, received: 10000 }).excess, 7000);
  assert.equal(paymentDepositAmounts({ total: 8000, paid: 8000, received: 8000 }).excess, 8000);
  const po = paymentDepositAmounts({ total: 8000, balance: 5000, received: 10000, po: true });
  assert.equal(po.used, 0);
  assert.equal(po.excess, 0);
  assert.equal(po.remaining, 8000);
});

test('DP 50% targets the net invoice and includes existing payments and deposit',()=>{
 assert.equal(halfPaymentAmount(8000,0,0,8000),4000);
 assert.equal(halfPaymentAmount(8000,0,3000,5000),1000);
 assert.equal(halfPaymentAmount(8000,2000,1000,5000),1000);
 assert.equal(halfPaymentAmount(8000,5000,0,3000),0);
 assert.equal(halfPaymentAmount(0,0,0,0),0);
});
