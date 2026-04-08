"""Testes ativos de conectividade (Supabase, ComfyUI, webhooks, Ollama) — sem expor segredos ao cliente."""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, List

import httpx

logger = logging.getLogger(__name__)


def _verbose_integration_probe() -> bool:
    v = (os.getenv("ORBITAL_INTEGRATION_TEST_LOG") or "").strip().lower()
    return v in ("1", "true", "yes")


def _emit_integration_probe(line: str) -> None:
    if _verbose_integration_probe():
        print(line, flush=True)
        logger.info("%s", line)


def _webhook_post_probe_eligible(url: str) -> bool:
    """URLs tipo n8n (/webhook/...) só respondem de verdade a POST; HEAD/GET costumam ser 404."""
    if (os.getenv("ORBITAL_SKIP_WEBHOOK_POST_PROBE") or "").strip().lower() in ("1", "true", "yes"):
        return False
    u = (url or "").lower()
    return "/webhook" in u


from orbital.services.supabase.remote_config import _base_url, _rest_headers, supabase_config_enabled

from .agenda_google import calendar_connectivity_probe_payload
from .webhook_config import ATHENA_GOOGLE_CALENDAR_HOOK_ID, load_webhooks_config


def _ms(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)


def _http_tier(status_code: int | None) -> str:
    """up = saudável; degraded = respondeu mas algo a rever; down = erro servidor ou sem resposta."""
    if status_code is None:
        return "down"
    if 200 <= status_code < 300:
        return "up"
    if status_code in (401, 403):
        return "degraded"
    if 400 <= status_code < 500:
        return "degraded"
    if status_code >= 500:
        return "down"
    return "degraded"


def test_supabase() -> Dict[str, Any]:
    t0 = time.perf_counter()
    if not supabase_config_enabled():
        return {
            "ok": False,
            "reachable": False,
            "tier": "down",
            "message": "Credenciais Supabase ausentes no .env.",
            "latency_ms": _ms(t0),
        }
    base = _base_url().rstrip("/")
    if not base:
        return {"ok": False, "reachable": False, "tier": "down", "message": "SUPABASE_URL vazio.", "latency_ms": _ms(t0)}
    try:
        with httpx.Client(timeout=12.0) as client:
            r = client.get(f"{base}/rest/v1/", headers=_rest_headers())
        latency = _ms(t0)
        code = r.status_code
        tier = _http_tier(code)
        reachable = True
        ok = tier == "up"
        if tier == "degraded" and code in (401, 403):
            msg = f"API acessível; confira a chave no .env (HTTP {code})."
        elif tier == "up":
            msg = "PostgREST respondeu."
        else:
            msg = f"HTTP {code}"
        return {
            "ok": ok,
            "reachable": reachable,
            "tier": tier,
            "status_code": code,
            "message": msg,
            "latency_ms": latency,
        }
    except httpx.ConnectError as e:
        return {
            "ok": False,
            "reachable": False,
            "tier": "down",
            "message": f"Sem conexão: {e!s}"[:220],
            "latency_ms": _ms(t0),
        }
    except Exception as e:
        return {
            "ok": False,
            "reachable": False,
            "tier": "down",
            "message": str(e)[:220],
            "latency_ms": _ms(t0),
        }


def test_comfyui(base_url: str) -> Dict[str, Any]:
    t0 = time.perf_counter()
    raw = (base_url or "").strip().rstrip("/")
    if not raw:
        return {
            "ok": False,
            "reachable": False,
            "tier": "down",
            "message": "COMFYUI_BASE_URL não definido.",
            "latency_ms": _ms(t0),
        }
    paths = ("/system_stats", "/queue", "/object_info", "/")
    last_err = ""
    timeout = httpx.Timeout(5.0, connect=2.0)
    for path in paths:
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.get(f"{raw}{path}")
            latency = _ms(t0)
            code = r.status_code
            if code < 500:
                tier = _http_tier(code)
                return {
                    "ok": tier == "up",
                    "reachable": True,
                    "tier": tier,
                    "status_code": code,
                    "path_checked": path,
                    "message": f"Resposta em {path} (HTTP {code}).",
                    "latency_ms": latency,
                }
            last_err = f"HTTP {code} em {path}"
        except httpx.ConnectError as e:
            last_err = f"Sem conexão em {path}: {e!s}"[:200]
        except Exception as e:
            last_err = str(e)[:200]
    return {
        "ok": False,
        "reachable": False,
        "tier": "down",
        "message": last_err or "ComfyUI não respondeu.",
        "latency_ms": _ms(t0),
    }


def test_ollama(base_url: str) -> Dict[str, Any]:
    """GET /api/tags — endpoint estável do servidor Ollama."""
    t0 = time.perf_counter()
    raw = (base_url or "").strip().rstrip("/")
    if not raw:
        return {
            "ok": False,
            "reachable": False,
            "tier": "down",
            "message": "URL Ollama vazia (memória ou ORBITAL_MEMORY_OLLAMA_URL).",
            "latency_ms": _ms(t0),
        }
    timeout = httpx.Timeout(6.0, connect=2.5)
    try:
        with httpx.Client(timeout=timeout) as client:
            r = client.get(f"{raw}/api/tags")
        latency = _ms(t0)
        code = r.status_code
        tier = _http_tier(code)
        if tier == "up":
            msg = "Ollama respondeu (/api/tags)."
        elif tier == "degraded":
            msg = f"Resposta parcial (HTTP {code}). Ver URL e firewall."
        else:
            msg = f"HTTP {code}"
        return {
            "ok": tier == "up",
            "reachable": code is not None,
            "tier": tier,
            "status_code": code,
            "message": msg,
            "latency_ms": latency,
        }
    except httpx.ConnectError as e:
        return {
            "ok": False,
            "reachable": False,
            "tier": "down",
            "message": f"Sem conexão com Ollama: {e!s}"[:220],
            "latency_ms": _ms(t0),
        }
    except Exception as e:
        return {
            "ok": False,
            "reachable": False,
            "tier": "down",
            "message": str(e)[:220],
            "latency_ms": _ms(t0),
        }


def _probe_url(client: httpx.Client, url: str, hook_id: str = "") -> tuple[bool, int | None, str, str]:
    """
    HEAD → GET; em URLs /webhook/ com GET 404, um POST JSON com action reservada confirma n8n
    (HEAD/GET em produção são quase sempre 404; no fluxo Orbital Spotify isso cai em «unsupported» sem Spotify).
    """
    attempts: list[str] = []

    def _trace() -> str:
        return " · ".join(attempts) if attempts else "—"

    try_post_after_get_404 = False
    for method in ("HEAD", "GET"):
        try:
            r = client.request(method, url, timeout=httpx.Timeout(6.0, connect=2.5))
            code = r.status_code
            attempts.append(f"{method}→{code}")
            if method == "HEAD" and code in (404, 405):
                continue
            if method == "GET" and code == 404 and _webhook_post_probe_eligible(url):
                try_post_after_get_404 = True
                break
            ok = code < 500 and code not in (0,)
            msg = f"{method} HTTP {code}"
            _emit_integration_probe(
                f"[integration_test] webhook id={hook_id or '?'} trace={_trace()} → {msg}"
            )
            return ok, code, msg, _trace()
        except httpx.TimeoutException:
            err = "Timeout"
            _emit_integration_probe(
                f"[integration_test] webhook id={hook_id or '?'} url={url[:120]} {err} ({method}) trace={_trace()}"
            )
            return False, None, err, _trace()
        except httpx.ConnectError as e:
            err = f"Sem conexão: {e!s}"[:160]
            _emit_integration_probe(
                f"[integration_test] webhook id={hook_id or '?'} url={url[:120]} {err} trace={_trace()}"
            )
            return False, None, err, _trace()
        except Exception as e:
            err = str(e)[:160]
            if _verbose_integration_probe():
                _emit_integration_probe(
                    f"[integration_test] webhook id={hook_id or '?'} url={url[:120]} erro={err} trace={_trace()}"
                )
            else:
                logger.warning("[integration_test] webhook id=%s erro=%s", hook_id or "?", err)
            return False, None, err, _trace()

    if try_post_after_get_404:
        try:
            cal_hook = (hook_id or "").strip() == ATHENA_GOOGLE_CALENDAR_HOOK_ID or (
                "athena-google-calendar" in (url or "").lower()
            )
            probe_json = calendar_connectivity_probe_payload() if cal_hook else {"action": "__orbital_connectivity_probe__"}
            r = client.post(
                url,
                json=probe_json,
                headers={"Content-Type": "application/json"},
                timeout=httpx.Timeout(12.0, connect=2.5),
            )
            code = r.status_code
            attempts.append(f"POST→{code}")
            if 200 <= code < 300:
                msg = f"POST HTTP {code} (webhook ativo; probe sem ação Spotify)"
            elif code == 404:
                msg = "POST HTTP 404 (URL ou workflow inativo no n8n?)"
            else:
                msg = f"POST HTTP {code}"
            ok = code < 500 and code not in (0,)
            _emit_integration_probe(
                f"[integration_test] webhook id={hook_id or '?'} trace={_trace()} → {msg}"
            )
            return ok, code, msg, _trace()
        except httpx.TimeoutException:
            err = "Timeout (POST)"
            _emit_integration_probe(
                f"[integration_test] webhook id={hook_id or '?'} url={url[:120]} {err} trace={_trace()}"
            )
            return False, None, err, _trace()
        except httpx.ConnectError as e:
            err = f"Sem conexão (POST): {e!s}"[:160]
            _emit_integration_probe(
                f"[integration_test] webhook id={hook_id or '?'} url={url[:120]} {err} trace={_trace()}"
            )
            return False, None, err, _trace()
        except Exception as e:
            err = str(e)[:160]
            if _verbose_integration_probe():
                _emit_integration_probe(
                    f"[integration_test] webhook id={hook_id or '?'} POST erro={err} trace={_trace()}"
                )
            else:
                logger.warning("[integration_test] webhook id=%s POST erro=%s", hook_id or "?", err)
            return False, None, err, _trace()

    trail = _trace()
    _emit_integration_probe(
        f"[integration_test] webhook id={hook_id or '?'} sem sucesso após HEAD+GET trace={trail}"
    )
    return False, None, f"HEAD/GET sem sucesso ({trail})", trail


def test_webhooks_sample(max_hooks: int = 10) -> Dict[str, Any]:
    t0 = time.perf_counter()
    try:
        cfg = load_webhooks_config()
    except Exception as e:
        return {
            "ok": False,
            "reachable": False,
            "tier": "down",
            "message": str(e)[:200],
            "hooks": [],
            "latency_ms": _ms(t0),
        }
    raw_list = cfg.get("hooks") or []
    if not isinstance(raw_list, list) or not raw_list:
        return {
            "ok": False,
            "reachable": False,
            "tier": "down",
            "message": "Nenhum webhook configurado.",
            "hooks": [],
            "latency_ms": _ms(t0),
        }

    results: List[Dict[str, Any]] = []
    up_count = 0
    degraded_count = 0
    with httpx.Client(timeout=httpx.Timeout(20.0, connect=3.0), follow_redirects=True) as client:
        for h in raw_list[:max_hooks]:
            if not isinstance(h, dict):
                continue
            hid = str(h.get("id") or "").strip()
            url = str(h.get("url") or "").strip()
            if not url:
                results.append(
                    {
                        "id": hid or "?",
                        "ok": False,
                        "tier": "down",
                        "message": "URL vazia",
                    }
                )
                continue
            _reachable, code, msg, probe_trace = _probe_url(client, url, hook_id=hid)
            if code is not None:
                tier = _http_tier(code)
            else:
                tier = "down"
            if tier == "up":
                up_count += 1
            elif tier == "degraded":
                degraded_count += 1
            results.append(
                {
                    "id": hid or url[:32],
                    "ok": tier == "up",
                    "tier": tier,
                    "status_code": code,
                    "message": msg,
                    "probe_trace": probe_trace,
                }
            )

    latency = _ms(t0)
    n = len(results)
    if up_count > 0:
        tier = "up"
    elif degraded_count > 0 or any(r.get("tier") == "degraded" for r in results):
        tier = "degraded"
    else:
        tier = "down" if n else "down"
    summary_ok = up_count > 0 or degraded_count > 0
    return {
        "ok": summary_ok,
        "reachable": summary_ok,
        "tier": tier,
        "message": f"{up_count} OK · {degraded_count} parcial(is) · {n} testado(s)"
        if n
        else "Sem URLs.",
        "hooks": results,
        "latency_ms": latency,
    }


def run_all_integration_tests(comfy_base_url: str, ollama_base_url: str) -> Dict[str, Any]:
    """Executa testes de conectividade (Socket.IO): Supabase, ComfyUI, webhooks, Ollama."""
    return {
        "supabase": test_supabase(),
        "comfyui": test_comfyui(comfy_base_url),
        "webhooks": test_webhooks_sample(),
        "ollama": test_ollama(ollama_base_url),
    }
