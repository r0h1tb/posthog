from __future__ import annotations

import re
import hashlib

from products.warehouse_sources.backend.types import ExternalDataSourceType

_IDENTIFIER_SANITIZE_RE = re.compile(r"[^A-Za-z0-9_]+")
_DUCKGRES_IDENTIFIER_MAX_LENGTH = 63
_HASH_LENGTH = 8


def canonical_duckgres_table_name(source_type: str, prefix: str | None, normalized_name: str) -> str:
    try:
        source_slug = ExternalDataSourceType(source_type).name.lower()
    except ValueError:
        source_slug = _sanitize_identifier(source_type, default_prefix="source")

    raw_name = f"{source_slug}_{prefix}_{normalized_name}" if prefix else f"{source_slug}_{normalized_name}"
    normalized = _sanitize_identifier(raw_name, default_prefix="data_import", max_length=None)
    if len(normalized) <= _DUCKGRES_IDENTIFIER_MAX_LENGTH:
        return normalized

    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:_HASH_LENGTH]
    prefix_length = _DUCKGRES_IDENTIFIER_MAX_LENGTH - _HASH_LENGTH - 1
    return f"{normalized[:prefix_length]}_{digest}"


def _sanitize_identifier(
    raw: str, *, default_prefix: str, max_length: int | None = _DUCKGRES_IDENTIFIER_MAX_LENGTH
) -> str:
    cleaned = _IDENTIFIER_SANITIZE_RE.sub("_", (raw or "").strip()).strip("_").lower()
    if not cleaned:
        cleaned = default_prefix
    if cleaned[0].isdigit():
        cleaned = f"{default_prefix}_{cleaned}"
    return cleaned[:max_length] if max_length is not None else cleaned
