"""Shared FastAPI dependencies (current user, etc.)."""
from __future__ import annotations

from fastapi import HTTPException, Request, status

from middleware.auth import AuthedUser


def get_current_user(request: Request) -> AuthedUser:
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHORIZED", "message": "no authenticated user"},
        )
    return user


def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "no-request-id")


def require_role(*roles: str):  # noqa: ANN201
    def _dep(user: AuthedUser = None) -> AuthedUser:  # type: ignore[assignment]
        # Note: FastAPI will resolve via Depends(get_current_user) when wired up.
        if user is None or user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FORBIDDEN", "message": "insufficient role"},
            )
        return user
    return _dep
