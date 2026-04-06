from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

BR_TZ = ZoneInfo("America/Sao_Paulo")


def month_date_range_iso(year: int, month: int) -> Tuple[str, str]:
    """Primeiro e último dia do mês em YYYY-MM-DD (query Pierre get-transactions)."""
    month = max(1, min(12, int(month)))
    y = int(year)
    last = monthrange(y, month)[1]
    return f"{y:04d}-{month:02d}-01", f"{y:04d}-{month:02d}-{last:02d}"


def _pick(d: Dict[str, Any], *keys: str, default=None):
    for k in keys:
        if k in d and d.get(k) is not None:
            return d.get(k)
    return default


def _to_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _date_to_ms(v: Any) -> int:
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        n = float(v)
        return int(n if n > 10_000_000_000 else n * 1000)
    s = str(v).strip()
    if not s:
        return 0
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return 0
    # Naive = relógio local do extrato (Open Finance BR); evita meia-noite UTC virando dia anterior.
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=BR_TZ)
    return int(dt.timestamp() * 1000)


def _extract_calendar_iso(v: Any) -> Optional[str]:
    """YYYY-MM-DD do campo de data bruto da API, quando existir."""
    if v is None or isinstance(v, (int, float, bool, dict, list)):
        return None
    s = str(v).strip()
    if len(s) < 10 or s[4] != "-" or s[7] != "-":
        return None
    head = s[:10]
    try:
        datetime.strptime(head, "%Y-%m-%d")
        return head
    except ValueError:
        return None


def _calendar_date_from_tx(tx: Dict[str, Any]) -> Optional[date]:
    """
    Dia de calendário usado para filtros: prioriza data do extrato (date_calendar),
    senão deriva do instante em America/Sao_Paulo.
    """
    dc = tx.get("date_calendar")
    if isinstance(dc, str) and len(dc) >= 10:
        try:
            return datetime.strptime(dc[:10], "%Y-%m-%d").date()
        except ValueError:
            pass
    ms = int(tx.get("date_ms") or 0)
    if ms <= 0:
        return None
    return datetime.fromtimestamp(ms / 1000.0, tz=BR_TZ).date()


def _account_product_group(account_type: str, subtype: str) -> str:
    """Separa cartões de crédito do restante (contas bancárias, investimentos, etc.)."""
    t = (account_type or "").strip().upper()
    st = (subtype or "").strip().upper()
    if t == "CREDIT" or st == "CREDIT_CARD":
        return "card"
    return "bank"


def _optional_float_from_dict(d: Dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in d and d.get(k) is not None:
            return _to_float(d.get(k))
    return None


def _last4_from_number(raw: str) -> str | None:
    s = "".join(ch for ch in str(raw or "") if ch.isdigit())
    if len(s) >= 4:
        return s[-4:]
    return None


# Títulos que a API manda só como nível do cartão — não identificam o banco.
_AMBIGUOUS_CARD_TITLE_WORDS = frozenset(
    {
        "gold",
        "platinum",
        "black",
        "infinite",
        "signature",
        "classic",
        "standard",
        "basic",
        "premium",
        "diamond",
        "electron",
        "nanica",
        "grafite",
        "steel",
    }
)


def _is_ambiguous_card_display_name(s: str) -> bool:
    t = (s or "").strip()
    if len(t) <= 1:
        return True
    tl = t.lower()
    parts = tl.replace(".", " ").replace("-", " ").replace("/", " ").split()
    if len(parts) <= 1:
        w = parts[0] if parts else tl
        if w in _AMBIGUOUS_CARD_TITLE_WORDS:
            return True
    return False


def _pretty_card_suffix(s: str) -> str:
    s = (s or "").strip()
    return s.title() if s else s


def _item_id_bank_connection_labels(items: List[Dict[str, Any]]) -> Dict[str, str]:
    """itemId (conexão Open Finance) → nome do banco vindo das contas correntes/poupança."""
    labels: Dict[str, str] = {}
    for x in items:
        if not isinstance(x, dict):
            continue
        acc_type = str(_pick(x, "type", "account_type", "accountType", default="unknown")).strip() or "unknown"
        subtype = str(_pick(x, "subtype", "account_subtype", "accountSubtype", default="")).strip()
        if _account_product_group(acc_type, subtype) != "bank":
            continue
        item_id = str(_pick(x, "itemId", "item_id", default="")).strip()
        if not item_id:
            continue
        marketing = str(_pick(x, "accountMarketingName", "account_marketing_name", "marketingName", "marketing_name", default="")).strip()
        custom = str(_pick(x, "customName", "custom_name", default="")).strip()
        display_name = str(_pick(x, "name", "display_name", "title", "accountName", default="")).strip()
        if custom:
            display_name = custom
        if not display_name and marketing:
            display_name = marketing
        inst_raw = str(_pick(x, "institution", "bank_name", "provider", "providerCode", default="")).strip()
        label = inst_raw or display_name
        if not label:
            continue
        prev = labels.get(item_id, "")
        if not prev or len(label) > len(prev):
            labels[item_id] = label
    return labels


def normalize_accounts(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    item_bank_labels = _item_id_bank_connection_labels(items)
    for x in items:
        if not isinstance(x, dict):
            continue
        raw_id = _pick(x, "id", "account_id", "accountId", "uuid", default="")
        account_id = str(raw_id or "").strip()
        if not account_id:
            continue
        acc_type = str(_pick(x, "type", "account_type", "accountType", default="unknown")).strip() or "unknown"
        subtype = str(_pick(x, "subtype", "account_subtype", "accountSubtype", default="")).strip()
        product_group = _account_product_group(acc_type, subtype)
        marketing = str(_pick(x, "accountMarketingName", "account_marketing_name", "marketingName", "marketing_name", default="")).strip()
        custom = str(_pick(x, "customName", "custom_name", default="")).strip()
        display_name = str(_pick(x, "name", "display_name", "title", "accountName", default="")).strip()
        if custom:
            display_name = custom
        if not display_name and marketing:
            display_name = marketing
        if not display_name:
            display_name = "Conta"

        item_id = str(_pick(x, "itemId", "item_id", default="")).strip()
        connection_bank = item_bank_labels.get(item_id) if item_id else None

        credit_limit: float | None = None
        available_credit: float | None = None
        minimum_payment: float | None = None
        credit_brand: str | None = None
        credit_level: str | None = None
        cd = x.get("creditData")
        if isinstance(cd, dict):
            credit_limit = _optional_float_from_dict(
                cd,
                "creditLimit",
                "lineLimit",
                "totalCreditLimit",
                "maximumCreditLimit",
            )
            available_credit = _optional_float_from_dict(
                cd,
                "availableCreditLimit",
                "availableAmount",
                "availableCredit",
            )
            minimum_payment = _optional_float_from_dict(cd, "minimumPayment", "minimum_payment")
            credit_brand = str(_pick(cd, "brand", "cardBrand", default="")).strip() or None
            credit_level = str(_pick(cd, "level", "tier", default="")).strip() or None

        overdraft_limit: float | None = None
        overdraft_used: float | None = None
        bd = x.get("bankData")
        if isinstance(bd, dict):
            overdraft_limit = _optional_float_from_dict(
                bd,
                "overdraftContractedLimit",
                "overdraft_contracted_limit",
            )
            overdraft_used = _optional_float_from_dict(bd, "overdraftUsedLimit", "overdraft_used_limit")

        raw_number = str(_pick(x, "number", "accountNumber", "transferNumber", default="")).strip()
        number_last4 = _last4_from_number(raw_number)

        if product_group == "card" and connection_bank:
            inst = connection_bank
            if _is_ambiguous_card_display_name(display_name):
                display_name = f"{connection_bank} · {_pretty_card_suffix(display_name)}"
        else:
            inst = str(_pick(x, "institution", "bank_name", "provider", "providerCode", default="")).strip()
            if not inst and display_name:
                inst = display_name

        row: Dict[str, Any] = {
            "id": account_id,
            "name": display_name,
            "marketing_name": marketing or None,
            "type": acc_type,
            "subtype": subtype or None,
            "product_group": product_group,
            "balance": _to_float(_pick(x, "balance", "current_balance", "amount", "accountBalance", default=0)),
            "currency": str(_pick(x, "currency", "currency_code", "currencyCode", "accountCurrencyCode", default="BRL")).strip() or "BRL",
            "institution": inst,
            "active": bool(_pick(x, "active", "is_active", default=True)),
            "number_last4": number_last4,
            "credit_limit": credit_limit,
            "available_credit": available_credit,
            "minimum_payment": minimum_payment,
            "credit_brand": credit_brand,
            "credit_level": credit_level,
            "overdraft_limit": overdraft_limit,
            "overdraft_used": overdraft_used,
        }
        out.append(row)
    return out


def normalize_transactions(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for x in items:
        if not isinstance(x, dict):
            continue
        raw_id = _pick(x, "id", "transaction_id", "uuid", default="")
        tx_id = str(raw_id or "").strip()
        if not tx_id:
            continue
        amount = _to_float(_pick(x, "amount", "value", "total", default=0))
        kind_raw = str(_pick(x, "kind", "type", "direction", default="expense")).lower().strip()
        if kind_raw in ("credit", "income", "inflow", "entry", "receita"):
            kind = "income"
        elif amount < 0:
            kind = "expense"
        else:
            kind = "expense"
        if amount < 0:
            amount = abs(amount)
        account_id = str(_pick(x, "account_id", "accountId", "accountUUID", default="")).strip()
        account_name = str(
            _pick(
                x,
                "account_marketing_name",
                "accountMarketingName",
                "account_name",
                "accountName",
                "account_display_name",
                "accountDisplayName",
                default="",
            )
        ).strip() or None
        institution = str(
            _pick(
                x,
                "providerCode",
                "provider_code",
                "institution",
                "bankCode",
                "bank_code",
                default="",
            )
        ).strip() or None
        raw_date = _pick(x, "date", "occurred_at", "created_at", "timestamp", default=0)
        date_calendar = _extract_calendar_iso(raw_date)
        out.append(
            {
                "id": tx_id,
                "kind": kind,
                "amount": amount,
                "category": str(_pick(x, "category", "category_name", default="Sem categoria")).strip() or "Sem categoria",
                "account_id": account_id,
                "account_name": account_name,
                "institution": institution,
                "date_calendar": date_calendar,
                "date_ms": _date_to_ms(raw_date),
                "description": str(_pick(x, "description", "title", "memo", default="")).strip(),
            }
        )
    out.sort(key=lambda t: t.get("date_ms", 0), reverse=True)
    return out


def filter_transactions_date_range(
    transactions: List[Dict[str, Any]], start_d: str, end_d: str
) -> List[Dict[str, Any]]:
    """Filtra por dia de calendário (extrato + fuso BR), inclusive."""
    try:
        start = datetime.strptime(str(start_d).strip()[:10], "%Y-%m-%d").date()
        end = datetime.strptime(str(end_d).strip()[:10], "%Y-%m-%d").date()
    except ValueError:
        return []
    if start > end:
        start, end = end, start
    filtered: List[Dict[str, Any]] = []
    for tx in transactions:
        d_only = _calendar_date_from_tx(tx)
        if d_only is None:
            continue
        if d_only < start or d_only > end:
            continue
        filtered.append(tx)
    filtered.sort(key=lambda t: int(t.get("date_ms") or 0), reverse=True)
    return filtered


def period_summary(transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Receitas/despesas para lista já restrita ao intervalo (mesmas chaves que month_summary)."""
    income = 0.0
    expense = 0.0
    by_category: Dict[str, float] = {}
    for tx in transactions:
        amt = _to_float(tx.get("amount"), 0.0)
        if tx.get("kind") == "income":
            income += amt
        else:
            expense += amt
            cat = str(tx.get("category") or "Sem categoria")
            by_category[cat] = by_category.get(cat, 0.0) + amt
    top = sorted(
        [{"category": k, "amount": v} for k, v in by_category.items()],
        key=lambda x: x["amount"],
        reverse=True,
    )
    return {
        "income_month": round(income, 2),
        "expense_month": round(expense, 2),
        "net_month": round(income - expense, 2),
        "by_category": top,
    }


def filter_transactions_calendar_month(
    transactions: List[Dict[str, Any]], year: int, month: int
) -> List[Dict[str, Any]]:
    """
    Garante que só entram transações do mês de calendário visível.
    A API Pierre às vezes devolve itens fora de startDate/endDate (ex.: parcelas, datas alternativas).
    """
    y, mo = int(year), int(month)
    mo = max(1, min(12, mo))
    filtered: List[Dict[str, Any]] = []
    for tx in transactions:
        d_only = _calendar_date_from_tx(tx)
        if d_only is None:
            continue
        if d_only.year != y or d_only.month != mo:
            continue
        filtered.append(tx)
    filtered.sort(key=lambda t: int(t.get("date_ms") or 0), reverse=True)
    return filtered


def month_summary(transactions: List[Dict[str, Any]], year: int, month: int) -> Dict[str, Any]:
    income = 0.0
    expense = 0.0
    by_category: Dict[str, float] = {}
    for tx in transactions:
        d_only = _calendar_date_from_tx(tx)
        if d_only is None:
            continue
        if d_only.year != year or d_only.month != month:
            continue
        amt = _to_float(tx.get("amount"), 0.0)
        if tx.get("kind") == "income":
            income += amt
        else:
            expense += amt
            cat = str(tx.get("category") or "Sem categoria")
            by_category[cat] = by_category.get(cat, 0.0) + amt
    top = sorted(
        [{"category": k, "amount": v} for k, v in by_category.items()],
        key=lambda x: x["amount"],
        reverse=True,
    )
    return {
        "income_month": round(income, 2),
        "expense_month": round(expense, 2),
        "net_month": round(income - expense, 2),
        "by_category": top,
    }
