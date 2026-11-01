# POS catalog controls

- Product Information shows a required **Tab Print A3+** choice (Kertas, Sticker,
  Produk Jadi) only when the category key is `print-a3`. Category renaming keeps
  the key. The selected tab is saved with the rest of both editor tabs.
- **Tampilkan di Sering Dipilih** is independent from **Tampilkan di Home** and
  Campaign. At most four non-archived products can be selected per A3 tab,
  including inactive selections. Only active products appear in POS. The editor
  displays the count and disables an unchecked toggle when the tab is full.
  The backend checks again inside the same transaction, including concurrent
  saves, category/tab changes and reactivation. Archiving a product frees its slot.
- Initial shortcuts retain one representative product of each previously hardcoded
  paper/sticker family. The initialization runs once, adds presentation fields,
  and does not change SKU identities, prices, stock, or historical order items.
  Disabling every shortcut stays disabled. Old unclassified A3 products continue
  to appear under Kertas until explicitly assigned a tab in the editor.
- New products are individual dropdown choices. Existing paper/sticker families
  keep their variant and print-side configuration. Moving a legacy product to a
  different tab clears its old family metadata; historical orders remain snapshots.
- POS uses one global product search across categories, including name, category,
  SKU and barcode. ATK group tabs and quantity controls remain available. Stempel,
  Akrilik and ATK no longer render their former local search input.
- Category headings use the Home heading's shared typography on desktop/mobile.
  A3 dropdown and Konfigurasi button have a 12 px gap.
- Produk Jadi uses the source-material picker's dialog style and A–Z ordering,
  without a search field. The underlying select/change contract is preserved;
  selecting an item opens its configurator. Material-source pickers retain search.
  The picker supports arrows, Enter, Escape, outside click, and mobile scrolling.
  It closes if its source control is removed, including during logout/re-render.

Validation covers API persistence, concurrent fourth/fifth selections, rename/tab
compatibility, and unchanged historical orders/inventory. Browser QA checks all
category headings, editor fields, dropdown selection, 12 px spacing, shared source
picker behavior, keyboard controls, and mobile layouts at 390/320 px.
