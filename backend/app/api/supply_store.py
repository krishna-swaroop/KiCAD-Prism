"""The supply store, resolved per call so a replaced connector service (tests) brings its own."""

from app.api import supply_connectors


def store():
    return supply_connectors.service.store
