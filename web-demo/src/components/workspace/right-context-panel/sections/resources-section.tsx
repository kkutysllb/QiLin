"use client";

import { FileOutputIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";

import { ArtifactFileList } from "@/components/workspace/artifacts/artifact-file-list";
import { useI18n } from "@/core/i18n/hooks";
import { useUploadedFiles } from "@/core/uploads/hooks";
import { useActiveThreadMessages } from "@/hooks/use-active-thread";
import { useThreadResources } from "@/hooks/use-thread-artifacts";

import { PanelEmpty, PanelSection } from "../panel-section";

/** 技能区域折叠阈值：超过此数量时默认折叠。 */
const SKILL_COLLAPSE_THRESHOLD = 4;

export function ResourcesSection({ threadId }: { threadId: string }) {
  const { t } = useI18n();
  const { messages, values } = useActiveThreadMessages();
  const { skills, artifacts } = useThreadResources(messages, values);
  const uploads = useUploadedFiles(threadId);
  const uploadFiles = uploads.data?.files ?? [];
  const [skillsExpanded, setSkillsExpanded] = useState(false);

  const showAll = skillsExpanded || skills.length <= SKILL_COLLAPSE_THRESHOLD;
  const visibleSkills = showAll ? skills : skills.slice(0, SKILL_COLLAPSE_THRESHOLD);
  const hiddenCount = skills.length - visibleSkills.length;

  return (
    <>
      <PanelSection
        id="resources"
        icon={SparklesIcon}
        title={t.rightPanel.skills}
        count={skills.length}
      >
        {skills.length === 0 ? (
          <PanelEmpty text={t.rightPanel.empty} />
        ) : (
          <div className="space-y-1">
            {visibleSkills.map((s) => (
              <div
                key={s.path}
                className="flex items-start gap-2 rounded-md px-1.5 py-1 text-xs"
              >
                <SparklesIcon className="mt-0.5 size-3 shrink-0 text-primary/70" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">
                    {s.name}
                  </p>
                  {s.description && (
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground">
                      {s.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setSkillsExpanded(true)}
                className="w-full rounded-md px-1.5 py-1 text-center text-xs text-primary hover:bg-muted/50"
              >
                +{hiddenCount} 个技能
              </button>
            )}
          </div>
        )}
      </PanelSection>

      <PanelSection
        id="resources"
        icon={SparklesIcon}
        title={t.rightPanel.uploads}
        count={uploadFiles.length}
      >
        {uploadFiles.length === 0 ? (
          <PanelEmpty text={t.rightPanel.empty} />
        ) : (
          <ul className="space-y-1">
            {uploadFiles.map((f) => (
              <li
                key={f.filename}
                className="truncate text-xs text-muted-foreground"
              >
                {f.filename}
              </li>
            ))}
          </ul>
        )}
      </PanelSection>

      <PanelSection
        id="artifacts"
        icon={FileOutputIcon}
        title={t.rightPanel.artifacts}
        count={artifacts.length}
      >
        {artifacts.length === 0 ? (
          <PanelEmpty text={t.rightPanel.empty} />
        ) : (
          <ArtifactFileList files={artifacts} threadId={threadId} />
        )}
      </PanelSection>
    </>
  );
}
