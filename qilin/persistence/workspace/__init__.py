"""Workspace registry persistence (DSH dsh-workspace alignment).

One directory entity per row; a separate table owns the durable display
order; per-workspace thread accounts carry the manual session order. The
registry-global archive set and the bootstrap initialized marker live in
``workspace_meta`` — mirroring DSH's domain-data storage where the archive
set is layered over (never inside) the per-workspace accounting, so an
unarchive restores the retained ``sessionIds`` slot.
"""
