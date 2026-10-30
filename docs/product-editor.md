# Product editor

Add/Edit Product uses one 570px dialog with Information and Production tabs. Both tabs share a draft and a single atomic product save. Only the body scrolls; the footer stays visible, with Delete on the left in Edit mode. Narrow screens place labels above controls.

The existing featured flag is labelled “Tampilkan di Home”. Campaign Pilihan is independent. Machines use a single select. Sale units still determine all pricing and dimensional rules; “Varian Ukuran” is a display label and does not infer physical dimensions. Existing fixed sizes, template dimensions, roll width rules, paper calculator profiles, DTF packages and stock timing are retained.

The catalog has shared `variantTypes` and `variantOptionTypes`, seeded additively with Varian Bahan / Varian Ukuran / Sisi Cetak and Sisi Cetak respectively. The existing product master permission controls additions. Labels are validated and duplicates rejected. Stable option IDs keep pricing and material settings attached through renames and edits.

Products saved by this editor carry `productEditorVersion: 1`. Each variant, or each variant × option combination, owns its price, HPP, wholesale tiers, material sources and availability. An explicitly empty source array means no source material is consumed. Legacy catalogs retain their previous additive common + variant semantics until edited; the editor combines their existing sources into each card, preserving usage when saved to version 1. Existing order snapshots are not migrated or repriced. Fixed-size source overrides keep their established fallback rules.

“Produk Tersedia” controls a variant/combination. Inactive choices are hidden in the POS and rejected by server pricing. HPP is captured on new line snapshots as `baseCostTotal` for the existing report fallback when material cost is unavailable; material-cost precedence remains unchanged. This new cost field is omitted from non-cost order/quote responses and nested catalog HPP is omitted from unauthorized accounts.

“+ Harga Grosir” adds a tier directly. No rows means wholesale is off. From the second visible pricing card onward, “Pakai jumlah grosir yang sama” copies only min/max from the first visible card, leaving prices blank. It copies once rather than linking future edits. Existing destination tiers require an overwrite confirmation. Measured tiers preserve the existing continuous-threshold rules and quantity tiers preserve inclusive min/max ranges.

Promo Produk expands type, value and two date-only fields. Dates cover 00:00 through 23:59:59.999 WITA inclusively, including single-day periods. Existing timestamp-based API clients remain supported. Finishing options remain category-filtered and grouped into Cutting, Laminating and Finishing using real catalog prices.

Verification includes domain/API tests for full-day boundaries, type reuse and permissions, inactive choices, combination-only material usage, price and HPP snapshots, wholesale grouping/copy, no-source products, failed-save rollback, unchanged invoice history and print-time stock. Browser QA covers creating/editing/saving from either tab, live titles, copied prices left blank, shared types, minimum quantities, POS options, material selection, measured tiers, date controls, asset loading and sticky footers at 1440/390/320px.
