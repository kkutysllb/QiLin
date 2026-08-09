"""Upload limits and document conversion configuration.

Controls how many files a user can upload per message, the per-file and
total size caps, and whether the backend host automatically converts
Office/PDF documents to plain text before the agent sees them.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class UploadsConfig(BaseModel):
    """Application-level upload limits and document conversion settings.

    These limits are enforced by the gateway upload endpoint and exposed to
    the frontend (via ``GET /api/threads/{id}/uploads/limits``) so the UI can
    validate files before selection.

    ``auto_convert_documents`` runs Office/PDF conversion on the **backend
    host** before sandbox isolation applies. Keep it disabled unless uploads
    come from a fully trusted source and you intentionally accept host-side
    parser risk.
    """

    max_files: int = Field(
        default=10,
        ge=1,
        description="Maximum number of files allowed per upload batch.",
    )
    max_file_size: int = Field(
        default=52428800,  # 50 MiB
        ge=1,
        description="Maximum size in bytes for a single uploaded file.",
    )
    max_total_size: int = Field(
        default=104857600,  # 100 MiB
        ge=1,
        description="Maximum total size in bytes for all files in one upload batch.",
    )
    auto_convert_documents: bool = Field(
        default=False,
        description=(
            "Automatically convert PDF / Word / Excel documents to text/markdown "
            "on the backend host before sandbox isolation. Disabled by default "
            "because it accepts host-side parser risk."
        ),
    )
    pdf_converter: str = Field(
        default="auto",
        description=(
            "Controls which PDF-to-Markdown converter is used. "
            "'auto' prefers pymupdf4llm, falling back to MarkItDown. "
            "'pymupdf4llm' always uses pymupdf4llm (must be installed). "
            "'markitdown' always uses MarkItDown (no extra dependency)."
        ),
    )
