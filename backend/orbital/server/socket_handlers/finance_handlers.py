"""Socket.IO: app financeiro (Pierre API, modo leitura)."""
from __future__ import annotations

import asyncio
import os
from datetime import datetime

from orbital.apps.finance import FinanceService


def register_finance_handlers(sio):
    service = FinanceService()

    def _parse_snapshot_opts(data) -> tuple[int, int | None, int | None, str | None, str | None]:
        limit = 800
        year: int | None = None
        month: int | None = None
        start_date: str | None = None
        end_date: str | None = None
        if isinstance(data, dict):
            try:
                limit = int(data.get("limit", limit))
            except (TypeError, ValueError):
                limit = 800
            if "year" in data:
                try:
                    year = int(data.get("year"))
                except (TypeError, ValueError):
                    year = None
            if "month" in data:
                try:
                    month = int(data.get("month"))
                except (TypeError, ValueError):
                    month = None
            rs = data.get("start_date")
            re = data.get("end_date")
            if isinstance(rs, str) and isinstance(re, str) and len(rs.strip()) >= 10 and len(re.strip()) >= 10:
                start_date = rs.strip()[:10]
                end_date = re.strip()[:10]
        limit = max(1, min(1000, limit))
        return limit, year, month, start_date, end_date

    async def _emit_snapshot(sid, data=None):
        limit, year, month, start_date, end_date = _parse_snapshot_opts(data)
        if start_date and end_date:
            ok, payload, err = service.get_snapshot(
                transactions_limit=limit,
                custom_start=start_date,
                custom_end=end_date,
            )
        else:
            now = datetime.now()
            vy = year if year is not None else now.year
            vm = month if month is not None else now.month
            ok, payload, err = service.get_snapshot(
                transactions_limit=limit,
                view_year=vy,
                view_month=vm,
            )
        if not ok:
            print(f"[FINANCE][SOCKET][ERROR] snapshot failed sid={sid} err={err}")
            await sio.emit("finance_error", {"msg": err or "Falha ao buscar snapshot financeiro."}, room=sid)
            return False
        v = payload.get("view") if isinstance(payload.get("view"), dict) else {}
        vm = v.get("mode") or "month"
        print(
            "[FINANCE][SOCKET] finance_snapshot "
            f"sid={sid} mode={vm} "
            f"range={v.get('start_date')}..{v.get('end_date')} "
            f"accounts={len(payload.get('accounts') or [])} "
            f"transactions={len(payload.get('transactions') or [])}"
        )
        await sio.emit("finance_snapshot", payload, room=sid)
        return True

    async def _wait_after_manual_update(pierre_body: dict) -> None:
        """
        O POST manual-update conclui antes da Pierre terminar de persistir contas/transações.
        Espera um pouco antes do GET, senão a UI fica com dados antigos até o usuário reabrir.
        """
        details = pierre_body.get("details") if isinstance(pierre_body.get("details"), dict) else {}
        in_prog = details.get("inProgress") or {}
        try:
            n_busy = int(in_prog.get("count") or 0)
        except (TypeError, ValueError):
            n_busy = 0
        try:
            base = float(os.getenv("PIERRE_POST_SYNC_WAIT_SECONDS") or "6")
        except ValueError:
            base = 6.0
        try:
            per_item = float(os.getenv("PIERRE_POST_SYNC_EXTRA_WAIT_INPROGRESS") or "2.5")
        except ValueError:
            per_item = 2.5
        try:
            cap = float(os.getenv("PIERRE_POST_SYNC_WAIT_MAX") or "45")
        except ValueError:
            cap = 45.0
        wait_s = min(cap, base + max(0, n_busy) * per_item)
        print(
            f"[FINANCE][SOCKET] aguardando {wait_s:.1f}s após manual-update "
            f"(base={base}, inProgress.count={n_busy}) antes do snapshot"
        )
        await asyncio.sleep(wait_s)

    def _schedule_follow_up_snapshot(sid, data) -> None:
        """Segundo GET após a API ainda poder estar a mesclar em background."""
        try:
            delay = float(os.getenv("PIERRE_FOLLOW_UP_SNAPSHOT_SECONDS") or "14")
        except ValueError:
            delay = 14.0
        if delay <= 0:
            return

        async def _run():
            await asyncio.sleep(delay)
            print(f"[FINANCE][SOCKET] follow-up snapshot (+{delay}s pós-sync) sid={sid}")
            try:
                await _emit_snapshot(sid, data)
            except Exception as ex:
                print(f"[FINANCE][SOCKET][WARN] follow-up snapshot ignorado: {ex}")

        asyncio.create_task(_run())

    @sio.event
    async def finance_get_snapshot(sid, data=None):
        print(f"[FINANCE][SOCKET] finance_get_snapshot sid={sid} payload={data}")
        if not service.is_configured():
            print("[FINANCE][SOCKET][ERROR] PIERRE_API_KEY não configurada no backend.")
            await sio.emit(
                "finance_error",
                {"msg": "PIERRE_API_KEY não configurada no backend."},
                room=sid,
            )
            return
        await _emit_snapshot(sid, data)

    @sio.event
    async def finance_manual_update(sid, data=None):
        """
        Pierre POST /tools/api/manual-update, depois snapshot.
        https://docs.pierre.finance/api-reference/rest/manual-update
        """
        print(f"[FINANCE][SOCKET] finance_manual_update sid={sid} payload={data}")
        if not service.is_configured():
            print("[FINANCE][SOCKET][ERROR] PIERRE_API_KEY não configurada no backend.")
            await sio.emit(
                "finance_error",
                {"msg": "PIERRE_API_KEY não configurada no backend."},
                room=sid,
            )
            return
        ok, pierre_body, err = service.pierre_manual_update()
        if not ok:
            print(f"[FINANCE][SOCKET][ERROR] finance_manual_update pierre err={err}")
            await sio.emit(
                "finance_error",
                {"msg": err or "Falha na sincronização manual (Pierre).", "manual_update": pierre_body},
                room=sid,
            )
            return
        await sio.emit(
            "finance_manual_update_result",
            {
                "ok": True,
                "message": pierre_body.get("message"),
                "timestamp": pierre_body.get("timestamp"),
                "details": pierre_body.get("details"),
            },
            room=sid,
        )
        await _wait_after_manual_update(pierre_body)
        first_ok = await _emit_snapshot(sid, data)
        if first_ok:
            _schedule_follow_up_snapshot(sid, data)

    @sio.event
    async def finance_refresh(sid, data=None):
        print(f"[FINANCE][SOCKET] finance_refresh sid={sid} payload={data}")
        await finance_manual_update(sid, data)

    @sio.event
    async def finance_get_month_summary(sid, data=None):
        print(f"[FINANCE][SOCKET] finance_get_month_summary sid={sid} payload={data}")
        if not service.is_configured():
            print("[FINANCE][SOCKET][ERROR] PIERRE_API_KEY não configurada no backend.")
            await sio.emit(
                "finance_error",
                {"msg": "PIERRE_API_KEY não configurada no backend."},
                room=sid,
            )
            return
        now = datetime.now()
        year = now.year
        month = now.month
        if isinstance(data, dict):
            try:
                year = int(data.get("year", year))
                month = int(data.get("month", month))
            except (TypeError, ValueError):
                year = now.year
                month = now.month
        month = max(1, min(12, month))
        ok, payload, err = service.get_month_summary(year, month)
        if not ok:
            print(
                f"[FINANCE][SOCKET][ERROR] finance_get_month_summary "
                f"sid={sid} year={year} month={month} err={err}"
            )
            await sio.emit("finance_error", {"msg": err or "Falha ao calcular resumo mensal."}, room=sid)
            return
        print(
            "[FINANCE][SOCKET] finance_month_summary "
            f"sid={sid} year={year} month={month} "
            f"income={payload.get('income_month')} expense={payload.get('expense_month')}"
        )
        await sio.emit(
            "finance_month_summary",
            {"year": year, "month": month, "summary": payload},
            room=sid,
        )
