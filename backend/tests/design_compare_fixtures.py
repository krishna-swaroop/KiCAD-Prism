"""Semantic-index builders shared by the design comparison tests.

The diff works on the semantic index rather than on file text, so nearly every
test needs a small hand-built index. These keep the three shapes — a design, a
component in it, a net in it — described once.
"""


def design(*, components=None, nets=None, terminals=None):
    return {
        "components": components or [],
        "nets": nets or [],
        "terminals": terminals or [],
    }


def component(reference, source_id, *, value="A", page="root.kicad_sch"):
    return {
        "componentUid": f"cmp:{source_id}",
        "reference": reference,
        "fields": {"Value": value},
        "schematicRefs": [{"symbolUuid": source_id, "page": page}],
    }


def net(name, uid, source_id, *, labels=0):
    return {
        "netUid": uid,
        "name": name,
        "schematicRefs": [{
            "wireUuids": [source_id],
            "labelUuids": [f"label-{index}" for index in range(labels)],
            "labelInstanceCount": labels,
            "pinUuids": [],
        }],
    }
