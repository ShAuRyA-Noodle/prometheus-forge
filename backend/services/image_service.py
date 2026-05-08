"""Hero / logo image generation.

Vertex Imagen 3 primary, Recraft API fallback. Output is uploaded to a Cloud
Storage bucket and a v4 signed URL (24h) is returned. If neither service is
configured, returns ``None`` and emits a structured warning.

Bucket: ``{project}-prometheus-images``. Public ACL is NEVER set; we always
hand back a signed URL.
"""
from __future__ import annotations

import asyncio
import io
import time
import uuid
from datetime import timedelta
from typing import Any

import httpx
import structlog

from config import settings
from models.agent_schemas import BrandIdentityResult

log = structlog.get_logger(__name__)


_BUCKET_NAME_TEMPLATE = "{project}-prometheus-images"


# ─── Storage helpers ────────────────────────────────────────────────────────


_storage_client: Any | None = None


def _get_storage() -> Any:
    global _storage_client
    if _storage_client is not None:
        return _storage_client
    from google.cloud import storage  # type: ignore[import-not-found]

    _storage_client = storage.Client(project=settings.google_cloud_project)
    return _storage_client


def _bucket_name() -> str:
    return _BUCKET_NAME_TEMPLATE.format(project=settings.google_cloud_project)


async def _upload_and_sign(image_bytes: bytes, suffix: str = "png") -> str | None:
    def _do() -> str | None:
        try:
            client = _get_storage()
            bucket = client.bucket(_bucket_name())
            blob = bucket.blob(f"{int(time.time())}-{uuid.uuid4().hex}.{suffix}")
            blob.upload_from_file(
                io.BytesIO(image_bytes),
                content_type=f"image/{suffix}",
            )
            return blob.generate_signed_url(
                version="v4",
                expiration=timedelta(hours=24),
                method="GET",
            )
        except Exception as e:  # noqa: BLE001
            log.warning("image.gcs_upload_failed", err=str(e))
            return None

    return await asyncio.to_thread(_do)


# ─── Imagen primary ──────────────────────────────────────────────────────────


async def _vertex_imagen_generate(prompt: str, aspect_ratio: str = "16:9") -> bytes | None:
    def _do() -> bytes | None:
        try:
            from vertexai.preview.vision_models import ImageGenerationModel  # type: ignore[import-not-found]
            import vertexai  # type: ignore[import-not-found]

            vertexai.init(
                project=settings.google_cloud_project,
                location=settings.imagen_location,
            )
            model = ImageGenerationModel.from_pretrained("imagen-3.0-generate-001")
            resp = model.generate_images(
                prompt=prompt,
                number_of_images=1,
                aspect_ratio=aspect_ratio,
                safety_filter_level="block_some",
                person_generation="allow_adult",
                add_watermark=False,
            )
            if not resp.images:
                return None
            img = resp.images[0]
            data = getattr(img, "_image_bytes", None) or getattr(img, "image_bytes", None)
            if data is None and hasattr(img, "_pil_image"):
                buf = io.BytesIO()
                img._pil_image.save(buf, format="PNG")
                data = buf.getvalue()
            return bytes(data) if data else None
        except Exception as e:  # noqa: BLE001
            log.warning("image.imagen_failed", err=str(e))
            return None

    return await asyncio.to_thread(_do)


# ─── Recraft fallback ───────────────────────────────────────────────────────


async def _recraft_generate(prompt: str, style: str = "digital_illustration") -> bytes | None:
    if not settings.recraft_api_key:
        return None
    headers = {
        "Authorization": f"Bearer {settings.recraft_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "prompt": prompt,
        "style": style,
        "size": "1820x1024",
        "n": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            r = await client.post(
                "https://external.api.recraft.ai/v1/images/generations",
                json=payload,
                headers=headers,
            )
            if r.status_code != 200:
                log.warning("image.recraft.non200", status=r.status_code)
                return None
            data = r.json()
            url = (data.get("data") or [{}])[0].get("url")
            if not url:
                return None
            img = await client.get(url, timeout=30.0)
            if img.status_code != 200:
                return None
            return img.content
    except Exception as e:  # noqa: BLE001
        log.warning("image.recraft_failed", err=str(e))
        return None


# ─── Public API ─────────────────────────────────────────────────────────────


async def generate_hero_image(brand: BrandIdentityResult, prompt: str) -> str | None:
    """Generate a 16:9 hero image for the landing page. Returns signed URL or None."""
    palette = ", ".join(c.hex for c in brand.color_palette[:3])
    full_prompt = (
        f"Professional landing page hero illustration for '{brand.company_name}', "
        f"a startup whose tagline is '{brand.tagline}'. "
        f"Brand colors: {palette}. "
        f"Style: clean, modern, editorial, no text, no logos, no people facing camera. "
        f"Subject: {prompt}"
    )

    img = await _vertex_imagen_generate(full_prompt, aspect_ratio="16:9")
    if img is None:
        img = await _recraft_generate(full_prompt, style="digital_illustration")
    if img is None:
        log.warning("image.hero.unavailable", company=brand.company_name)
        return None

    return await _upload_and_sign(img, suffix="png")


async def generate_logo(brand: BrandIdentityResult) -> str | None:
    """Generate a square logo. Returns signed URL or None."""
    palette = ", ".join(c.hex for c in brand.color_palette[:2])
    full_prompt = (
        f"Minimalist vector-style logo mark for '{brand.company_name}'. "
        f"Description: {brand.logo_concept_description}. "
        f"Colors: {palette}. Solid background, square aspect, clean geometric shape, "
        f"no text in image, professional, suitable for a startup brand."
    )
    img = await _vertex_imagen_generate(full_prompt, aspect_ratio="1:1")
    if img is None:
        img = await _recraft_generate(full_prompt, style="vector_illustration")
    if img is None:
        log.warning("image.logo.unavailable", company=brand.company_name)
        return None
    return await _upload_and_sign(img, suffix="png")


__all__ = ["generate_hero_image", "generate_logo"]
