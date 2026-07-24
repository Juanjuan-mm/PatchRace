import csv
import io


def totals_by_customer(rows: str) -> dict[str, str]:
    totals: dict[str, float] = {}
    for row in csv.DictReader(io.StringIO(rows)):
        customer = row["customer"]
        totals[customer] = totals.get(customer, 0.0) + float(row["amount"])
    return {customer: f"{amount:.2f}" for customer, amount in totals.items()}
