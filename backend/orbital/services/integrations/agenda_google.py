"""Sincronização da agenda Google (via n8n): list, delete e apoio à UI."""
from __future__ import annotations

import calendar
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from .webhook_config import ATHENA_GOOGLE_CALENDAR_HOOK_ID, fire_webhook_by_id, load_webhooks_config

_BRT = ZoneInfo("America/Sao_Paulo")
_DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _parse_gcal_start_ms(start_s: Any) -> int | None:
    s = str(start_s or "").strip()
    if not s:
        return None
    try:
        if _DATE_ONLY.match(s):
            y, mo, d = (int(x) for x in s.split("-"))
            dt = datetime(y, mo, d, 0, 0, 0, tzinfo=_BRT)
            return int(dt.timestamp() * 1000)
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=_BRT)
        return int(dt.timestamp() * 1000)
    except (ValueError, TypeError, OSError):
        return None


def month_bounds_iso_brt(year: int, month: int) -> Tuple[str, str]:
    """time_min / time_max ISO com fuso BRT para o webhook list."""
    if month < 1 or month > 12 or year < 1970 or year > 2100:
        raise ValueError("year/month fora do intervalo")
    start = datetime(year, month, 1, 0, 0, 0, tzinfo=_BRT)
    last = calendar.monthrange(year, month)[1]
    end = datetime(year, month, last, 23, 59, 59, tzinfo=_BRT)
    return start.isoformat(), end.isoformat()


def _normalize_events(raw_events: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not isinstance(raw_events, list):
        return out
    for ev in raw_events:
        if not isinstance(ev, dict):
            continue
        gid = ev.get("id")
        if not gid:
            continue
        ms = _parse_gcal_start_ms(ev.get("start"))
        if ms is None:
            continue
        title = str(ev.get("summary") or "").strip() or "(Sem título)"
        o: Dict[str, Any] = {
            "id": f"gcal-{gid}",
            "title": title,
            "startsAtMs": ms,
            "source": "google",
            "googleEventId": str(gid),
        }
        link = ev.get("htmlLink")
        if isinstance(link, str) and link.strip():
            o["htmlLink"] = link.strip()
        out.append(o)
    out.sort(key=lambda x: x["startsAtMs"])
    return out


def calendar_connectivity_probe_payload() -> Dict[str, str]:
    """POST seguro para teste de webhook (evita rota create sem starts_at_iso)."""
    now = datetime.now(timezone.utc)
    end = now + timedelta(hours=1)
    return {
        "calendar_op": "list",
        "time_min": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "time_max": end.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }


def _target_ms_from_iso(iso_s: str) -> Tuple[Optional[int], Optional[datetime], str]:
    s = str(iso_s or "").strip()
    if not s:
        return None, None, "starts_at_iso vazio"
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None, None, "ISO 8601 inválido"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_BRT)
    return int(dt.timestamp() * 1000), dt, ""


async def find_google_event_id_for_title_at(title: str, starts_at_iso: str) -> Tuple[Optional[str], str]:
    """Resolve id Google para delete quando Leo não cola o id (título + data/hora)."""
    title_t = str(title or "").strip().lower()
    if not title_t:
        return None, "title vazio"

    ms, dt, err = _target_ms_from_iso(starts_at_iso)
    if ms is None or dt is None:
        return None, err

    ok, events, msg = await fetch_google_agenda_events_month(dt.year, dt.month)
    if not ok:
        return None, msg or "Falha ao listar Google Calendar"

    def _close(e: Dict[str, Any]) -> int:
        return abs(int(e["startsAtMs"]) - ms)

    match_loose = [
        e
        for e in events
        if title_t in str(e.get("title") or "").lower()
        or str(e.get("title") or "").lower() in title_t
        or str(e.get("title") or "").strip().lower() == title_t
    ]
    if not match_loose:
        return (
            None,
            "Nenhum evento com título parecido neste mês; use google_event_id ou trigger_webhook com calendar_op list.",
        )
    best: Optional[Dict[str, Any]] = None
    best_d = 10**18
    for e in match_loose:
        d = _close(e)
        if d < best_d:
            best_d = d
            best = e
    if best is None:
        return None, "Nenhum evento nesse mês."
    if best_d > 2 * 3600 * 1000:
        return None, (
            "Nenhum evento próximo desse horário (janela ±2h). "
            "Peça o id em data.id após listar ou confirme título e horário."
        )
    gid = best.get("googleEventId") or (str(best.get("id") or "").replace("gcal-", "", 1) or None)
    if not gid:
        return None, "Evento sem id."
    return str(gid), ""


async def delete_google_calendar_event(event_id: str) -> Tuple[bool, str]:
    eid = str(event_id or "").strip()
    if not eid:
        return False, "event_id vazio"
    cfg = load_webhooks_config()
    status, text = await fire_webhook_by_id(
        cfg,
        ATHENA_GOOGLE_CALENDAR_HOOK_ID,
        {"calendar_op": "delete", "event_id": eid},
    )
    if not (200 <= status < 300):
        return False, f"HTTP {status}: {(text or '')[:400]}"
    try:
        root = json.loads(text or "{}")
    except json.JSONDecodeError:
        return True, ""
    if root.get("ok") is False:
        return False, str(root.get("message") or "ok:false no n8n")
    return True, ""


async def fetch_google_agenda_events_month(year: int, month: int) -> Tuple[bool, List[Dict[str, Any]], str]:
    """
    POST no hook athena-google-calendar com calendar_op=list.
    Retorna (ok, eventos normalizados para a UI, mensagem).
    """
    try:
        t0, t1 = month_bounds_iso_brt(year, month)
    except ValueError as e:
        return False, [], str(e)

    cfg = load_webhooks_config()
    payload = {
        "calendar_op": "list",
        "time_min": t0,
        "time_max": t1,
    }
    status, text = await fire_webhook_by_id(cfg, ATHENA_GOOGLE_CALENDAR_HOOK_ID, payload)
    if not (200 <= status < 300):
        return False, [], f"HTTP {status}: {(text or '')[:500]}"

    try:
        root = json.loads(text or "{}")
    except json.JSONDecodeError:
        return False, [], "Resposta n8n não é JSON"

    if not root.get("ok", True):
        return False, [], str(root.get("message") or "ok:false no n8n")

    data = root.get("data")
    if not isinstance(data, dict):
        return True, [], ""

    events = _normalize_events(data.get("events"))
    return True, events, ""
