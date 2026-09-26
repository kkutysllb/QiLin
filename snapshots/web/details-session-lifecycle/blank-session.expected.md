# Blank Session workspace sidebar

- No selected Session: expand control absent
- Selected workspace before first message: expand control visible
- Files: before-chat.md opens in the editable file workbench
- Narrow viewport: the reopened file workbench fills the viewport
- Terminal: writes a file in the selected workspace before any user message or turn

```json
[
  {
    "active": true,
    "tabs": [
      {
        "title": "Files",
        "selected": false
      },
      {
        "title": "before-chat.md",
        "selected": true
      }
    ]
  }
]
```
