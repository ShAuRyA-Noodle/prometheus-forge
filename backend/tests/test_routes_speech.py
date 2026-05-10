"""Speech transcribe route tests."""
from __future__ import annotations

import io

import pytest

pytestmark = pytest.mark.asyncio


async def test_transcribe_happy(client) -> None:
    files = {"audio": ("a.webm", io.BytesIO(b"\x00\x01" * 64), "audio/webm")}
    r = await client.post(
        "/api/speech/transcribe",
        files=files,
        headers={"authorization": "Bearer test"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "text" in body
    assert "duration_seconds" in body
    assert "language" in body


async def test_transcribe_unsupported_mime(client) -> None:
    files = {"audio": ("a.exe", io.BytesIO(b"x"), "application/octet-stream")}
    r = await client.post(
        "/api/speech/transcribe",
        files=files,
        headers={"authorization": "Bearer test"},
    )
    assert r.status_code == 415


async def test_transcribe_empty_file(client) -> None:
    files = {"audio": ("a.webm", io.BytesIO(b""), "audio/webm")}
    r = await client.post(
        "/api/speech/transcribe",
        files=files,
        headers={"authorization": "Bearer test"},
    )
    assert r.status_code == 400


async def test_transcribe_returns_mocked_text(client) -> None:
    files = {"audio": ("a.wav", io.BytesIO(b"RIFFxxxx"), "audio/wav")}
    r = await client.post(
        "/api/speech/transcribe",
        files=files,
        headers={"authorization": "Bearer test"},
    )
    assert r.status_code == 200
    assert r.json()["text"] == "A startup that automates X."
