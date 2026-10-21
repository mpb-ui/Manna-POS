# POS product search

The product search is the main action above the catalog in every POS category.
Home replaces the category label Semua and keeps the existing featured products
and active promotions. No catalog, price, inventory or payment data is migrated.

## Behavior

- Search matches product names and category names using a case-insensitive
  substring across all active products, regardless of the selected category.
- Seven result rows are visible on a sufficiently tall screen. Additional matches
  remain available through internal scrolling; a short viewport reduces the
  visible area. The dropdown overlays the catalog without moving it.
- Selecting a result preserves the checkout draft and cart, switches the catalog
  to the product's category, then opens the existing product configurator.
- Arrow keys navigate results, Enter selects, Escape and outside clicks close.
  Ctrl+K / Cmd+K focuses search. Closing a search-opened configurator restores
  search focus on desktop; touch devices do not automatically open the keyboard.
- Each catalog render builds a small local search index. Typing makes no API
  requests. Event listeners are disposed when the POS rerenders or is left.

`public/pos-search.js` owns search behavior and `public/pos-search.css` owns the
scoped Figma styles. Existing cart editing/merging, deposit information,
configurator, blinking feedback and payment flow remain in their existing modules.

## Validation

- `npm test`: 232 tests passed, including global matching beyond seven results,
  inactive product exclusion, case/whitespace handling and empty/no-match queries.
- Authenticated Chromium checks against a temporary in-memory server: 23 matches,
  internal scrolling, keyboard and click selection, category switching, all
  categories, retained cart/customer/deadline/deposit, and no search API requests.
- Layout checks at widths 320, 390, 520, 700, 768, 980, 1024, 1100, 1280, 1440
  and 1920 px; touch-device checks at 390 px. No horizontal overflow or uncaught
  browser errors. Desktop and mobile screenshots inspected.

Browser fixtures are local only. Production data and deployment are unchanged.
