"""Stripe checkout, webhook, customer portal."""
from __future__ import annotations

import structlog
import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel

from config import settings
from models.billing_models import CheckoutRequest

from ._dependencies import get_current_user

router = APIRouter(prefix="/billing", tags=["billing"])
log = structlog.get_logger("api.billing")


class CheckoutResponse(BaseModel):
    url: str
    session_id: str


class PortalResponse(BaseModel):
    url: str


@router.post(
    "/checkout",
    response_model=CheckoutResponse,
    summary="Create a Stripe Checkout session for the requested tier.",
)
async def create_checkout(
    payload: CheckoutRequest,
    user=Depends(get_current_user),
) -> CheckoutResponse:
    from services import billing_service

    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "BILLING_NOT_CONFIGURED", "message": "stripe not configured"},
        )

    try:
        checkout = await billing_service.create_checkout_session(
            uid=user.uid,
            email=user.email,
            tier=payload.tier,
            seats=payload.seats,
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
        )
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        log.exception("stripe.checkout_failed", uid=user.uid)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "STRIPE_ERROR", "message": str(e)},
        ) from e

    return CheckoutResponse(url=checkout.url, session_id=checkout.id)


@router.post(
    "/webhook",
    summary="Stripe webhook ingest. Verified by signature, then dispatched to billing_worker.",
    include_in_schema=False,
)
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
) -> dict:
    if stripe_signature is None or not settings.stripe_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BAD_SIGNATURE", "message": "missing signature"},
        )

    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=stripe_signature,
            secret=settings.stripe_webhook_secret,
        )
    except (stripe.error.SignatureVerificationError, ValueError) as e:  # type: ignore[attr-defined]
        log.warning("stripe.webhook.bad_signature", err=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "BAD_SIGNATURE", "message": "stripe signature invalid"},
        ) from e

    from workers.billing_worker import handle_stripe_event

    await handle_stripe_event(event)
    return {"received": True, "type": event["type"], "id": event["id"]}


@router.get(
    "/portal",
    response_model=PortalResponse,
    summary="Stripe Customer Portal redirect URL.",
)
async def billing_portal(user=Depends(get_current_user)) -> PortalResponse:
    from services import billing_service, firestore_service

    fetch = getattr(firestore_service, "get_user", None)
    customer_id = None
    if callable(fetch):
        record = await fetch(user.uid)
        if record is not None:
            customer_id = record.stripe_customer_id

    if not customer_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NO_CUSTOMER", "message": "no Stripe customer for this user"},
        )

    portal_fn = getattr(billing_service, "create_portal_session", None)
    if not callable(portal_fn):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={"code": "NOT_IMPLEMENTED", "message": "portal not wired"},
        )

    portal = await portal_fn(customer_id=customer_id)
    return PortalResponse(url=portal.url)
