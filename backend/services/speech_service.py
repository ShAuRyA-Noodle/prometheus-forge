"""Speech-to-text wrappers.

Primary: Deepgram Nova-2 (REST + WebSocket streaming).
Fallback: Google Cloud Speech-to-Text v2.

If neither is available, returns ``""`` and emits a structured warning.
"""
from __future__ import annotations

import asyncio
import io
from typing import Any, AsyncIterator

import httpx
import structlog

from config import settings

log = structlog.get_logger(__name__)


_DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"


# ─── Deepgram REST ──────────────────────────────────────────────────────────


async def _deepgram_transcribe(audio_bytes: bytes, locale: str) -> str | None:
    if not settings.deepgram_api_key:
        return None
    headers = {
        "Authorization": f"Token {settings.deepgram_api_key}",
        "Content-Type": "audio/*",
    }
    params = {
        "model": "nova-2",
        "language": locale,
        "smart_format": "true",
        "punctuate": "true",
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                _DEEPGRAM_URL, params=params, headers=headers, content=audio_bytes
            )
            if r.status_code != 200:
                log.warning("speech.deepgram.non200", status=r.status_code)
                return None
            data = r.json()
            try:
                return str(
                    data["results"]["channels"][0]["alternatives"][0]["transcript"]
                )
            except (KeyError, IndexError, TypeError):
                return ""
    except Exception as e:  # noqa: BLE001
        log.warning("speech.deepgram.error", err=str(e))
        return None


# ─── GCP Speech v2 fallback ─────────────────────────────────────────────────


async def _gcp_transcribe(audio_bytes: bytes, locale: str) -> str | None:
    def _do() -> str | None:
        try:
            from google.cloud import speech_v2  # type: ignore[import-not-found]
        except Exception as e:  # noqa: BLE001
            log.warning("speech.gcp.unavailable", err=str(e))
            return None

        try:
            client = speech_v2.SpeechClient()
            recognizer_path = client.recognizer_path(
                settings.google_cloud_project, settings.google_cloud_region, "_"
            )
            config = speech_v2.RecognitionConfig(
                auto_decoding_config=speech_v2.AutoDetectDecodingConfig(),
                language_codes=[locale],
                model="long",
            )
            request = speech_v2.RecognizeRequest(
                recognizer=recognizer_path,
                config=config,
                content=audio_bytes,
            )
            resp = client.recognize(request=request)
            chunks: list[str] = []
            for r in resp.results:
                if r.alternatives:
                    chunks.append(r.alternatives[0].transcript)
            return " ".join(c.strip() for c in chunks if c.strip())
        except Exception as e:  # noqa: BLE001
            log.warning("speech.gcp.error", err=str(e))
            return None

    return await asyncio.to_thread(_do)


# ─── Public ─────────────────────────────────────────────────────────────────


def _read_audio(file_or_stream: Any) -> bytes:
    if isinstance(file_or_stream, (bytes, bytearray)):
        return bytes(file_or_stream)
    if isinstance(file_or_stream, io.IOBase):
        return file_or_stream.read()
    if hasattr(file_or_stream, "read"):
        return file_or_stream.read()
    raise TypeError(f"unsupported audio source: {type(file_or_stream)}")


async def transcribe_audio(file_or_stream: Any, locale: str = "en-US") -> str:
    audio = await asyncio.to_thread(_read_audio, file_or_stream)

    primary = await _deepgram_transcribe(audio, locale)
    if primary is not None:
        return primary or ""

    fallback = await _gcp_transcribe(audio, locale)
    if fallback is not None:
        return fallback or ""

    log.warning("speech.no_provider")
    return ""


# ─── Streaming variant ──────────────────────────────────────────────────────


async def transcribe_stream(
    audio_chunks: AsyncIterator[bytes], locale: str = "en-US"
) -> AsyncIterator[str]:
    """Real-time streaming via Deepgram websocket. Yields interim + final
    transcripts. Falls back to buffering + single-shot transcribe if Deepgram
    isn't configured."""
    if not settings.deepgram_api_key:
        # Buffer + single-shot
        buf = bytearray()
        async for chunk in audio_chunks:
            buf.extend(chunk)
        text = await transcribe_audio(bytes(buf), locale)
        if text:
            yield text
        return

    try:
        import websockets  # type: ignore[import-not-found]
    except Exception as e:  # noqa: BLE001
        log.warning("speech.stream.no_websockets", err=str(e))
        buf = bytearray()
        async for chunk in audio_chunks:
            buf.extend(chunk)
        text = await transcribe_audio(bytes(buf), locale)
        if text:
            yield text
        return

    url = (
        "wss://api.deepgram.com/v1/listen"
        f"?model=nova-2&language={locale}&interim_results=true&punctuate=true"
    )
    headers = {"Authorization": f"Token {settings.deepgram_api_key}"}

    try:
        async with websockets.connect(url, additional_headers=headers) as ws:  # type: ignore[arg-type]
            async def _producer() -> None:
                async for chunk in audio_chunks:
                    await ws.send(chunk)
                # Empty close frame signals end of audio
                await ws.send(b"")

            prod = asyncio.create_task(_producer())
            try:
                async for msg in ws:
                    import json

                    if isinstance(msg, bytes):
                        continue
                    data = json.loads(msg)
                    alt = (
                        data.get("channel", {})
                        .get("alternatives", [{}])[0]
                        .get("transcript", "")
                    )
                    if alt:
                        yield alt
                    if data.get("type") == "Finalize":
                        break
            finally:
                prod.cancel()
    except Exception as e:  # noqa: BLE001
        log.warning("speech.stream.error", err=str(e))
        return


__all__ = ["transcribe_audio", "transcribe_stream"]
