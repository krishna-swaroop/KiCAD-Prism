"""The Python revision-key reference reproduces every W0 vector (revision-key.md §13)."""

from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path

from app.services.design_bundle import generator as gen
from app.services.design_bundle import revision_key as rk
from app.services.design_bundle import schemas

REPO = Path(__file__).resolve().parents[2]
VECTORS = REPO / "native" / "contracts" / "prism" / "revision-key-vectors.json"
EXAMPLES = REPO / "native" / "contracts" / "prism" / "examples"


def _listing(vector: dict) -> list[rk.ListingEntry]:
    return [
        rk.ListingEntry(e["mode"], e["type"], e["object_id"], e["path"].encode("utf-8", "surrogateescape"))
        for e in vector["listing"]
    ]


def _outcome(vector: dict) -> dict:
    try:
        key = rk.compute(_listing(vector), vector["config"], vector["object_format"])
    except rk.RevisionKeyError as error:
        return {"kind": "error", "code": error.code}
    return {
        "kind": "selected",
        "entries": list(key.entries),
        "counts": rk.counts(key.entries),
        "config_canonical": key.config_canonical,
        "config_digest": key.config_digest,
        "revision_key": key.revision_key,
    }


class RevisionKeyVectorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.vectors = json.loads(VECTORS.read_text(encoding="utf-8"))

    def test_the_vectors_file_is_valid_against_its_schema(self) -> None:
        schemas.validate(self.vectors, "prism.revision_key.vectors.a1")
        self.assertEqual(
            (len(self.vectors["selection"]), len(self.vectors["hashing"]), len(self.vectors["relations"])), (30, 7, 13)
        )

    def test_every_selection_vector(self) -> None:
        for vector in self.vectors["selection"]:
            with self.subTest(vector=vector["name"]):
                self.assertEqual(_outcome(vector), vector["expected"])

    def test_every_hashing_vector_byte_for_byte(self) -> None:
        for vector in self.vectors["hashing"]:
            with self.subTest(vector=vector["name"]):
                expected = vector["expected"]
                preimage = rk.preimage(vector["object_format"], vector["config"], vector["entries"])
                self.assertEqual(preimage.hex(), expected["preimage_hex"])  # localizes any mistake first
                self.assertEqual(rk.canonical_config(vector["config"]).decode("utf-8"), expected["config_canonical"])
                self.assertEqual(rk.config_digest(vector["config"]), expected["config_digest"])
                self.assertEqual(hashlib.sha256(preimage).hexdigest(), expected["revision_key"])

    def test_every_relation_holds_on_the_computed_keys(self) -> None:
        keys = {v["name"]: _outcome(v).get("revision_key") for v in self.vectors["selection"]}
        for relation in self.vectors["relations"]:
            with self.subTest(relation=relation["vectors"]):
                found = [keys[name] for name in relation["vectors"]]
                self.assertTrue(all(found))
                if relation["relation"] == "same-key":
                    self.assertEqual(len(set(found)), 1)
                else:
                    self.assertEqual(len(set(found)), len(found))

    def test_the_worked_example_of_section_8(self) -> None:
        config = {"schema": rk.CONFIG_SCHEMA, "project_file": "only.kicad_pro", "excluded_dirs": []}
        entries = [{"path": "only.kicad_pro", "kind": "regular", "object_id": "d" * 40, "category": "kicad-project"}]
        self.assertEqual(rk.config_digest(config), "b668333e4acd33d4094d69236bbf0e2d7fe5d9ad561b644c48dcffb2190e300b")
        self.assertEqual(
            hashlib.sha256(rk.preimage("sha1", config, entries)).hexdigest(),
            "5419bf612f52765cf095ae49f967ca92b47ffce6fb227bc8b0ff811569745d01",
        )

    def test_config_validation_rejects_every_second_spelling(self) -> None:
        base = {"schema": rk.CONFIG_SCHEMA, "project_file": "a/p.kicad_pro", "excluded_dirs": []}
        bad = [
            {**base, "zone_fills": "refill"},
            {**base, "excluded_dirs": ["b", "a"]},
            {**base, "excluded_dirs": ["a"]},
            {**base, "excluded_dirs": ["x", "x/y"]},
            {**base, "board": "a/p.pcb"},
            {**base, "project_file": "a/\ud800.kicad_pro"},
            {**base, "extra": 1},
            {**base, "project_file": "a/../p.kicad_pro"},
        ]
        for config in bad:
            with self.subTest(config=config):
                with self.assertRaises(rk.RevisionKeyError) as caught:
                    rk.validate_config(config)
                self.assertEqual(caught.exception.code, "config-invalid")
        rk.validate_config({**base, "board": "a/P.KICAD_PCB", "zone_fills": "saved"})

    def test_the_record_validates_against_its_schema(self) -> None:
        vector = next(v for v in self.vectors["selection"] if v["name"] == "usb-pd-single-project")
        key = rk.compute(_listing(vector), vector["config"], vector["object_format"])
        record = rk.record(key, vector["config"], commit="a" * 40)
        schemas.validate(record, "prism.revision_key.record.a1")
        self.assertEqual(record["counts"]["total"], len(record["entries"]))


class BundleKeyVectorTests(unittest.TestCase):
    """cli-spec.md §5.1.5: the generator digest and bundle key vectors."""

    def setUp(self) -> None:
        self.version = json.loads((EXAMPLES / "CliVersionA0.example.json").read_text(encoding="utf-8"))

    def test_generator_bytes_and_digest(self) -> None:
        data = gen.generator_bytes(self.version)
        self.assertEqual(len(data), 1268)
        self.assertEqual(gen.generator_digest(self.version), "ed72101b8bfbfaa8a89c98fc9c116efe90e486268b8b2b162b033fbb3b27f01e")
        # Key order of the parsed document does not matter (§5.1.3).
        shuffled = dict(reversed(list(self.version.items())))
        self.assertEqual(gen.generator_bytes(shuffled), data)

    def test_bundle_keys(self) -> None:
        cases = {
            "0" * 64: "a9a09149d354a2a8edea1900c28657cc2bb0b727864054a92fcc5357ca861599",
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855": "39c14ba5740ae2e516b00e853804c510e91ba5a99e6a427d3dec1c13bfce4c40",
            "42e41c598a193d09f6917ee92b7c71e52e9e15a251a63b7a955ef41beb841f34": "32ca1bc05dfc4a840dfa797fa618012332df58f743632f5aa4c3924b3f27591d",
        }
        for revision_key, bundle_key in cases.items():
            with self.subTest(revision_key=revision_key[:8]):
                self.assertEqual(gen.bundle_key(revision_key, self.version), bundle_key)

    def test_a_kicad_bump_is_a_new_generator(self) -> None:
        bumped = {**self.version, "kicad_version": "10.0.7"}
        self.assertEqual(gen.generator_digest(bumped), "adeb8290a058e3b94a02bf0e063ab2d9e9be8858d177c6aa17d6d2eee3a29103")
        self.assertEqual(gen.bundle_key("0" * 64, bumped), "1526370711b561e52c2a0b4b5b01fbcc9f06790e347272a236819231889670b3")

    def test_the_manifest_example_bundle_key(self) -> None:
        manifest = json.loads((EXAMPLES / "BundleManifestA3.example.json").read_text(encoding="utf-8"))
        self.assertEqual(gen.bundle_key(manifest["revision_key"], manifest["generator"]), manifest["bundle_key"])


if __name__ == "__main__":
    unittest.main()
