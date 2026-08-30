"""Shared test environment.

The gateway's internal-auth module fails fast at import time when
QILIN_INTERNAL_AUTH_TOKEN is unset, which breaks pytest *collection* for
every test module that imports app.gateway.*. Set a deterministic test
token before any test module is imported.
"""
import os

os.environ.setdefault("QILIN_INTERNAL_AUTH_TOKEN", "unit-test-secret-0123456789abcdef")
