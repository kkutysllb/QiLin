"""H5-b tool events ring — publish/cursor semantics."""
from qilin.ports.tool_events import publish_tool_event, snapshot_after


def test_publish_and_cursor_roundtrip() -> None:
    events_before, head_before = snapshot_after(0)
    event = publish_tool_event(
        name="write_file", call_id="c1", thread_id="t1", path="a.md"
    )
    assert event["seq"] == head_before + 1
    events, cursor = snapshot_after(head_before)
    assert any(e["callId"] == "c1" for e in events)
    assert cursor == event["seq"]
    # cursor 之后不再重复投递
    events2, _ = snapshot_after(cursor)
    assert all(e["callId"] != "c1" for e in events2)
