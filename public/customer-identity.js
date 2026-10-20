export function customerPhone(value) {
  let digits=String(value || '').replace(/\D/g,'');
  if(digits.startsWith('62'))digits='0'+digits.slice(2);
  return digits;
}
export const customerNameKey=value=>String(value || '').trim().replace(/\s+/g,' ').toLocaleLowerCase('id');
