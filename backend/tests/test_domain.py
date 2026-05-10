"""Domain service tests."""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_check_domains_no_key_returns_unknown(monkeypatch) -> None:
    from services import domain_service

    monkeypatch.setattr(domain_service.settings, "domainr_api_key", "", raising=False)
    domain_service._domain_cache.clear()
    result = await domain_service.check_domains("Tally")
    assert set(result.keys()) >= {"com", "ai", "app", "io"}
    assert all(v is None for v in result.values())


async def test_check_domains_parses_status(monkeypatch) -> None:
    """Mock httpx.AsyncClient.get to return a Domainr-shaped response."""
    from services import domain_service

    monkeypatch.setattr(
        domain_service.settings, "domainr_api_key", "test_key", raising=False
    )
    domain_service._domain_cache.clear()

    class _R:
        status_code = 200

        @staticmethod
        def json():
            return {
                "status": [
                    {"domain": "tally.com", "status": "active"},
                    {"domain": "tally.ai", "status": "undelegated"},
                    {"domain": "tally.app", "status": "marketed"},
                    {"domain": "tally.io", "status": "inactive"},
                ]
            }

    class _Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, *a, **kw):
            return _R()

    monkeypatch.setattr(domain_service.httpx, "AsyncClient", lambda *a, **kw: _Client(), raising=False)

    result = await domain_service.check_domains("Tally")
    assert result["com"] is False
    assert result["ai"] is True
    assert result["app"] is False
    assert result["io"] is True


async def test_check_domains_empty_name() -> None:
    from services.domain_service import check_domains

    res = await check_domains("")
    assert all(v is None for v in res.values())
