import { discountIsActive } from './campaign-rules.js';

function productCardHtml(product, { e, money, promoPrice }, promotionAt) {
  const name = e(product.name);
  const unit = e(product.unitLabel || '');
  const price = promotionAt ? promoPrice(product, product.price, promotionAt) : product.price;
  const priceHtml = `<span class="catalog-price"><strong>${money(price)}</strong><small title="${unit}">${unit}</small></span>`;
  const titleHtml = `<span class="catalog-card-title"><strong>${name}</strong></span>`;
  const buttonAttrs = `type="button" data-config-product="${e(product.id)}" title="${name}"`;

  if (!promotionAt) {
    return `<button ${buttonAttrs} class="catalog-card">${titleHtml}${priceHtml}</button>`;
  }

  const { type, value } = product.discount;
  const label = type === 'nominal' ? money(value) : `${Number(value)}%`;
  return `<button ${buttonAttrs} class="catalog-card promo-card">
    <span class="catalog-promo-label">Diskon ${label}</span>
    <span class="catalog-card-body">${titleHtml}<s class="catalog-original-price">${money(product.price)}</s>${priceHtml}</span>
  </button>`;
}

export function homeProductsHtml(products, format, at = new Date()) {
  const promotions = [];
  const featured = [];
  for (const product of products) {
    if (product.active === false || product.deletedAt) continue;
    if (discountIsActive(product, at)) {
      promotions.push(productCardHtml(product, format, at));
    } else if (product.featured) {
      featured.push(productCardHtml(product, format));
    }
  }

  const section = (title, cards, className = '') => cards.length
    ? `<section class="catalog-section ${className}"><div class="catalog-heading"><h3>${title}</h3></div><div class="catalog-grid">${cards.join('')}</div></section>`
    : '';
  return section('Produk Sedang Promo', promotions, 'promo-section') + section('Produk Terlaris', featured);
}
