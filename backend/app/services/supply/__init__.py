"""Supply chain data: distributor connectors, parts, stock history, assessment.

The design is in ``docs/plans/supply-chain-integration.md``. Supply data lives
in its own PostgreSQL schema with its own migration ledger and never enters
component revisions.
"""
