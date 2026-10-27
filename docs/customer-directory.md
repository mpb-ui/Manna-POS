# Central customer directory

- Every successfully saved/edited POS order links to an active customer ID, with or without deposit. Creation and linking share the locked order transaction; failed orders cannot leave an orphan profile. Exact normalized name + full phone reuses one profile under concurrent submissions. Numeric phone entry remains unrestricted.
- Checkout name autocomplete starts at two characters, matches substrings/aliases, and adds conservative typo suggestions (including Baccala/Bacala/Bacalla and Batter Days/Bater Days/Better Days). Names and phone numbers are shown together. Arrow keys, Enter, Escape, click, touch, viewport positioning and stale-response guards are supported. The existing search button remains optional.
- A matching reliable full phone or sufficiently similar full name produces a server-side `CUSTOMER_MATCH_REQUIRED` conflict. The cashier explicitly chooses an existing profile or confirms a separate customer. Last digits are searchable but never establish identity. Shared phone numbers are allowed. Selecting a profile fills its current canonical identity; changing either field clears the selection.
- Customer settings support manual search aliases and notes. Previous names become aliases when renamed; merged profile names and phone numbers remain searchable. Similarity only suggests; it never merges records.
- Total Belanja is the sum of non-cancelled, fully settled confirmed invoices once each, by invoice value, not by payment instalment. Drafts, DP-only orders and deposit top-ups do not contribute. Customer details show paid invoice count, average paid invoice value, active saved orders (including drafts), outstanding confirmed invoices, deposit balance and last paid purchase, with purchase/active/deposit tabs. The directory supports A–Z, total spend, recent purchase, outstanding and deposit filters.

## Owner profile management

Open Master Data → Pelanggan → Detail → Pengaturan Pelanggan.

- Merge: choose the source profile and destination profile, inspect both identities/history counts/combined amounts, provide a reason and explicitly confirm. The backend permits OWNER only, even when ADMIN/Manager/Cashier have other customer permissions. A preview token detects concurrent profile/payment changes, and request IDs make retries idempotent.
- Merge preserves original invoice text/prices/payments and raw deposit/cash receipt snapshots. Order profile links move to the surviving ID; merged IDs form a canonical family, so balances, future spending/cancellation/refunds and history include the family exactly once. Existing ledger entries are not duplicated, rewritten or credited again. The UI computes the combined running balance; printable original proofs retain their original snapshot balances.
- Delete means archive from the active list, never delete financial records. Only Owner can confirm with a reason. Any deposit balance or unsettled invoice (including unpaid drafts) blocks deletion; settle/cancel those records or merge the profile. Archived profiles do not appear as suggestions and cannot receive new deposit operations. Invoice history remains available via Status Order.
- Merges and archives create audit entries. Repeated calls cannot merge or archive twice.

## Existing production data

`customer-directory-v1` saves the raw PostgreSQL state in `app_state_backups` under the same row lock and transaction before migration. Startup stops and rolls back if backup fails. The one-time migration links unlinked orders by exact name + phone or creates separate profiles for distinct identities; shared phones/typo names are never automatically merged. Missing identity and ambiguous exact duplicate profiles remain unlinked and are reported for review. Existing linked IDs, invoice fields, stock, payments and deposit records remain intact. Health exposes directory version and verified backup status.

## Validation

Automated coverage includes fuzzy/substring/alias matching, normalized phones, explicit duplicate decisions, concurrent creation/rollback, paid-only totals, exact legacy linking, ambiguous records, chained merges, immutable ledger/receipt/invoice snapshots, merged wallet spending and cancellation, role restrictions, stale previews, idempotency, archive restrictions, and PostgreSQL backup/rollback/repeatability. Browser QA covers desktop and 390/320 px, keyboard/touch suggestions, actual checkout duplicate resolution, customer tabs, owner merge preview/archive, cashier restrictions, and unchanged stock.
