# Reports foundation

The main report has five tabs: Penjualan, Mutasi Kas, Kategori, Produk, Mesin.
Three global filters apply to all five tabs and their summaries: inclusive WITA
calendar range, payment status at the end of that range, and payment method.
The default range is this month through today. A custom range can be one day.
Insights/forecasts are intentionally deferred.

## Time and filter rules

- Sales use invoice creation date. Include paid, partially paid and wholly unpaid
  invoices. Amounts are after discounts. Invoice discount applied on a later WITA
  date is a separate dated discount correction, without changing quantities/HPP.
- Cash uses the actual receipt/refund date, including payments against older
  invoices. DP and settlement are separate receipt rows. A PO document is not
  received cash. The PO document list remains under Laporan Lain.
- Payment status has two choices: Belum Lunas (also zero paid) and Lunas. Sum the
  dated payment ledger through the end of the selected day, not current balance.
  Free invoices additionally require confirmation as of that date.
- A method filter selects the entire invoice if that method paid any part of it
  by period end. Cash rows include only that actual method's receipts/refunds.
  Thus filtering Tunai can show a Rp100k mixed invoice and only its Rp50k cash.
- The Piutang summary/list is the cumulative outstanding balance of invoices
  created through the end date, not just invoices created after the start date.
  The sales row's receivable is only that invoice's outstanding balance.
- Deposit top ups are received cash. Applying existing deposit is settlement of
  an invoice, not new cash. Cash events without invoices have no invoice payment
  status; they appear only with Semua pembayaran. The table explains this.
- Role permissions and today/own scopes apply server-side. Hidden money/cost
  values are omitted; monetary filters are unavailable without reports.money.

## Cancellation

Hapus Transaksi is available to Owner from the sale row's ellipsis. It uses the
existing atomic cancellation flow, not physical record deletion. The confirmation
shows invoice, reason, turnover correction, remaining receivable, restored used
wallet amount, and Refund versus Jadikan Deposit cash effects. A version/amount
check inside the store lock rejects a stale preview (409). Request IDs preserve
idempotency. The same function retains the original payment and stock rules.

The original sale remains on its invoice date, and a negative sale is recorded on
cancelledAt. A September sale canceled in October does not disappear from the
September report. Rankings carry the same negative correction and quantity.
Original payments remain on their receipt dates. Refund creates a negative cash
receipt at refund time; Jadikan Deposit leaves cash in the shop and credits the
customer wallet. Neither action automatically restores physical stock.
For a canceled invoice, its payment-status filter describes settlement immediately
before cancellation; its outstanding receivable is zero after cancellation.

## Ranking, export, and compatibility

- Rankings default to net sales, with optional invoice count/name sorting.
  Products also offer quantity sorting. Display billed square metres/linear
  metres or the actual sale unit. Mixed units are never presented as one unit.
- New order lines snapshot category, machine IDs/names and sale unit. Catalog
  edits do not change their classifications. Old lines retain their recorded
  category/unit and fall back to current catalog machine mapping if absent.
- Old products linked to several machines divide line revenue between machines
  in integer rupiah; uncategorized work is visible as Tanpa mesin. Revenue is
  assigned exactly once. New product setup permits one machine only.
- CSV and Print/PDF use the active tab, all filtered rows, and current ordering.
  CSV currency fields are numeric rupiah; user text is guarded against spreadsheet
  formula interpretation. On-screen tables show 25 rows per page.
- Retur Barang/Piutang/PO are secondary views. Aset & Penyusutan opens the existing
  Master Data asset screen. Inventory and customer management stay in their pages.
- Existing orders/payment/stock records are not migrated or repriced. For old
  undated payment balances, retain the known balance as a compatibility fallback
  without inventing cash events. If cancellation has no explicit timestamp, use
  its recorded updatedAt/createdAt. Historical draft edits cannot be reconstructed
  before this release; no synthetic revision history is created.

## Shared page header

Stok Bahan, Laporan, Karyawan and Master Data use the same white 68px title bar as
Status Order. Existing filter controls move to its right with their listeners
intact. Mobile controls wrap beneath the title; content tables scroll internally.
