from typing import Literal, Optional

Role = Literal["admin", "designer", "viewer", "qa"]

_LEGACY_ROLES = {
    "component_designer": "designer",
    "component_qa": "qa",
}

ROLE_ORDER: dict[Role, int] = {
    "viewer": 1,
    "qa": 1,
    "designer": 2,
    "admin": 3,
}

ROLE_LABELS: dict[Role, str] = {
    "admin": "Admin",
    "designer": "Designer",
    "viewer": "Viewer",
    "qa": "QA",
}

CATALOG_READ_ROLES: frozenset[Role] = frozenset({"admin", "designer", "qa"})
# Browsing the component database (list, detail, revisions, previews, the
# metadata grid, the release queue) is open to viewers too (System Builder
# D-P2-24). Operational reads (imports, jobs, validation runs, inventory
# export, health) stay on CATALOG_READ_ROLES.
CATALOG_BROWSE_ROLES: frozenset[Role] = CATALOG_READ_ROLES | frozenset({"viewer"})
CATALOG_WRITE_ROLES: frozenset[Role] = frozenset({"admin", "designer"})
CATALOG_QA_ROLES: frozenset[Role] = frozenset({"admin", "qa"})
# Supply data follows the catalog: same people read it. Write and approve sets
# are added with the features that use them.
SUPPLY_READ_ROLES: frozenset[Role] = CATALOG_READ_ROLES
# Matching decisions (confirm a spelling, pin or reject a listing) follow catalog QA.
SUPPLY_APPROVE_ROLES: frozenset[Role] = CATALOG_QA_ROLES
# Watching parts and changing watch rules follow catalog writes.
SUPPLY_WRITE_ROLES: frozenset[Role] = CATALOG_WRITE_ROLES
PROJECT_VIEW_ROLES: frozenset[Role] = frozenset({"viewer", "qa"})
PROJECT_RELEASE_ACTOR_ROLES: frozenset[Role] = frozenset({"admin", "designer", "qa"})


def normalize_role(value: Optional[str]) -> Optional[Role]:
    if value is None:
        return None
    lowered = value.strip().lower()
    lowered = _LEGACY_ROLES.get(lowered, lowered)
    if lowered not in ROLE_ORDER:
        return None
    return lowered  # type: ignore[return-value]


def role_meets_minimum(role: Role, minimum: Role) -> bool:
    return ROLE_ORDER[role] >= ROLE_ORDER[minimum]


def role_label(role: Role) -> str:
    return ROLE_LABELS[role]
