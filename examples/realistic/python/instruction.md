# Task

Fix `invoice_totals.py`.

`totals_by_customer(rows)` receives CSV text with `customer,amount` headers.
Trim customer IDs, aggregate exact two-decimal non-negative amounts, reject
blank IDs or values with fractional cents, and return a dictionary sorted by
customer ID whose values are canonical two-decimal strings.
