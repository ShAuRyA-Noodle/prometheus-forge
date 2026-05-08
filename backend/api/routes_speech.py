"""Speech transcription (Deepgram via services.speech_service)."""
from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from ._dependencies import get_current_user

router = APIRouter(prefix="/speech", tags=["speech"])
log = structlog.get_logger("api.speech")


class TranscribeResponse(BaseModel):
    text: str
    duration_seconds: float
    language: str


_MAX_BYTES = 16 * 1024 * 1024  # 16 MB
_ALLOWED_MIME = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/webm",
    "audio/ogg",
    "audio/flac",
}


@router.post(
    "/transcribe",
    response_model=TranscribeResponse,
    summary="Transcribe a short audio recording (mic dictation of a startup idea).",
)
async def transcribe(
    audio: UploadFile = File(..., description="Mic recording: webm/wav/m4a/mp3"),
    user=Depends(get_current_user),
) -> TranscribeResponse:
    from services import speech_service

    if audio.content_type and audio.content_type not in _ALLOWED_MIME:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "code": "UNSUPPORTED_AUDIO",
                "message": f"unsupported mime: {audio.content_type}",
                "allowed": sorted(_ALLOWED_MIME),
            },
        )

    blob = await audio.read()
    if len(blob) > _MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "PAYLOAD_TOO_LARGE", "message": "audio too large", "max_bytes": _MAX_BYTES},
        )
    if not blob:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "EMPTY_AUDIO", "message": "empty file"},
        )

    try:
        result = await speech_service.transcribe_audio(
            audio_bytes=blob,
            content_type=audio.content_type or "audio/webm",
            uid=user.uid,
        )
    except Exception as e:  # noqa: BLE001
        log.exception("speech.transcribe_failed", uid=user.uid, bytes=len(blob))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "TRANSCRIPTION_FAILED", "message": str(e)},
        ) from e

    return TranscribeResponse(
        text=getattr(result, "text", "") or result.get("text", ""),
        duration_seconds=float(getattr(result, "duration_seconds", 0.0)
                               or (result.get("duration_seconds") if isinstance(result, dict) else 0.0)),
        language=getattr(result, "language", None) or (
            result.get("language") if isinstance(result, dict) else "en"
        ) or "en",
    )
