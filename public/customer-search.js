import { customerPhone, customerNameKey } from './customer-identity.js';

export const searchName = value => customerNameKey(value).normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const identityKey = (name, phone) => JSON.stringify([customerNameKey(name), customerPhone(phone) || String(phone || '').trim()]);
export const reliablePhone = value => { const n=customerPhone(value);return n.length>=8&&!/^(\d)\1+$/.test(n); };
function distance(a,b) {
  if(Math.abs(a.length-b.length)>3)return 4;
  const d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
  for(let i=0;i<=a.length;i++)d[i][0]=i;for(let j=0;j<=b.length;j++)d[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);
  }return d[a.length][b.length];
}
export function similarName(query,name) {
  const a=searchName(query).slice(0,200),b=searchName(name).slice(0,200);
  if(a.length<4||b.length<4)return false;
  return distance(a,b)<=Math.min(3,Math.max(1,Math.round(Math.max(a.length,b.length)*.25)));
}
export function customerMatch(customer,query='',phone='') {
  const q=searchName(query),number=customerPhone(phone || query),names=[customer.name,...customer.aliases || []],phones=[customer.phone,...customer.phoneAliases || []],exactPhone=reliablePhone(phone)&&phones.some(p=>customerPhone(phone)===customerPhone(p));
  let rank=Infinity,reason='';
  for(const name of names){const n=searchName(name);if(q&&n===q){rank=Math.min(rank,0);reason=name===customer.name?'Nama cocok':'Alias cocok';}else if(q&&n.includes(q)){if(rank>1){rank=1;reason='Nama cocok';}}else if(q.length>=4&&(similarName(q,n)||n.split(' ').some(word=>similarName(q,word)))){if(rank>3){rank=3;reason='Nama mirip';}}}
  if(number.length>=3&&phones.some(p=>customerPhone(p).includes(number))&&rank>2){rank=2;reason='WhatsApp cocok';}
  if(exactPhone){rank=-1;reason='WhatsApp sama';}
  const strong=exactPhone||names.some(name=>q.length>=4&&(searchName(name)===q||similarName(q,name)));
  return {rank,matchReason:reason,strongMatch:strong};
}
