import type { SkillTemplate } from "./type";

/**
 * Built-in skill templates shown in the create-skill wizard.
 *
 * Each template's `initialContent` is a factory so the chosen name and
 * description are folded into the frontmatter before the user enters the
 * editor. The "copy from existing" option is built dynamically at runtime
 * from the loaded skills list (see `buildCopyTemplate` below).
 */
export const SKILL_TEMPLATES: readonly SkillTemplate[] = [
  {
    id: "blank",
    label: "空白技能",
    labelEn: "Blank",
    description: "只有最基本的 frontmatter,从零开始",
    descriptionEn: "Just the bare frontmatter — start from scratch",
    initialContent: (name, desc) => `---
name: ${name}
description: ${desc}
---

# ${name}

TODO: 在这里描述技能的使用场景和步骤。
`,
  },
  {
    id: "task",
    label: "任务技能",
    labelEn: "Task",
    description: "通用任务流程,含步骤和验收清单",
    descriptionEn: "General-purpose task flow with steps and acceptance criteria",
    initialContent: (name, desc) => `---
name: ${name}
description: ${desc}
---

# ${name}

## 适用场景
TODO: 描述何时应该使用此技能。

## 执行步骤
1. TODO: 第一步
2. TODO: 第二步
3. TODO: 第三步

## 验收标准
- [ ] TODO: 完成条件 1
- [ ] TODO: 完成条件 2

## 注意事项
TODO: 常见陷阱和需要避免的做法。
`,
  },
  {
    id: "coding",
    label: "编码技能",
    labelEn: "Coding",
    description: "代码工程任务,含代码风格和测试要求",
    descriptionEn: "Code engineering tasks with style and test requirements",
    initialContent: (name, desc) => `---
name: ${name}
description: ${desc}
---

# ${name}

## 适用场景
TODO: 描述何时使用此编码技能。

## 实现规范
- 遵循项目现有代码风格和命名约定
- 添加必要的错误处理和边界检查
- 编写或更新单元测试覆盖新逻辑
- 保持改动最小化,避免无关重构

## 验证步骤
1. 运行 lint:\`pnpm lint\`(前端)/ \`ruff check .\`(后端)
2. 运行测试:\`pnpm test\` / \`pytest\`
3. 类型检查:\`pnpm typecheck\`
4. 确认无回归

## 常见陷阱
TODO: 此类任务容易踩的坑。
`,
  },
] as const;

/**
 * Build a "copy from existing" template at runtime.
 *
 * The wizard uses this to offer "复制现有技能" as a template option. The
 * source skill's SKILL.md body is used verbatim, except the frontmatter
 * `name` is rewritten to the user's chosen name (the backend validator
 * requires them to match).
 */
export function buildCopyTemplate(
  sourceName: string,
  sourceContent: string,
): SkillTemplate {
  return {
    id: `copy:${sourceName}`,
    label: `复制「${sourceName}」`,
    labelEn: `Copy "${sourceName}"`,
    description: `以现有技能 ${sourceName} 为起点修改`,
    descriptionEn: `Start from the existing "${sourceName}" skill`,
    initialContent: (name) => {
      // Rewrite the frontmatter `name:` line to the new chosen name so
      // validate_skill_markdown_content (which requires name match) passes.
      // We only touch the first `name:` occurrence inside the frontmatter.
      const fmMatch = sourceContent.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch || fmMatch[0] === undefined || fmMatch[1] === undefined) {
        // No frontmatter — return as-is, backend validator will reject.
        return sourceContent;
      }
      const newFrontmatter = fmMatch[1].replace(
        /^name:.*$/m,
        `name: ${name}`,
      );
      return sourceContent.replace(fmMatch[0], `---\n${newFrontmatter}\n---`);
    },
  };
}
