// Display classification only: pricing rule, material use and stock timing are independent.
export const FINISHING_TYPES = [
  { id:'CUTTING', label:'Cutting' },
  { id:'LAMINATING', label:'Laminating' },
  { id:'FINISHING', label:'Finishing' }
];
export function finishingType(finishing = {}) {
  if (FINISHING_TYPES.some(type => type.id === finishing.type)) return finishing.type;
  // Existing entries get an initial group. A manually saved type always wins,
  // including after the finishing is renamed.
  const name = `${finishing.name || ''} ${finishing.id || ''}`.toLowerCase();
  if (/lamina|(?:^|[-\s])lam(?:[-\s]|$)/.test(name)) return 'LAMINATING';
  if (/cut|potong|pisau|rounded|sudut\s+bulat/.test(name)) return 'CUTTING';
  return 'FINISHING';
}
export function validateFinishingType(value, fallback = 'FINISHING') {
  if (value === undefined) return fallback;
  if (!FINISHING_TYPES.some(type => type.id === value)) throw new Error('Pilih tipe Cutting, Laminating, atau Finishing');
  return value;
}
export const finishingTypeLabel = finishing => FINISHING_TYPES.find(type => type.id === finishingType(finishing)).label;
export function groupFinishingTypes(finishings) {
  return FINISHING_TYPES.map(type => ({...type,items:finishings.filter(item=>finishingType(item)===type.id)})).filter(group=>group.items.length);
}
export function initializeFinishingTypes(state) {
  for (const finishing of state.finishings || []) finishing.type = finishingType(finishing);
  for (const product of state.products || []) for (const finishing of product.finishing || []) finishing.type = finishingType(finishing);
  // Historical order snapshots are deliberately outside this catalog operation.
}
