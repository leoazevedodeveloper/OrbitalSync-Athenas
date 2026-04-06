from __future__ import annotations

import os
from typing import Any, Dict, List, Tuple

import httpx


class PierreClient:
    """Cliente REST para Pierre API (leitura + sincronização manual)."""

    def __init__(self) -> None:
        self.base_url = (os.getenv("PIERRE_BASE_URL") or "https://www.pierre.finance").rstrip("/")
        self.api_key = (os.getenv("PIERRE_API_KEY") or "").strip()
        timeout_s = (os.getenv("PIERRE_TIMEOUT_SECONDS") or "15").strip()
        try:
            self.timeout = float(timeout_s)
        except ValueError:
            self.timeout = 15.0
        mu_s = (os.getenv("PIERRE_MANUAL_UPDATE_TIMEOUT_SECONDS") or "120").strip()
        try:
            self.manual_update_timeout = float(mu_s)
        except ValueError:
            self.manual_update_timeout = 120.0

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _safe_headers_for_log(self) -> Dict[str, str]:
        token = self.api_key
        if not token:
            redacted = ""
        elif len(token) <= 8:
            redacted = "***"
        else:
            redacted = f"{token[:4]}...{token[-4:]}"
        return {
            "Authorization": f"Bearer {redacted}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    @staticmethod
    def _short_json_preview(payload: Any) -> str:
        try:
            s = str(payload)
        except Exception:
            return "<unprintable>"
        return s if len(s) <= 800 else f"{s[:800]}...<truncated>"

    def _get_json(self, path: str, params: Dict[str, Any] | None = None) -> Tuple[bool, Any, str]:
        if not self.is_configured():
            print("[FINANCE][PIERRE][ERROR] PIERRE_API_KEY não configurada.")
            return False, None, "PIERRE_API_KEY não configurada."
        url = f"{self.base_url}{path}"
        print(
            f"[FINANCE][PIERRE][REQUEST] GET {url} "
            f"params={params or {}} headers={self._safe_headers_for_log()}"
        )
        try:
            with httpx.Client(timeout=self.timeout) as c:
                r = c.get(url, headers=self._headers(), params=params)
            print(
                f"[FINANCE][PIERRE][RESPONSE] GET {url} "
                f"status={r.status_code} body={self._short_json_preview(r.text)}"
            )
            if r.status_code < 200 or r.status_code >= 300:
                return False, None, f"Pierre HTTP {r.status_code}: {r.text[:400]}"
            try:
                return True, r.json(), ""
            except ValueError:
                ctype = (r.headers.get("content-type") or "").strip()
                print(f"[FINANCE][PIERRE][ERROR] JSON inválido em {url} content-type={ctype!r}")
                return (
                    False,
                    None,
                    f"Resposta JSON inválida da Pierre (status={r.status_code}, content-type={ctype or 'n/a'}): "
                    f"{r.text[:220]}",
                )
        except httpx.HTTPError as e:
            print(f"[FINANCE][PIERRE][ERROR] Falha HTTP em {url}: {e}")
            return False, None, f"Falha HTTP Pierre: {e}"

    def _post_json(
        self, path: str, *, timeout: float | None = None
    ) -> Tuple[bool, Any, str]:
        """POST sem corpo (ex.: manual-update)."""
        if not self.is_configured():
            print("[FINANCE][PIERRE][ERROR] PIERRE_API_KEY não configurada.")
            return False, None, "PIERRE_API_KEY não configurada."
        url = f"{self.base_url}{path}"
        t = float(timeout) if timeout is not None else self.timeout
        print(
            f"[FINANCE][PIERRE][REQUEST] POST {url} "
            f"timeout={t}s headers={self._safe_headers_for_log()}"
        )
        try:
            with httpx.Client(timeout=t) as c:
                r = c.post(url, headers=self._headers())
            print(
                f"[FINANCE][PIERRE][RESPONSE] POST {url} "
                f"status={r.status_code} body={self._short_json_preview(r.text)}"
            )
            if r.status_code < 200 or r.status_code >= 300:
                try:
                    j = r.json()
                    msg = str(j.get("message") or j.get("error") or r.text[:400])
                except ValueError:
                    msg = r.text[:400]
                return False, None, f"Pierre HTTP {r.status_code}: {msg}"
            try:
                return True, r.json(), ""
            except ValueError:
                ctype = (r.headers.get("content-type") or "").strip()
                print(f"[FINANCE][PIERRE][ERROR] JSON inválido em POST {url} content-type={ctype!r}")
                return (
                    False,
                    None,
                    f"Resposta JSON inválida (status={r.status_code}, content-type={ctype or 'n/a'})",
                )
        except httpx.HTTPError as e:
            print(f"[FINANCE][PIERRE][ERROR] Falha HTTP POST em {url}: {e}")
            return False, None, f"Falha HTTP Pierre: {e}"

    def manual_update(self) -> Tuple[bool, Dict[str, Any], str]:
        """
        Força sincronização manual com instituições (Open Finance).
        Ver: https://docs.pierre.finance/api-reference/rest/manual-update
        """
        ok, payload, err = self._post_json(
            "/tools/api/manual-update",
            timeout=self.manual_update_timeout,
        )
        if not ok:
            return False, {}, err or "manual-update falhou."
        if not isinstance(payload, dict):
            return False, {}, "Resposta manual-update inválida."
        if payload.get("success") is False:
            msg = str(
                payload.get("message")
                or payload.get("error")
                or "manual-update retornou success=false."
            )
            return False, payload, msg
        return True, payload, ""

    def get_accounts(self) -> Tuple[bool, List[Dict[str, Any]], str]:
        ok, payload, err = self._get_json("/tools/api/get-accounts")
        if not ok:
            return False, [], err
        if isinstance(payload, list):
            return True, payload, ""
        if isinstance(payload, dict):
            if isinstance(payload.get("data"), list):
                return True, payload.get("data") or [], ""
            for key in ("accounts", "data", "items", "results"):
                v = payload.get(key)
                if isinstance(v, list):
                    return True, v, ""
        return True, [], ""

    def get_transactions(
        self,
        limit: int = 200,
        *,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> Tuple[bool, List[Dict[str, Any]], str]:
        lim = max(1, min(1000, int(limit)))
        params: Dict[str, Any] = {"limit": lim, "format": "raw"}
        if start_date:
            params["startDate"] = str(start_date).strip()
        if end_date:
            params["endDate"] = str(end_date).strip()
        ok, payload, err = self._get_json("/tools/api/get-transactions", params=params)
        if not ok:
            return False, [], err
        if isinstance(payload, list):
            return True, payload, ""
        if isinstance(payload, dict):
            data = payload.get("data")
            if isinstance(data, list):
                return True, data, ""
            if isinstance(data, dict):
                txs = data.get("transactions")
                if isinstance(txs, list):
                    return True, txs, ""
            for key in ("transactions", "data", "items", "results"):
                v = payload.get(key)
                if isinstance(v, list):
                    return True, v, ""
        return True, [], ""
