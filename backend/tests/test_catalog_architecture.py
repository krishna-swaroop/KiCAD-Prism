from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path
import sys
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1].parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

import check_catalog_architecture as architecture  # noqa: E402
import check_agent_docs as agent_docs  # noqa: E402


class AgentDocumentationTests(unittest.TestCase):
    def test_root_task_skill_table_requires_every_canonical_skill(self) -> None:
        text = (
            "## Task skills\n"
            "| Task | Skill |\n"
            "| --- | --- |\n"
            "| Quality | `.agents/skills/prism-quality-gate/SKILL.md` |\n"
            "## Other section\n"
        )

        self.assertEqual(
            agent_docs.canonical_skill_table_failures(
                text,
                {"prism-quality-gate", "prism-catalog-change"},
            ),
            ["Root AGENTS.md task-skill table omits canonical skill -> prism-catalog-change"],
        )

    def test_task_skill_table_entries_after_the_table_do_not_satisfy_it(self) -> None:
        text = (
            "## Task skills\n"
            "| Task | Skill |\n"
            "| --- | --- |\n"
            "## Navigation\n"
            "See `.agents/skills/prism-catalog-change/SKILL.md`.\n"
        )

        self.assertEqual(
            agent_docs.canonical_skill_table_failures(text, {"prism-catalog-change"}),
            ["Root AGENTS.md task-skill table omits canonical skill -> prism-catalog-change"],
        )


class CatalogImportBoundaryTests(unittest.TestCase):
    def test_catalog_modules_cannot_import_legacy_facades_or_domain(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            catalog = root / "backend" / "app" / "services" / "catalog"
            catalog.mkdir(parents=True)
            (catalog / "__init__.py").write_text("", encoding="utf-8")
            (catalog / "absolute.py").write_text(
                "from app.services.component_catalog_domain import ComponentCatalogDomainService\n",
                encoding="utf-8",
            )
            (catalog / "relative.py").write_text(
                "from ..component_catalog_service_postgres import ComponentCatalogPostgresService\n",
                encoding="utf-8",
            )
            (catalog / "imported.py").write_text(
                "import app.services.component_catalog_service\n",
                encoding="utf-8",
            )
            (catalog / "from_parent.py").write_text(
                "from app.services import component_catalog_domain\n",
                encoding="utf-8",
            )

            violations = architecture.catalog_import_violations(root)

        self.assertEqual(
            [(item.path, item.module) for item in violations],
            [
                (
                    "backend/app/services/catalog/absolute.py",
                    "app.services.component_catalog_domain",
                ),
                (
                    "backend/app/services/catalog/from_parent.py",
                    "app.services.component_catalog_domain",
                ),
                (
                    "backend/app/services/catalog/imported.py",
                    "app.services.component_catalog_service",
                ),
                (
                    "backend/app/services/catalog/relative.py",
                    "app.services.component_catalog_service_postgres",
                ),
            ],
        )


class CatalogPrivateRatchetTests(unittest.TestCase):
    def _fake_catalog_tree(self, root: Path) -> Path:
        services = root / "backend" / "app" / "services"
        services.mkdir(parents=True)
        (services / "component_catalog_domain.py").write_text(
            "class ComponentCatalogDomainService:\n"
            "    def _connect(self):\n"
            "        return None\n"
            "\n"
            "    def _private_helper(self):\n"
            "        self._connect()\n",
            encoding="utf-8",
        )
        (services / "component_catalog_service_postgres.py").write_text(
            "from app.services.component_catalog_domain import ComponentCatalogDomainService\n"
            "class ComponentCatalogPostgresService(ComponentCatalogDomainService):\n"
            "    pass\n",
            encoding="utf-8",
        )
        (services / "component_catalog_service.py").write_text(
            "from app.services.component_catalog_service_postgres import ComponentCatalogPostgresService\n"
            "catalog_service = ComponentCatalogPostgresService()\n",
            encoding="utf-8",
        )
        return services

    def test_ast_private_use_scan_excludes_legacy_implementation_calls(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._fake_catalog_tree(root)
            consumer = root / "backend" / "consumer.py"
            consumer.parent.mkdir(parents=True, exist_ok=True)
            consumer.write_text(
                "from app.services.component_catalog_service import catalog_service\n"
                "catalog_service._connect()\n",
                encoding="utf-8",
            )

            uses = architecture.private_catalog_uses(root)

        self.assertEqual(
            [(item.path, item.symbol, item.count) for item in uses],
            [("backend/consumer.py", "_connect", 1)],
        )

    def test_new_catalog_class_private_use_is_discovered_from_outside_package(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._fake_catalog_tree(root)
            catalog = root / "backend" / "app" / "services" / "catalog"
            catalog.mkdir(parents=True)
            (catalog / "__init__.py").write_text("", encoding="utf-8")
            (catalog / "thing.py").write_text(
                "class CatalogThing:\n"
                "    def _private(self):\n"
                "        return None\n",
                encoding="utf-8",
            )
            consumer = root / "backend" / "consumer.py"
            consumer.write_text(
                "from app.services.catalog.thing import CatalogThing\n"
                "thing = CatalogThing()\n"
                "thing._private()\n",
                encoding="utf-8",
            )

            members = architecture.load_legacy_members(root)
            uses = architecture.private_catalog_uses(root, members)

        self.assertIn("_private", members.all_members)
        self.assertEqual(
            members.class_members["app.services.catalog.thing:CatalogThing"],
            frozenset({"_private"}),
        )
        self.assertEqual(
            [(item.path, item.symbol, item.count) for item in uses],
            [("backend/consumer.py", "_private", 1)],
        )

    def test_subclass_constructor_and_new_calls_preserve_legacy_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._fake_catalog_tree(root)
            consumer = root / "backend" / "consumer.py"
            consumer.write_text(
                "from app.services.component_catalog_domain import ComponentCatalogDomainService\n"
                "\n"
                "class LocalCatalog(ComponentCatalogDomainService):\n"
                "    def helper(self):\n"
                "        self._connect()\n"
                "\n"
                "class DeeperCatalog(LocalCatalog):\n"
                "    pass\n"
                "\n"
                "constructed = LocalCatalog()\n"
                "constructed._connect()\n"
                "from_new = DeeperCatalog.__new__(DeeperCatalog)\n"
                "from_new._connect()\n"
                "from_object_new = object.__new__(DeeperCatalog)\n"
                "from_object_new._connect()\n",
                encoding="utf-8",
            )

            uses = architecture.private_catalog_uses(root)

        self.assertEqual(
            [(item.path, item.symbol, item.count) for item in uses],
            [("backend/consumer.py", "_connect", 4)],
        )

    def test_subclass_constructor_and_new_calls_preserve_new_catalog_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._fake_catalog_tree(root)
            catalog = root / "backend" / "app" / "services" / "catalog"
            catalog.mkdir(parents=True)
            (catalog / "thing.py").write_text(
                "class CatalogThing:\n"
                "    def _private(self):\n"
                "        return None\n",
                encoding="utf-8",
            )
            consumer = root / "backend" / "consumer.py"
            consumer.write_text(
                "from app.services.catalog.thing import CatalogThing\n"
                "\n"
                "class LocalThing(CatalogThing):\n"
                "    pass\n"
                "\n"
                "constructed = LocalThing()\n"
                "constructed._private()\n"
                "from_new = LocalThing.__new__(LocalThing)\n"
                "from_new._private()\n"
                "from_object_new = object.__new__(LocalThing)\n"
                "from_object_new._private()\n",
                encoding="utf-8",
            )

            uses = architecture.private_catalog_uses(root)

        self.assertEqual(
            [(item.path, item.symbol, item.count) for item in uses],
            [("backend/consumer.py", "_private", 3)],
        )

    def test_local_factory_return_preserves_catalog_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._fake_catalog_tree(root)
            consumer = root / "backend" / "consumer.py"
            consumer.write_text(
                "from app.services.component_catalog_service import catalog_service\n"
                "\n"
                "def helper():\n"
                "    return catalog_service\n"
                "\n"
                "helper()._connect()\n",
                encoding="utf-8",
            )

            uses = architecture.private_catalog_uses(root)

        self.assertEqual(
            [(item.path, item.symbol, item.count) for item in uses],
            [("backend/consumer.py", "_connect", 1)],
        )

    def test_factory_alias_and_fixed_point_preserve_catalog_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._fake_catalog_tree(root)
            consumer = root / "backend" / "consumer.py"
            consumer.write_text(
                "from app.services.component_catalog_service import catalog_service\n"
                "\n"
                "def inner():\n"
                "    return catalog_service\n"
                "\n"
                "def outer():\n"
                "    return inner()\n"
                "\n"
                "alias = inner\n"
                "\n"
                "inner()._connect()\n"
                "outer()._connect()\n"
                "alias()._connect()\n",
                encoding="utf-8",
            )

            uses = architecture.private_catalog_uses(root)

        self.assertEqual(
            [(item.path, item.symbol, item.count) for item in uses],
            [("backend/consumer.py", "_connect", 3)],
        )

    def test_super_private_call_inside_catalog_subclass_is_counted(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self._fake_catalog_tree(root)
            consumer = root / "backend" / "consumer.py"
            consumer.write_text(
                "from app.services.component_catalog_domain import ComponentCatalogDomainService\n"
                "\n"
                "class LocalCatalog(ComponentCatalogDomainService):\n"
                "    def helper(self):\n"
                "        super()._connect()\n"
                "        super(LocalCatalog, self)._connect()\n",
                encoding="utf-8",
            )

            uses = architecture.private_catalog_uses(root)

        self.assertEqual(
            [(item.path, item.symbol, item.count) for item in uses],
            [("backend/consumer.py", "_connect", 2)],
        )

    def test_ratchet_accepts_reduction_but_rejects_growth_new_and_stale_keys(self) -> None:
        baseline = {("consumer.py", "_connect"): 2}

        self.assertEqual(
            architecture.ratchet_failures(
                [architecture.PrivateUse("consumer.py", "_connect", 1)], baseline
            ),
            [],
        )
        self.assertTrue(
            any(
                "increased" in failure
                for failure in architecture.ratchet_failures(
                    [architecture.PrivateUse("consumer.py", "_connect", 3)], baseline
                )
            )
        )
        self.assertTrue(
            any(
                "new private catalog use" in failure
                for failure in architecture.ratchet_failures(
                    [
                        architecture.PrivateUse("consumer.py", "_connect", 1),
                        architecture.PrivateUse("new_consumer.py", "_connect", 1),
                    ],
                    baseline,
                )
            )
        )
        self.assertTrue(
            any(
                "stale" in failure
                for failure in architecture.ratchet_failures([], baseline)
            )
        )

    def test_update_rejects_new_or_increased_private_uses_but_allows_stale_removal(self) -> None:
        baseline = {("consumer.py", "_connect"): 2}

        self.assertTrue(
            any(
                "new private catalog use" in failure
                for failure in architecture.private_update_failures(
                    [architecture.PrivateUse("new.py", "_private", 1)], baseline
                )
            )
        )
        self.assertTrue(
            any(
                "increased" in failure
                for failure in architecture.private_update_failures(
                    [architecture.PrivateUse("consumer.py", "_connect", 3)], baseline
                )
            )
        )
        self.assertEqual(architecture.private_update_failures([], baseline), [])

    def test_git_base_baseline_rejects_additions_and_growth_but_allows_reductions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            baseline_path = root / "scripts" / architecture.BASELINE_FILENAME
            baseline_path.parent.mkdir(parents=True)
            baseline_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "private_catalog_uses": [
                            {"path": "consumer.py", "symbol": "_connect", "count": 2},
                            {"path": "old.py", "symbol": "_private", "count": 1},
                        ],
                        "module_line_ceilings": {"service.py": 1300, "old.py": 1400},
                    }
                ),
                encoding="utf-8",
            )
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(
                ["git", "-c", "user.name=Test", "-c", "user.email=test@example.com", "add", "."],
                cwd=root,
                check=True,
            )
            subprocess.run(
                [
                    "git",
                    "-c",
                    "user.name=Test",
                    "-c",
                    "user.email=test@example.com",
                    "commit",
                    "-qm",
                    "base",
                ],
                cwd=root,
                check=True,
            )
            base_private, base_ceilings = architecture.load_baseline_at_ref(
                root, "HEAD", baseline_path
            ) or ({}, {})

            head_private = {
                ("consumer.py", "_connect"): 3,
                ("new.py", "_private"): 1,
            }
            head_ceilings = {
                "service.py": 1301,
                "new_service.py": 1300,
            }
            failures = architecture.baseline_monotonic_failures(
                head_private, head_ceilings, base_private, base_ceilings
            )

            self.assertEqual(
                failures,
                [
                    "baseline adds private catalog use new.py::_private "
                    "(head count 1, base ref has no entry)",
                    "baseline increases private catalog use consumer.py::_connect: base 2, head 3",
                    "baseline adds module-line ceiling new_service.py "
                    "(head ceiling 1300, base ref has no ceiling)",
                    "baseline increases module-line ceiling service.py: base 1300, head 1301",
                ],
            )
            self.assertEqual(
                architecture.baseline_monotonic_failures(
                    {("consumer.py", "_connect"): 1},
                    {"service.py": 1200},
                    base_private,
                    base_ceilings,
                ),
                [],
            )


class CatalogModuleSizeTests(unittest.TestCase):
    @staticmethod
    def _write_lines(path: Path, count: int) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("\n".join("pass" for _ in range(count)) + "\n", encoding="utf-8")

    def test_new_oversized_module_fails_and_grandfathered_shrink_passes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module = root / "backend" / "app" / "services" / "new_service.py"
            self._write_lines(module, architecture.MAX_PRODUCTION_MODULE_LINES + 1)
            failures = architecture.module_size_failures(root)
            self.assertTrue(any("production-module limit" in failure for failure in failures))

            ceilings = {"backend/app/services/new_service.py": 1201}
            self.assertEqual(architecture.module_size_failures(root, ceilings), [])
            self._write_lines(module, 1200)
            self.assertEqual(architecture.module_size_failures(root, ceilings), [])
            self._write_lines(module, 1202)
            self.assertTrue(any("grandfather ceiling" in failure for failure in architecture.module_size_failures(root, ceilings)))

    def test_catalog_facade_limit_is_stricter_than_general_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            module = root / "backend" / "app" / "services" / "catalog" / "component_facade.py"
            self._write_lines(module, architecture.MAX_CATALOG_FACADE_LINES + 1)
            failures = architecture.module_size_failures(root)
            self.assertTrue(any("facade/composition/orchestrator" in failure for failure in failures))
            self._write_lines(module, architecture.MAX_CATALOG_FACADE_LINES)
            self.assertEqual(architecture.module_size_failures(root), [])

    def test_update_rejects_new_or_growing_oversized_modules(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            new_module = root / "backend" / "app" / "services" / "new_service.py"
            self._write_lines(new_module, architecture.MAX_PRODUCTION_MODULE_LINES + 1)
            self.assertTrue(
                any(
                    "new oversized modules" in failure
                    for failure in architecture.module_size_update_failures(root, {})
                )
            )

            grandfathered = {
                "backend/app/services/new_service.py": architecture.MAX_PRODUCTION_MODULE_LINES + 1
            }
            self._write_lines(new_module, architecture.MAX_PRODUCTION_MODULE_LINES + 2)
            self.assertTrue(
                any(
                    "grandfather ceiling" in failure
                    for failure in architecture.module_size_update_failures(root, grandfathered)
                )
            )

    def test_update_lowers_existing_ceilings_and_removes_finished_or_missing(self) -> None:
        baseline = {
            "backend/app/services/shrinking.py": 1400,
            "backend/app/services/finished.py": 1201,
            "backend/app/services/removed.py": 1300,
        }
        line_counts = {
            "backend/app/services/shrinking.py": 1300,
            "backend/app/services/finished.py": architecture.MAX_PRODUCTION_MODULE_LINES,
        }

        self.assertEqual(
            architecture.update_module_ceilings(line_counts, baseline),
            {"backend/app/services/shrinking.py": 1300},
        )


if __name__ == "__main__":
    unittest.main()
