import unittest

from invoice_totals import totals_by_customer


class InvoiceTotalsTest(unittest.TestCase):
    def test_aggregates_exactly_and_sorts_customers(self) -> None:
        rows = "customer,amount\n beta,0.10\nalpha,1.25\nbeta,0.20\n"
        self.assertEqual(
            totals_by_customer(rows),
            {"alpha": "1.25", "beta": "0.30"},
        )

    def test_rejects_invalid_business_values(self) -> None:
        for rows in (
            "customer,amount\n,1.00\n",
            "customer,amount\nalpha,-0.01\n",
            "customer,amount\nalpha,1.001\n",
            "customer,amount\nalpha,not-money\n",
        ):
            with self.subTest(rows=rows):
                with self.assertRaises(ValueError):
                    totals_by_customer(rows)


if __name__ == "__main__":
    unittest.main()
