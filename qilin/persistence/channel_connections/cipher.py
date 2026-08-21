"""Helpers for constructing the ChannelCredentialCipher from configuration.

The cipher encrypts provider credentials (bot tokens, app secrets, OAuth
refresh tokens) before they are written to the database. Without a cipher,
``ChannelConnectionRepository.store_credentials`` raises ``RuntimeError`` and
every IM channel OAuth flow fails closed.

The key material is read from the ``QILIN_CHANNEL_CREDENTIAL_KEY`` environment
variable. Operators MUST set this to a stable, high-entropy string (32+ random
bytes, base64 / hex / passphrase — anything SHA-256-derivable).

Recommended bootstrap:

.. code-block:: bash

    export QILIN_CHANNEL_CREDENTIAL_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"

Persisting the key: store this value in your secret manager (Kubernetes Secret,
AWS Secrets Manager, Vault, .env on disk with 0o600). Rotating the key requires
re-encrypting existing rows; see ``ChannelCredentialCipher.from_key`` for the
derivation logic.

Behavior contract:

* If ``QILIN_CHANNEL_CREDENTIAL_KEY`` is set: build and return the cipher.
* If unset: raise ``ChannelCredentialKeyMissing`` with a clear remediation
  message — **never** fall back to an ephemeral in-memory key, because that
  would silently lose the ability to decrypt existing rows on the next
  process restart.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache

from qilin.persistence.channel_connections.sql import ChannelCredentialCipher

logger = logging.getLogger(__name__)

_CHIPHER_KEY_ENV_VAR = "QILIN_CHANNEL_CREDENTIAL_KEY"


class ChannelCredentialKeyMissing(RuntimeError):
    """Raised when the operator has not provided a stable cipher key.

    Surfaces as HTTP 503 (gateway) or a fail-fast log line (channel service)
    so misconfigured deployments are loud, not silent.
    """


def _load_channel_cipher_key() -> str:
    raw = os.environ.get(_CHIPHER_KEY_ENV_VAR, "").strip()
    if not raw:
        raise ChannelCredentialKeyMissing(
            f"Environment variable {_CHIPHER_KEY_ENV_VAR} is not set. "
            "Channel credentials cannot be encrypted without it. "
            "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(32))' "
            "and add it to your secret manager / .env. "
            "Refusing to fall back to an ephemeral key because existing rows would become undecryptable on restart."
        )
    if len(raw) < 16:
        raise ChannelCredentialKeyMissing(
            f"{_CHIPHER_KEY_ENV_VAR} is too short (got {len(raw)} chars, need >= 16). "
            "Use python -c 'import secrets; print(secrets.token_urlsafe(32))' to generate a strong key."
        )
    return raw


@lru_cache(maxsize=1)
def load_channel_credential_cipher() -> ChannelCredentialCipher:
    """Build and memoise the channel credential cipher.

    LRU-cached so the SHA-256 derivation only runs once per process. Cache is
    keyed by the env-var value at call time — if the operator rotates the env
    var across a process restart, the cache rebuilds automatically.
    """
    key = _load_channel_cipher_key()
    cipher = ChannelCredentialCipher.from_key(key)
    logger.info(
        "Loaded ChannelCredentialCipher (env=%s, key_len=%d)",
        _CHIPHER_KEY_ENV_VAR,
        len(key),
    )
    return cipher
