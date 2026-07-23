import csv
import io
from decimal import Decimal, InvalidOperation


def totals_by_customer(rows: str) -> dict[str, str]:
    totals: dict[str, Decimal] = {}
    for row in csv.DictReader(io.StringIO(rows)):
        customer = (row.get("customer") or "").strip()
        if not customer:
            raise ValueError("customer must not be blank")
        try:
            amount = Decimal((row.get("amount") or "").strip())
        except InvalidOperation as error:
            raise ValueError("amount must be decimal") from error
        if amount < 0 or amount.as_tuple().exponent < -2:
            raise ValueError("amount must be non-negative whole cents")
        totals[customer] = totals.get(customer, Decimal("0")) + amount
    return {
        customer: f"{totals[customer]:.2f}"
        for customer in sorted(totals)
    }
