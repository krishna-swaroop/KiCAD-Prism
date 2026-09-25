from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.catalog.collaborators import (  # noqa: E402
    CatalogCollaborators,
    build_catalog_collaborators,
)
from app.services.catalog.locking import NoopCatalogLocks, PostgresCatalogLocks  # noqa: E402
from app.services.component_catalog_domain import ComponentCatalogDomainService  # noqa: E402
from app.services.component_catalog_service_postgres import (  # noqa: E402
    ComponentCatalogPostgresService,
)


def _graph_object_ids(graph: CatalogCollaborators) -> set[int]:
    return {id(getattr(graph, field)) for field in graph.__dataclass_fields__}


def _owned_object_ids(service: object) -> set[int]:
    owned: set[int] = set()
    for value in service.__dict__.values():
        if value is None or isinstance(value, (bool, int, float, str, bytes)):
            continue
        owned.add(id(value))
    return owned


class CatalogCollaboratorConstructionTests(unittest.TestCase):
    def test_two_graphs_own_independent_locks_and_collaborators(self) -> None:
        first = build_catalog_collaborators(catalog_locks=NoopCatalogLocks())
        second = build_catalog_collaborators(catalog_locks=PostgresCatalogLocks())
        self.assertIsNot(first.catalog_locks, second.catalog_locks)
        self.assertIsNot(first.revision_kernel, second.revision_kernel)
        self.assertIsNot(first.asset_imports, second.asset_imports)
        self.assertFalse(_graph_object_ids(first) & _graph_object_ids(second))

    def test_service_instances_do_not_share_runtime_or_point_at_each_other(self) -> None:
        with tempfile.TemporaryDirectory() as first_dir, tempfile.TemporaryDirectory() as second_dir:
            first = ComponentCatalogDomainService(store_root=Path(first_dir))
            second = ComponentCatalogDomainService(store_root=Path(second_dir))
            self.assertNotEqual(first.store_root, second.store_root)
            first_ids = _owned_object_ids(first)
            second_ids = _owned_object_ids(second)
            self.assertFalse(first_ids & second_ids)
            for value in first.__dict__.values():
                inner = getattr(value, "__dict__", None)
                if not inner:
                    continue
                for nested in inner.values():
                    self.assertIsNot(nested, first)
                    self.assertIsNot(nested, second)

    def test_facade_declares_every_collaborator_attribute(self) -> None:
        declared = ComponentCatalogDomainService.__annotations__
        for field in CatalogCollaborators.__dataclass_fields__:
            self.assertIn(f"_{field}", declared)

    def test_bind_requires_declared_collaborator_annotations(self) -> None:
        graph = build_catalog_collaborators(catalog_locks=NoopCatalogLocks())

        class MissingAnnotations:
            pass

        with self.assertRaises(AttributeError) as raised:
            graph.bind(MissingAnnotations())
        self.assertIn("_revision_kernel", str(raised.exception))

    def test_postgres_instances_do_not_share_runtime(self) -> None:
        with tempfile.TemporaryDirectory() as first_dir, tempfile.TemporaryDirectory() as second_dir:
            first = ComponentCatalogPostgresService(store_root=Path(first_dir))
            second = ComponentCatalogPostgresService(store_root=Path(second_dir))
            self.assertNotEqual(first.store_root, second.store_root)
            self.assertFalse(_owned_object_ids(first) & _owned_object_ids(second))


if __name__ == "__main__":
    unittest.main()
