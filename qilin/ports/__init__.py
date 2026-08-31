"""QiLin ports: the "everything is a port" extension layer.

The engine core stays transport- and UI-agnostic; every outward-facing
capability (terminal surfaces, file/page opens, workspace access) is an
async port interface here, and every frontend (web-demo, TUI, IM channels,
headless) is an adapter that attaches to those ports.

Wire compatibility: the port protocol mirrors the DSH model-tool vocabulary
(terminal_* tools and sidebar_open) so prompts, skills, and agent habits
written for the DSH ecosystem transfer unchanged. The mirrored contracts
live in qilin.ports.protocol; see that package for fidelity notes.
"""
