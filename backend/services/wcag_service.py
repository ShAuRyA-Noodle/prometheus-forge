"""WCAG color-contrast validation.

Computes contrast ratios for each ``ColorEntry`` against pure white (#FFFFFF)
and pure black (#000000). Marks ``wcag_aa_normal=True`` when contrast >= 4.5
(the WCAG 2.1 AA threshold for normal-size text).

Also provides ``pick_high_contrast_pair`` that returns a (foreground, background)
pair from a palette guaranteeing at least AA contrast.
"""
from __future__ import annotations

from typing import Iterable

import structlog

from models.agent_schemas import ColorEntry

log = structlog.get_logger(__name__)


# ─── Contrast math (sRGB → relative luminance, WCAG 2.1 §1.4.3) ─────────────


def _hex_to_rgb(hex_str: str) -> tuple[float, float, float]:
    h = hex_str.lstrip("#")
    if len(h) != 6:
        raise ValueError(f"invalid hex: {hex_str}")
    return (
        int(h[0:2], 16) / 255.0,
        int(h[2:4], 16) / 255.0,
        int(h[4:6], 16) / 255.0,
    )


def _channel_lum(c: float) -> float:
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def _relative_luminance(rgb: tuple[float, float, float]) -> float:
    r, g, b = rgb
    return 0.2126 * _channel_lum(r) + 0.7152 * _channel_lum(g) + 0.0722 * _channel_lum(b)


def contrast_ratio(hex_a: str, hex_b: str) -> float:
    """Returns the WCAG contrast ratio (1..21)."""
    try:
        # Prefer wcag-contrast-ratio package when available
        import wcag_contrast_ratio as wcr  # type: ignore[import-not-found]

        rgb_a = _hex_to_rgb(hex_a)
        rgb_b = _hex_to_rgb(hex_b)
        return float(wcr.rgb(rgb_a, rgb_b))
    except Exception:
        la = _relative_luminance(_hex_to_rgb(hex_a))
        lb = _relative_luminance(_hex_to_rgb(hex_b))
        lighter = max(la, lb)
        darker = min(la, lb)
        return (lighter + 0.05) / (darker + 0.05)


# ─── Public API ─────────────────────────────────────────────────────────────


def validate_palette(colors: Iterable[ColorEntry]) -> list[ColorEntry]:
    """Augments each ``ColorEntry`` in-place with contrast vs white & black,
    plus ``wcag_aa_normal``. Returns the new list (entries copied)."""
    out: list[ColorEntry] = []
    for c in colors:
        try:
            on_white = contrast_ratio(c.hex, "#FFFFFF")
            on_black = contrast_ratio(c.hex, "#000000")
        except Exception as e:  # noqa: BLE001
            log.warning("wcag.invalid_hex", hex=c.hex, err=str(e))
            on_white = 0.0
            on_black = 0.0

        out.append(
            c.model_copy(
                update={
                    "contrast_on_white": round(on_white, 2),
                    "contrast_on_black": round(on_black, 2),
                    "wcag_aa_normal": max(on_white, on_black) >= 4.5,
                }
            )
        )
    return out


def pick_high_contrast_pair(palette: Iterable[ColorEntry]) -> tuple[str, str]:
    """Pick (foreground, background) hex pair from palette maximizing contrast.
    Caller can use this to set body text vs page bg."""
    cs = list(palette)
    if not cs:
        return ("#0F172A", "#FFFFFF")

    best: tuple[str, str] = (cs[0].hex, "#FFFFFF")
    best_ratio = 0.0
    candidates_bg = ["#FFFFFF", "#000000"] + [c.hex for c in cs]
    for fg in cs:
        for bg in candidates_bg:
            if fg.hex.upper() == bg.upper():
                continue
            r = contrast_ratio(fg.hex, bg)
            if r > best_ratio:
                best_ratio = r
                best = (fg.hex, bg)
    return best


__all__ = ["contrast_ratio", "pick_high_contrast_pair", "validate_palette"]
