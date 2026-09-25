"""Review regressions: source identity, structural discovery, and reuse."""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.services import variant_catalog_service as catalog
from app.services import semantic_index_service as index
from app.services.variant_source_scan import scan_source


def board(name):
    return f'(kicad_pcb (variants (variant (name "{name}"))))'


class SourceScanningTests(unittest.TestCase):
    def test_quoted_and_misplaced_forms_are_not_records(self):
        text = '(kicad_pcb (gr_text "(variants) (variant)") (variant (name "Fake")) (footprint "R" (variant (name "Real"))))'
        result = scan_source(text, 'kicad_pcb')
        self.assertTrue(result.readable)
        self.assertEqual(result.header, ())
        self.assertEqual(result.names, ('Real',))

    def test_nested_field_name_is_not_a_variant_name(self):
        result = scan_source('(kicad_pcb (footprint "R" (variant (field (name "Value") (value "A")))))', 'kicad_pcb')
        self.assertEqual(result.names, ())

    def test_bad_balance_and_multiple_roots_are_rejected(self):
        for text in ('(kicad_pcb (variant)', '(kicad_pcb (variant)))', '(kicad_pcb (variant))(kicad_pcb)', '(kicad_pcb (variant) "unterminated)'):
            self.assertFalse(scan_source(text, 'kicad_pcb').readable, text)

    def test_metadata_free_sources_do_not_run_the_structural_scanner(self):
        from app.services import variant_source_scan as scanner
        with patch.object(scanner, '_scan_source', side_effect=AssertionError('full scan')):
            self.assertEqual(scanner.scan_source('(kicad_pcb (version 20260101))', 'kicad_pcb').names, ())
            # No catalog syntax is present; whole-file validation belongs to
            # the native parsers, including for malformed metadata-free text.
            self.assertEqual(scanner.scan_source('(kicad_pcb', 'kicad_pcb').names, ())

    def test_whitespace_separated_variant_form_and_sheet_links_are_not_skipped(self):
        result = scan_source('(kicad_pcb ( variants ( variant (name "Spaced"))))', 'kicad_pcb')
        self.assertEqual(result.header, (('Spaced', None),))
        result = scan_source('(kicad_sch (sheet (property "Sheetfile" "child.kicad_sch")))', 'kicad_sch')
        self.assertEqual(result.sheets, ('child.kicad_sch',))

    def test_escaped_names_and_default_sentinel(self):
        result = scan_source('(kicad_pcb (variants (variant (name "A\\\"B")) (variant (name "< Default >"))))', 'kicad_pcb')
        self.assertEqual(result.header, (('A"B', None),))


class CatalogSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.project = SimpleNamespace(id='test', path=str(self.root), project_file='top.kicad_pro')
        (self.root / 'top.kicad_pro').write_text('{}')
        catalog._discover_cached.cache_clear()

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], stderr=subprocess.DEVNULL, text=True).strip()

    def commit(self):
        self.git('init')
        self.git('add', '.')
        self.git('-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'fixture')
        return self.git('rev-parse', 'HEAD')

    def names(self, commit=None):
        return [v['name'] for v in catalog.discover_variant_catalog(self.project, commit)['variants']]

    def test_historical_configuration_is_read_from_commit(self):
        (self.root / 'old.kicad_pcb').write_text(board('Old'))
        (self.root / 'new.kicad_pcb').write_text(board('New'))
        config = self.root / '.prism.json'
        config.write_text(json.dumps({'pcb': 'old.kicad_pcb'}))
        sha = self.commit()
        before = index._revision_identity(self.project, None)[0]
        config.write_text(json.dumps({'pcb': 'new.kicad_pcb'}))
        after = index._revision_identity(self.project, None)[0]
        self.assertNotEqual(before, after)
        self.assertEqual(self.names(sha), ['Old'])
        self.assertEqual(self.names(), ['New'])

    def test_cache_hit_skips_source_materialization_and_is_copy_isolated(self):
        (self.root / 'top.kicad_pcb').write_text(board('V'))
        sha = self.commit()
        first = catalog.discover_variant_catalog(self.project, sha)
        first['variants'].clear()
        with patch.object(catalog, 'project_source_snapshot', side_effect=AssertionError('cache miss')):
            self.assertEqual(self.names(sha), ['V'])

    def test_exact_commit_identity_is_reused_but_moving_refs_are_not(self):
        from app.services import project_source_snapshot as snapshots
        (self.root / 'top.kicad_pcb').write_text(board('V'))
        sha = self.commit()
        self.names(sha)
        with patch.object(snapshots, '_revision_identity_uncached', side_effect=AssertionError('identity recomputed')):
            self.assertEqual(self.names(sha), ['V'])
            with self.assertRaises(AssertionError):
                self.names('HEAD')

    def test_catalog_cache_is_shared_without_leaking_project_id(self):
        from copy import copy
        (self.root / 'top.kicad_pcb').write_text(board('V'))
        first = catalog.discover_variant_catalog(self.project)
        other = copy(self.project)
        other.id = 'second-view'
        with patch.object(catalog, 'project_source_snapshot', side_effect=AssertionError('duplicate scan')):
            second = catalog.discover_variant_catalog(other)
        self.assertEqual(first['projectId'], 'test')
        self.assertEqual(second['projectId'], 'second-view')

    def test_snapshot_path_resolution_preserves_existing_config_cache(self):
        from copy import deepcopy
        from app.services import path_config_service as paths
        from app.services.project_source_snapshot import ProjectSourceSnapshot, source_files
        paths.get_path_config(str(self.root.resolve()), anchor="top.kicad_pro")
        before = deepcopy(paths._config_cache)
        snapshot = ProjectSourceSnapshot(self.root.resolve(), (self.root / 'top.kicad_pro').resolve(), None)
        source_files(snapshot)
        self.assertEqual(paths._config_cache, before)
        paths.clear_config_cache(str(self.root.resolve()))

    def test_snapshot_discovery_does_not_lookup_or_cache_revision(self):
        from app.services.project_source_snapshot import ProjectSourceSnapshot
        (self.root / 'top.kicad_pcb').write_text(board('V'))
        snapshot = ProjectSourceSnapshot(self.root.resolve(), (self.root / 'top.kicad_pro').resolve(), None)
        with patch.object(catalog, 'project_revision_identity', side_effect=AssertionError('rehash')):
            self.assertEqual(catalog.discover_snapshot_catalog(snapshot)['variants'][0]['name'], 'V')
        self.assertEqual(catalog._discover_cached.cache_info().currsize, 0)

    def test_deleted_live_board_does_not_break_historical_anchor(self):
        (self.root / 'only.kicad_pcb').write_text(board('Historical'))
        self.project.project_file = 'only.kicad_pcb'
        sha = self.commit()
        (self.root / 'only.kicad_pcb').unlink()
        self.assertEqual(self.names(sha), ['Historical'])

    def test_source_checkout_omits_unrelated_outputs(self):
        (self.root / 'top.kicad_pcb').write_text(board('V'))
        (self.root / 'large-output.bin').write_bytes(b'not a source')
        sha = self.commit()
        from app.services.project_source_snapshot import project_source_snapshot
        with project_source_snapshot(self.project, sha) as snapshot:
            self.assertFalse((snapshot.root / 'large-output.bin').exists())
            self.assertTrue((snapshot.root / 'top.kicad_pcb').exists())

    def test_sibling_project_board_is_not_borrowed(self):
        (self.root / 'sibling.kicad_pro').write_text('{}')
        (self.root / 'sibling.kicad_pcb').write_text(board('OtherProject'))
        self.assertEqual(self.names(), [])

    def test_paths_outside_snapshot_are_rejected(self):
        (self.root / '.prism.json').write_text(json.dumps({'pcb': '../outside.kicad_pcb'}))
        with self.assertRaises(ValueError):
            self.names()


class NativeResolutionReviewTests(unittest.TestCase):
    def load(self):
        from kicad_monkey import KiCadDesign
        from tests.test_semantic_index_variants import FIXTURE_ROOT
        path = FIXTURE_ROOT / 'oracle' / 'variants_oracle.kicad_pro'
        return KiCadDesign.from_file(path), path

    def test_inventory_includes_neutral_footprints(self):
        from app.services.semantic_index_variants import build_assembly_state
        design, path = self.load()
        state = build_assembly_state(design, project_file=path)
        self.assertEqual(len(state['footprintInventory']), len(design.pcb.footprints))
        self.assertTrue(any(item['uuid'] not in state['default']['footprints'] for item in state['footprintInventory']))

    def test_missing_instance_uses_base_reference_without_mutation(self):
        from app.services.semantic_index_variants import _resolve_occurrence, _build_schematic_graph
        design, path = self.load()
        instance = next(iter(design.schematic_instances()))
        symbol = next(s for s in instance.schematic.symbols if s.instances)
        original = list(symbol.instances)
        reference, flags, fields = _resolve_occurrence(symbol, '/missing', _build_schematic_graph(design, path), 'Lite', instance.schematic.version)
        self.assertEqual(reference, symbol.reference)
        self.assertEqual(fields['Reference'], symbol.reference)
        self.assertEqual(symbol.instances, original)

    def test_reference_field_override_cannot_change_identity(self):
        from app.services.semantic_index_variants import _resolve_occurrence, _build_schematic_graph
        design, path = self.load()
        instance = next(iter(design.schematic_instances()))
        symbol = next(s for s in instance.schematic.symbols if s.instances and s.instances[0].variants)
        record = symbol.instances[0].variants[0]
        record.fields.append(('Reference', 'Forged'))
        reference, _, fields = _resolve_occurrence(symbol, symbol.instances[0].path, _build_schematic_graph(design, path), record.name, instance.schematic.version)
        self.assertNotEqual(reference, 'Forged')
        self.assertEqual(fields['Reference'], reference)

    def test_legacy_child_uses_its_own_in_bom_version_gate(self):
        from app.services.semantic_index_variants import _build_schematic_graph, _variant_occurrence_states
        design, path = self.load()
        graph = _build_schematic_graph(design, path)
        child = next(i for i in graph.instances if i.parent_sheet_instance_path)
        child.schematic.version = 20250101
        symbol = next(s for s in child.schematic.symbols if s.instances)
        occurrence = next(i for i in symbol.instances if i.path == child.sheet_instance_path)
        occurrence.variants = [SimpleNamespace(name='Review', in_bom=True, dnp=None, on_board=None, exclude_from_sim=None, in_pos_files=None, fields=[])]
        states = _variant_occurrence_states(graph, 'Review')
        self.assertTrue(states[f'{child.sheet_instance_path}/{symbol.uuid}'].flags['excludeFromBom'])

    def test_changed_working_sources_are_never_cached_under_old_identity(self):
        from tests.test_semantic_index_variants import fixture_project
        project = fixture_project('oracle', 'variants_oracle.kicad_pro')
        catalog._discover_cached.cache_clear()
        with patch.object(catalog, 'project_revision_identity', side_effect=[('before', None), ('after', None)]):
            with self.assertRaises(RuntimeError):
                catalog.discover_variant_catalog(project)
        self.assertEqual(catalog._discover_cached.cache_info().currsize, 0)


class ReleaseBoardOnlyReviewTests(unittest.TestCase):
    setUp = CatalogSnapshotTests.setUp
    git = CatalogSnapshotTests.git
    commit = CatalogSnapshotTests.commit
    def test_release_catalog_without_project_file(self):
        from app.release_studio.source import discover_source
        (self.root / 'top.kicad_pro').unlink()
        (self.root / 'top.kicad_pcb').write_text(board('BoardVariant'))
        sha = self.commit()
        self.assertIn('BoardVariant', discover_source(self.root, sha)['variants'])
