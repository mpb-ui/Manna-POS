import { configurationSection } from './product-configurator.js';
import { groupFinishingTypes } from './finishing-types.js';
import { finishingPriceForUnits, finishingQuantitySource, finishingUnit, finishingUnitsPerProduct, totalFinishingUnits } from './finishing-pricing.js';

const money = value => 'Rp' + Number(value).toLocaleString('id-ID', {maximumFractionDigits:0});
const number = value => Number(value).toLocaleString('id-ID', {maximumFractionDigits:4});
const isA3Print = product => ['paper', 'sticker'].includes(product.a3Kind);
const cardPrice = (finish, product, rate) => rate ? money(rate) + (isA3Print(product) ? '' : ` /${finishingUnit(finish)}`) : '';
const isTrim = finish => Number(finish.price) === 0 && (['cut','fin-out-cut'].includes(finish.id) || /^Potong Pas Gambar$/i.test(finish.name));
const isAllowance = finish => Number(finish.price) === 0 && (finish.id === 'fin-out-extra' || /^Lebihan(?: Saja| 5 cm)?$/i.test(finish.name));

function initialUnits(finish) {
  if (finish.rule === 'point') return 4;
  if (['top_bottom', 'left_right'].includes(finish.rule) || finish.id === 'fin-out-join') return 2;
  return 1;
}

function finishingDetails(finish, product, h) {
  const id = h(finish.id), label = h(finish.name);
  const source = finishingQuantitySource(finish, product), unit = finishingUnit(finish);
  const manual = source === 'manual';
  const measured = ['m lari', 'm²'].includes(unit);
  const hasPrice = Number(finish.price) > 0 || finish.priceTiers?.some(tier => tier.price > 0);
  const hasQuantity = hasPrice && (!isA3Print(product) || manual);
  const value = `<input id="finish-qty-${id}" type="number" data-finish-qty="${id}" data-finish-increment="${unit === 'm²' ? 0.1 : 1}" min="${!manual ? 0.0001 : measured ? 0.01 : 1}" step="${measured || !manual ? 'any' : '1'}" inputmode="${measured ? 'decimal' : 'numeric'}" value="${initialUnits(finish)}" aria-label="Jumlah ${label} per lembar (${unit})" ${manual ? 'required' : 'readonly'}>`;
  const quantity = hasQuantity ? manual
    ? `<div class="qty-stepper"><button type="button" data-print-step="-1" aria-label="Kurangi ${label}"></button>${value}<button type="button" data-print-step="1" aria-label="Tambah ${label}"></button></div>`
    : `<div class="qty-stepper print-calculated-qty">${value}</div>` : '';
  const summary = isA3Print(product) && hasPrice ? `<details class="wholesale-prices print-finishing-wholesale">
    <summary><span class="wholesale-current">Harga Satuan <strong data-print-rate></strong> / ${unit}</span><span class="wholesale-expand">Lihat semua <span class="wholesale-chevron ui-chevron" aria-hidden="true"></span></span></summary>
    <table aria-label="Harga ${label}"><thead><tr><th scope="col">JUMLAH ${unit}</th><th scope="col">HARGA SATUAN</th></tr></thead>
      <tbody><tr><td>Normal</td><td>${money(finish.price)}</td></tr>${(finish.priceTiers || []).map(tier => `<tr><td>${number(tier.min)}${tier.max == null ? '+' : '–' + number(tier.max)}</td><td>${money(tier.price)}</td></tr>`).join('')}</tbody></table></details>` : '';
  return `<div class="print-finish-detail hidden" data-print-finish-detail="${id}">${summary}
    ${hasQuantity ? `<div class="print-finish-units"><label for="finish-qty-${id}">${label}</label>${quantity}<b data-print-subtotal></b></div>` : ''}
    <button type="button" class="text-button print-finish-note" data-print-note aria-expanded="false">Catatan ${label}</button>
    <label class="print-finish-note-field hidden"><span class="visually-hidden">Catatan ${label}</span>
    <input type="text" data-finish-note="${id}" placeholder="Catatan khusus ${label}"></label>
  </div>`;
}

export function printFinishingSections(product, start, h, {outdoor = false} = {}) {
  const finishes = product.finishing || [];
  const a3 = isA3Print(product);
  const allowance = outdoor && finishes.find(isAllowance);
  const groups = outdoor ? [{id:'OUTDOOR', label:'Finishing', items:finishes}]
    : groupFinishingTypes(finishes).sort((a, b) => a3 ? Number(b.id === 'LAMINATING') - Number(a.id === 'LAMINATING') : 0);
  if (!finishes.length) return {html:'', next:start};
  const sections = groups.map((group, index) => {
    const exclusive = a3 || group.id === 'CUTTING';
    const none = !outdoor && (a3 || group.id !== 'CUTTING') ? `<button type="button" class="print-finish-option" data-print-no-finish aria-pressed="true">
      <span>Tanpa ${group.label}</span><i class="print-finish-mark" aria-hidden="true"></i></button>` : '';
    const cards = group.items.map(finish => {
      const id = h(finish.id), isExtra = finish === allowance;
      const label = isExtra ? 'Lebihan Saja' : h(finish.name);
      const trim = outdoor && isTrim(finish);
      return `<label class="print-finish-choice">
        <input type="checkbox" id="${isExtra ? 'print-with-allowance' : `f-${id}`}" value="${id}" data-print-finish ${trim ? 'data-print-trim' : ''}>
        <span class="print-finish-option"><span><strong>${label}</strong><small data-print-price ${finish.price ? '' : 'hidden'}>${cardPrice(finish, product, finish.price)}</small></span>
        <i class="print-finish-mark ${exclusive || trim || isExtra ? '' : 'square'}" aria-hidden="true"></i></span></label>`;
    });
    const content = `<div data-print-finish-group ${exclusive ? 'data-exclusive' : ''}>
      <div class="print-finish-options" role="group" aria-label="${group.label}">${none}${cards.join('')}</div>
      ${group.items.map(finish => finishingDetails(finish, product, h)).join('')}
      </div>`;
    return configurationSection(start + index, group.label.toUpperCase(), content, {className:'print-finish-section'});
  });
  return {html:`<div id="finishing-grid" class="print-finishing-grid">${sections.join('')}</div>`, next:start + groups.length};
}

export function readPrintFinishings(grid, product, dimensions, quantity, preserveLegacyUnits) {
  const finishing = [];
  let total = 0, error = '';
  for (const choice of grid.querySelectorAll('[data-print-finish]')) {
    const finish = product.finishing.find(item => item.id === choice.value);
    if (!finish) continue;
    const row = grid.querySelector(`[data-print-finish-detail="${CSS.escape(finish.id)}"]`);
    const input = row.querySelector('[data-finish-qty]');
    const priceLabel = choice.nextElementSibling.querySelector('[data-print-price]');
    const source = finishingQuantitySource(finish, product);
    const legacyUnits = Number(choice.dataset.legacyUnits);
    const legacy = preserveLegacyUnits && Number.isFinite(legacyUnits)
      && (source !== 'manual' || !input || Number(input.value) === legacyUnits / quantity);
    const unitsPerProduct = legacy ? legacyUnits / quantity : finishingUnitsPerProduct(finish, product, dimensions, input?.value ?? 1);
    const units = legacy ? legacyUnits : totalFinishingUnits(unitsPerProduct, quantity);
    const chosen = choice.checked;
    const rate = chosen ? finishingPriceForUnits(finish, units) : Number(finish.price);
    priceLabel.hidden = !rate;
    priceLabel.textContent = cardPrice(finish, product, rate);
    row.classList.toggle('hidden', !chosen);
    if (!chosen) continue;
    if (input && source !== 'manual') input.value = Number.isFinite(unitsPerProduct) ? Number(unitsPerProduct.toFixed(4)) : '';
    if (!(units > 0 && Number.isFinite(units)) || source === 'manual' && input && !input.validity.valid) {
      error ||= `Jumlah ${finish.name} tidak valid`;
    }
    const subtotal = Number.isFinite(units) ? Math.round(units * rate) : 0;
    const totalLabel = row.querySelector('[data-print-subtotal]');
    if (totalLabel) totalLabel.textContent = subtotal ? money(subtotal) : '';
    const rateLabel = row.querySelector('[data-print-rate]');
    if (rateLabel) rateLabel.textContent = money(rate);
    total += subtotal;
    finishing.push({id:finish.id, units, ...(legacy ? {} : {unitsPerProduct}), note:row.querySelector('[data-finish-note]').value.trim()});
  }
  for (const button of grid.querySelectorAll('[data-print-no-finish]')) {
    const active = !button.closest('[data-print-finish-group]').querySelector('[data-print-finish]:checked');
    button.setAttribute('aria-pressed', String(active));
  }
  return {finishing, total, error};
}

export function restorePrintFinishings(grid, line) {
  for (const finish of line.finishing || []) {
    const choice = grid.querySelector(`[data-print-finish][value="${CSS.escape(finish.id)}"]`);
    if (!choice) continue;
    choice.checked = true;
    if (finish.unitsPerProduct == null) choice.dataset.legacyUnits = finish.units;
    const row = grid.querySelector(`[data-print-finish-detail="${CSS.escape(finish.id)}"]`);
    const input = row.querySelector('[data-finish-qty]');
    if (input) {
      const units = finish.unitsPerProduct ?? Number(finish.units) / (Number(line.quantity) || 1);
      if (units > 0) {
        input.value = units;
        if (!Number.isInteger(units)) input.step = 'any';
        if (units < Number(input.min)) input.min = units;
      }
    }
    const note = row.querySelector('[data-finish-note]');
    note.value = finish.note || '';
    if (note.value) {
      note.parentElement.classList.remove('hidden');
      row.querySelector('[data-print-note]').setAttribute('aria-expanded', 'true');
    }
  }
}

export function bindPrintFinishings(grid, scope, update) {
  const allowance = scope.querySelector('#allowance');
  const allowanceChoice = grid.querySelector('#print-with-allowance');
  const trim = grid.querySelector('[data-print-trim]');
  if (allowance) {
    const syncAllowance = () => {
      const enabled = Number(allowance.value) > 0;
      if (allowanceChoice) allowanceChoice.checked = enabled;
      if (enabled && trim) trim.checked = false;
    };
    if (Number(allowance.value) > 0) syncAllowance();
    allowance.addEventListener('input', () => {
      syncAllowance();
    });
  }
  grid.addEventListener('input', event => { if (event.target.matches('[data-finish-qty]')) update(); });
  grid.addEventListener('change', event => {
    const choice = event.target;
    if (choice === allowanceChoice && allowance) {
      if (choice.checked) { if (trim) trim.checked = false; allowance.focus(); }
      else allowance.value = 0;
    } else if (choice.matches('[data-print-finish]')) {
      delete choice.dataset.legacyUnits;
      if (choice.checked) {
        if (choice === trim && allowance) {
          if (allowanceChoice) allowanceChoice.checked = false;
          allowance.value = 0;
        }
        choice.closest('[data-exclusive]')?.querySelectorAll('[data-print-finish]:checked').forEach(input => {
          if (input !== choice) input.checked = false;
        });
      }
    }
    update();
  });
  grid.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-print-no-finish')) {
      button.closest('[data-print-finish-group]').querySelectorAll('[data-print-finish]').forEach(input => { input.checked = false; });
    } else if (button.hasAttribute('data-print-note')) {
      const field = button.nextElementSibling;
      const visible = !field.classList.toggle('hidden');
      button.setAttribute('aria-expanded', String(visible));
      if (visible) field.querySelector('input').focus();
      return;
    } else if (button.hasAttribute('data-print-step')) {
      const input = button.parentElement.querySelector('input');
      const step = Number(input.dataset.finishIncrement) * Number(button.dataset.printStep);
      input.value = Math.max(Number(input.min), Number(((input.valueAsNumber || 0) + step).toFixed(4)));
    }
    update();
  });
}
