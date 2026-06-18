from typing import Literal

Role = Literal["admin", "designer", "viewer", "component_designer", "component_qa"]

ROLE_ORDER: dict[Role, int] = {
    "viewer": 1,
    "component_designer": 1,
    "component_qa": 1,
    "designer": 2,
    "admin": 3,
}

ROLE_LABELS: dict[Role, str] = {
    "admin": "Admin",
    "designer": "Designer",
    "viewer": "Viewer",
    "component_designer": "Component Designer",
    "component_qa": "Component QA",
}

CATALOG_READ_ROLES: frozenset[Role] = frozenset(
    {"admin", "designer", "component_designer", "component_qa"}
)
CATALOG_WRITE_ROLES: frozenset[Role] = frozenset({"admin", "component_designer"})
CATALOG_QA_ROLES: frozenset[Role] = frozenset({"admin", "component_qa"})
PROJECT_VIEW_ROLES: frozenset[Role] = frozenset(
    {"viewer", "component_designer", "component_qa"}
)


def normalize_role(value: str | None) -> Role | None:
    if value is None:
        return None
    lowered = value.strip().lower()
    if lowered not in ROLE_ORDER:
        return None
    return lowered  # type: ignore[return-value]


def role_meets_minimum(role: Role, minimum: Role) -> bool:
    return ROLE_ORDER[role] >= ROLE_ORDER[minimum]


def role_label(role: Role) -> str:
    return ROLE_LABELS[role]


def role_matches_allowed_role(role: Role, allowed_roles: list[str]) -> bool:
    if role in allowed_roles:
        return True
    return role in PROJECT_VIEW_ROLES and "viewer" in allowed_roles
