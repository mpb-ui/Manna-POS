import { customerRoots } from './customer-directory.js';
export function depositReport(state,from,to) {
 const {customers,roots}=customerRoots(state);
 const rows=(state.depositLedger || []).filter(m=>new Date(m.createdAt)>=from&&new Date(m.createdAt)<=to);
 const balances=new Map();for(const m of state.depositLedger || [])if(new Date(m.createdAt)<=to)balances.set(m.customerId,(balances.get(m.customerId)||0)+m.amount);
 const sum=predicate=>rows.filter(predicate).reduce((n,m)=>n+Math.abs(m.amount),0);
 return {incoming:sum(m=>['EXCESS','CANCEL_CREDIT'].includes(m.kind)),used:sum(m=>m.kind==='USE'),refunds:sum(m=>m.kind==='REFUND'),restored:sum(m=>m.kind==='PAYMENT_REVERSAL'),adjustments:rows.filter(m=>['OPENING','CORRECTION'].includes(m.kind)).reduce((n,m)=>n+m.amount,0),balance:[...balances.values()].reduce((n,balance)=>n+balance,0),rows:rows.toReversed().slice(0,100).map(m=>({...m,customer:customers.get(roots.get(m.customerId))?.name || 'Pelanggan'}))};
}
