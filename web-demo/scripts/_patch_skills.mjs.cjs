"""One-shot patch: rebuild the H5-c skills bridge in plugins-host-runtime.mjs."""
from pathlib import Path

p = Path(__file__).resolve().parent.parent / "plugins-host-runtime.mjs"
lines = p.read_text().split("\n")

marker = "// ----- H5-c: skills port"
occ = [i for i, l in enumerate(lines) if l.startswith(marker)]
assert occ, "no H5-c block found"

# Remove ALL copies of comment + walkResourceDir (each copy: comment..'}' of fn)
for start in reversed(occ):
    end = start
    depth = 0
    seen_fn = False
    while end < len(lines):
        line = lines[end]
        if line.startswith("function walkResourceDir"):
            seen_fn = True
        if seen_fn and line == "}":
            break
        end += 1
    del lines[start : end + 1]
    # also swallow a following blank line
    if end < len(lines) and lines[end] == "":
        del lines[end]

skills_block = [
    "const skillsService = {",
    "  register(spec) {",
    "    const files = [",
    "      {",
    '        path: "SKILL.md",',
    "        content:",
    '          "---\n" +',
    '          "name: " + spec.name + "\n" +',
    '          "description: " + String(spec.description ?? "").replace(/\n/g, " ") + "\n" +',
    '          (spec.whenToUse ? "when-to-use: " + String(spec.whenToUse).replace(/\n/g, " ") + "\n" : "") +',
    '          "---\n" +',
    '          String(spec.content ?? ""),',
    "      },",
    "    ];",
    '    if (spec.resourceBase && spec.resourceBase.kind === "directory") {',
    '      walkResourceDir(spec.resourceBase.path, "", files);',
    "    }",
    "    const announce = () =>",
    '      fetch(GATEWAY_URL + "/api/ports/skills", {',
    '        method: "POST",',
    "        headers: {",
    '          "content-type": "application/json",',
    '          "X-QiLin-Internal-Token": internalAuthToken() ?? "",',
    "        },",
    "        body: JSON.stringify({ name: spec.name, files }),",
    "      });",
    "    void announce()",
    "      .then(async (res) => {",
    "        if (!res.ok) {",
    '          console.error("[skills] materialize failed:", spec.name, res.status);',
    "        }",
    "      })",
    '      .catch((err) => console.error("[skills] materialize error:", spec.name, err.message));',
    "    return () => {",
    '      fetch(GATEWAY_URL + "/api/ports/skills/" + encodeURIComponent(spec.name), {',
    '        method: "DELETE",',
    '        headers: { "X-QiLin-Internal-Token": internalAuthToken() ?? "" },',
    "      }).catch(() => {",
    "        /* best effort */",
    "      });",
    "    };",
    "  },",
    "};",
    "hostServices.skills = skillsService;",
]

# Re-insert ONE comment + walkResourceDir + skillsService right before the
# typert facility comment (which follows the backfill line).
typert_i = next(
    i for i, l in enumerate(lines) if l.startswith("// ----- H4-d slice 2")
)
insertion = (
    ["// ----- H5-c: skills port — materialize plugin skill packages -----"]
    + skills_block[: skills_block.index("const skillsService = {") - 1]
    + skills_block[skills_block.index("function walkResourceDir") :]
)
lines[typert_i:typert_i] = insertion + [""]

# makeCtx: add skills next to systemPrompt (evaluated at call time — no TDZ).
for i, l in enumerate(lines):
    if l.strip() == "systemPrompt: systemPromptService," and "skills:" not in lines[i + 1]:
        indent = l[: len(l) - len(l.lstrip())]
        lines.insert(i + 1, indent + "skills: skillsService,")
        break

p.write_text("
".join(lines))
print("patched OK")
