// Keep the stored reason and historical timeline intact; use the new wording
// consistently in live UI, including legacy orders.
export function holdLabel(reason) {
  return /^menunggu (approval(?: customer)?|acc(?: customer)?)$/i.test(String(reason || '').trim())
    ? 'Menunggu ACC' : String(reason || '');
}
