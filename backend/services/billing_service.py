"""Stripe billing integration.

* ``create_checkout_session(user, tier, success_url, cancel_url)`` — creates a
  Stripe Checkout Session and returns its URL.
* ``handle_webhook(event)`` — applies subscription tier changes to Firestore.
* ``get_user_tier(uid)`` — returns the current SubscriptionTier (whisper if
  no record).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import structlog

from config import settings
from models.billing_models import StripeWebhookEvent, SubscriptionTier
from models.user_models import User

log = structlog.get_logger(__name__)


# ─── Stripe client (lazy) ───────────────────────────────────────────────────


_stripe: Any | None = None


def _get_stripe() -> Any:
    global _stripe
    if _stripe is not None:
        return _stripe
    import stripe  # type: ignore[import-not-found]

    stripe.api_key = settings.stripe_secret_key
    _stripe = stripe
    return stripe


_PRICE_BY_TIER: dict[SubscriptionTier, str] = {}


def _price_id(tier: SubscriptionTier) -> str | None:
    if not _PRICE_BY_TIER:
        _PRICE_BY_TIER.update(
            {
                SubscriptionTier.FOUNDER: settings.stripe_price_founder,
                SubscriptionTier.FOUNDER_PRO: settings.stripe_price_founder_pro,
                SubscriptionTier.TEAM: settings.stripe_price_team,
            }
        )
    return _PRICE_BY_TIER.get(tier) or None


# ─── Public API ──────────────────────────────────────────────────────────────


async def create_checkout_session(
    user: User,
    tier: SubscriptionTier,
    success_url: str,
    cancel_url: str,
    seats: int = 1,
) -> str:
    """Returns the Stripe Checkout Session URL."""
    if tier in (SubscriptionTier.WHISPER, SubscriptionTier.INTERNAL, SubscriptionTier.COHORT):
        raise ValueError(f"tier {tier} is not self-service")

    price = _price_id(tier)
    if not price:
        raise RuntimeError(f"no stripe price configured for tier {tier}")
    if not settings.stripe_secret_key:
        raise RuntimeError("STRIPE_SECRET_KEY missing")

    stripe = _get_stripe()

    def _create() -> str:
        params: dict[str, Any] = {
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "line_items": [{"price": price, "quantity": seats}],
            "client_reference_id": user.uid,
            "metadata": {"uid": user.uid, "tier": tier.value, "seats": str(seats)},
            "allow_promotion_codes": True,
        }
        if user.stripe_customer_id:
            params["customer"] = user.stripe_customer_id
        elif user.email:
            params["customer_email"] = str(user.email)
        sess = stripe.checkout.Session.create(**params)
        return str(sess.url)

    url = await asyncio.to_thread(_create)
    log.info("billing.checkout.created", uid=user.uid, tier=tier.value)
    return url


async def handle_webhook(event: StripeWebhookEvent) -> None:
    """Apply subscription state changes to Firestore."""
    from services import firestore_service

    et = event.type
    obj = event.data.get("object", {}) if event.data else {}

    log.info("billing.webhook.received", type=et)

    uid: str | None = None
    new_tier: SubscriptionTier | None = None

    if et == "checkout.session.completed":
        uid = obj.get("client_reference_id") or (obj.get("metadata") or {}).get("uid")
        tier_val = (obj.get("metadata") or {}).get("tier")
        if tier_val:
            try:
                new_tier = SubscriptionTier(tier_val)
            except ValueError:
                new_tier = None

    elif et in ("customer.subscription.updated", "customer.subscription.created"):
        uid = (obj.get("metadata") or {}).get("uid")
        items = ((obj.get("items") or {}).get("data") or [])
        if items:
            price_id = (items[0].get("price") or {}).get("id")
            for tier_e, pid in {
                SubscriptionTier.FOUNDER: settings.stripe_price_founder,
                SubscriptionTier.FOUNDER_PRO: settings.stripe_price_founder_pro,
                SubscriptionTier.TEAM: settings.stripe_price_team,
            }.items():
                if pid and pid == price_id:
                    new_tier = tier_e
                    break

    elif et == "customer.subscription.deleted":
        uid = (obj.get("metadata") or {}).get("uid")
        new_tier = SubscriptionTier.WHISPER

    if not uid:
        log.warning("billing.webhook.no_uid", type=et)
        return

    user = await firestore_service.get_user(uid)
    if user is None:
        log.warning("billing.webhook.unknown_user", uid=uid)
        return

    if new_tier is not None and new_tier != user.tier:
        user.tier = new_tier
        # capture stripe customer id
        cust_id = obj.get("customer") or (obj.get("subscription") and obj["subscription"].get("customer"))
        if isinstance(cust_id, str):
            user.stripe_customer_id = cust_id
        user.last_active_at = datetime.now(timezone.utc)
        await firestore_service.upsert_user(user)
        log.info("billing.tier.updated", uid=uid, tier=new_tier.value)


async def get_user_tier(uid: str) -> SubscriptionTier:
    from services import firestore_service

    user = await firestore_service.get_user(uid)
    if user is None:
        return SubscriptionTier.WHISPER
    return user.tier


__all__ = ["create_checkout_session", "get_user_tier", "handle_webhook"]
