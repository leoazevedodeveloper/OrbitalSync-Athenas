from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, Tuple


def _pierre_transactions_query_range(start_d: str, end_d: str, *, use_custom: bool) -> tuple[str, str]:
    """
    A Pierre costuma não devolver itens quando startDate == endDate (intervalo vazio ou fim exclusivo).
    Para período custom de um único dia, pedimos até o dia seguinte e filtramos depois em normalize.
    """
    if not use_custom or start_d != end_d:
        return start_d, end_d
    day = datetime.strptime(start_d[:10], "%Y-%m-%d").date()
    return start_d, (day + timedelta(days=1)).isoformat()

from .client import PierreClient
from .normalize import (
    filter_transactions_calendar_month,
    filter_transactions_date_range,
    month_date_range_iso,
    month_summary,
    normalize_accounts,
    normalize_transactions,
    period_summary,
)


class FinanceService:
    """Orquestra leitura Pierre + payload pronto para UI."""

    def __init__(self) -> None:
        self.client = PierreClient()

    def is_configured(self) -> bool:
        return self.client.is_configured()

    def pierre_manual_update(self) -> Tuple[bool, Dict[str, Any], str]:
        """POST /tools/api/manual-update — sincroniza contas na Pierre antes de novo GET."""
        return self.client.manual_update()

    def get_snapshot(
        self,
        transactions_limit: int = 300,
        *,
        view_year: int | None = None,
        view_month: int | None = None,
        custom_start: str | None = None,
        custom_end: str | None = None,
    ) -> Tuple[bool, Dict[str, Any], str]:
        now = datetime.now()
        cs_raw = str(custom_start or "").strip()[:10]
        ce_raw = str(custom_end or "").strip()[:10]
        use_custom = bool(cs_raw and ce_raw and len(cs_raw) == 10 and len(ce_raw) == 10)
        if use_custom:
            try:
                datetime.strptime(cs_raw, "%Y-%m-%d")
                datetime.strptime(ce_raw, "%Y-%m-%d")
            except ValueError:
                use_custom = False
        if use_custom:
            start_d, end_d = cs_raw, ce_raw
            if start_d > end_d:
                start_d, end_d = end_d, start_d
            d0 = datetime.strptime(start_d, "%Y-%m-%d").date()
            d1 = datetime.strptime(end_d, "%Y-%m-%d").date()
            if (d1 - d0).days > 366:
                return False, {}, "Intervalo máximo: 366 dias."
            view_payload: Dict[str, Any] = {
                "mode": "custom",
                "year": None,
                "month": None,
                "start_date": start_d,
                "end_date": end_d,
            }
            y = m = None
        else:
            y = int(view_year) if view_year is not None else now.year
            m = int(view_month) if view_month is not None else now.month
            m = max(1, min(12, m))
            y = max(2000, min(y, now.year + 1))
            start_d, end_d = month_date_range_iso(y, m)
            view_payload = {
                "mode": "month",
                "year": y,
                "month": m,
                "start_date": start_d,
                "end_date": end_d,
            }

        ok_a, raw_accounts, err_a = self.client.get_accounts()
        if not ok_a:
            return False, {}, err_a
        q_start, q_end = _pierre_transactions_query_range(start_d, end_d, use_custom=use_custom)
        ok_t, raw_txs, err_t = self.client.get_transactions(
            limit=transactions_limit,
            start_date=q_start,
            end_date=q_end,
        )
        if not ok_t:
            return False, {}, err_t

        accounts = normalize_accounts(raw_accounts)
        txs = normalize_transactions(raw_txs)
        if use_custom:
            txs = filter_transactions_date_range(txs, start_d, end_d)
            summary = period_summary(txs)
        else:
            txs = filter_transactions_calendar_month(txs, y, m)
            summary = month_summary(txs, y, m)

        bank_accounts = [a for a in accounts if a.get("product_group") == "bank"]
        credit_cards = [a for a in accounts if a.get("product_group") == "card"]

        bank_balance_total = round(sum(float(a.get("balance") or 0.0) for a in bank_accounts), 2)
        cards_balance_total = round(sum(float(a.get("balance") or 0.0) for a in credit_cards), 2)

        def _sum_defined(rows, key: str) -> tuple[float, int]:
            s = 0.0
            n = 0
            for r in rows:
                v = r.get(key)
                if v is None:
                    continue
                try:
                    s += float(v)
                    n += 1
                except (TypeError, ValueError):
                    continue
            return round(s, 2), n

        cr_lim, n_lim = _sum_defined(credit_cards, "credit_limit")
        cr_avail, n_avail = _sum_defined(credit_cards, "available_credit")
        od_contracted, _ = _sum_defined(bank_accounts, "overdraft_limit")
        od_used, _ = _sum_defined(bank_accounts, "overdraft_used")

        summary["current_balance"] = round(bank_balance_total + cards_balance_total, 2)
        summary["bank_balance_total"] = bank_balance_total
        summary["cards_balance_total"] = cards_balance_total
        summary["bank_accounts_count"] = len(bank_accounts)
        summary["credit_cards_count"] = len(credit_cards)
        summary["credit_limit_total"] = cr_lim if n_lim else None
        summary["credit_available_total"] = cr_avail if n_avail else None
        summary["credit_cards_with_limit_count"] = n_lim
        summary["overdraft_contracted_total"] = od_contracted if od_contracted > 0 else None
        summary["overdraft_used_total"] = od_used if od_used > 0 else None

        payload: Dict[str, Any] = {
            "source": "pierre",
            "accounts": accounts,
            "bank_accounts": bank_accounts,
            "credit_cards": credit_cards,
            "transactions": txs,
            "summary": summary,
            "synced_at_ms": int(datetime.now().timestamp() * 1000),
            "view": view_payload,
        }
        return True, payload, ""

    def get_month_summary(self, year: int, month: int, transactions_limit: int = 600) -> Tuple[bool, Dict[str, Any], str]:
        start_d, end_d = month_date_range_iso(year, month)
        ok_t, raw_txs, err_t = self.client.get_transactions(
            limit=transactions_limit,
            start_date=start_d,
            end_date=end_d,
        )
        if not ok_t:
            return False, {}, err_t
        txs = normalize_transactions(raw_txs)
        txs = filter_transactions_calendar_month(txs, year, month)
        return True, month_summary(txs, year, month), ""
