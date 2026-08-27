"""Per-thread sandbox-mode event log (DSH ``sandbox/mode`` alignment).

Events are appended by user/system actions and folded last-wins at read
time; the execution side currently ignores the resolved mode (single-host
full-access), so this slice is record + fold only.
"""
