import {
  Code2Icon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  LoaderIcon,
  PackageIcon,
  SquareArrowOutUpRightIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Artifact,
  ArtifactAction,
  ArtifactActions,
  ArtifactContent,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import { Select, SelectItem } from "@/components/ui/select";
import {
  SelectContent,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CodeEditor } from "@/components/workspace/code-editor";
import {
  downloadArtifactUrl,
  openArtifactUrl,
  useAuthenticatedArtifactObjectUrl,
} from "@/core/artifacts/authenticated-url";
import { useArtifactContent } from "@/core/artifacts/hooks";
import { urlOfArtifact } from "@/core/artifacts/utils";
import { useI18n } from "@/core/i18n/hooks";
import { useInstallSkill } from "@/core/skills/hooks";
import { checkCodeFile, getFileName } from "@/core/utils/files";
import { env } from "@/env";
import { cn } from "@/lib/utils";

import { useOptionalThread } from "../messages/context";
import { Tooltip } from "../tooltip";

import { ArtifactFilePreview } from "./artifact-file-preview";
import { useArtifacts } from "./context";
import { ImageFilePreview, isImageFile } from "./image-file-preview";
import { OfficeFilePreview, isOfficeFile } from "./office-file-preview";
import { PdfFilePreview, isPdfFile } from "./pdf-file-preview";

export function ArtifactFileDetail({
  className,
  headerClassName,
  hideHeader = false,
  filepath: filepathFromProps,
  threadId,
  isMock: isMockFromProps = false,
}: {
  className?: string;
  headerClassName?: string;
  hideHeader?: boolean;
  filepath: string;
  threadId: string;
  isMock?: boolean;
}) {
  const { t } = useI18n();
  const { artifacts, setOpen, select } = useArtifacts();
  const threadContext = useOptionalThread();
  const isMock = threadContext?.isMock ?? isMockFromProps;
  const isWriteFile = useMemo(() => {
    return filepathFromProps.startsWith("write-file:");
  }, [filepathFromProps]);
  const filepath = useMemo(() => {
    if (isWriteFile) {
      const url = new URL(filepathFromProps);
      return decodeURIComponent(url.pathname);
    }
    return filepathFromProps;
  }, [filepathFromProps, isWriteFile]);
  const isSkillFile = useMemo(() => {
    return filepath.endsWith(".skill");
  }, [filepath]);
  const { isCodeFile, language } = useMemo(() => {
    if (isWriteFile) {
      let language = checkCodeFile(filepath).language;
      language ??= "text";
      return { isCodeFile: true, language };
    }
    // Treat .skill files as markdown (they contain SKILL.md)
    if (isSkillFile) {
      return { isCodeFile: true, language: "markdown" };
    }
    return checkCodeFile(filepath);
  }, [filepath, isWriteFile, isSkillFile]);
  const isSupportPreview = useMemo(() => {
    return language === "html" || language === "markdown";
  }, [language]);
  const isOfficePreview = useMemo(
    () => !isWriteFile && isOfficeFile(filepath),
    [filepath, isWriteFile],
  );
  const isImagePreview = useMemo(
    () => !isWriteFile && isImageFile(filepath),
    [filepath, isWriteFile],
  );
  const isPdfPreview = useMemo(
    () => !isWriteFile && isPdfFile(filepath),
    [filepath, isWriteFile],
  );
  const { content } = useArtifactContent({
    threadId,
    filepath: filepathFromProps,
    enabled: isCodeFile && !isWriteFile,
  });
  const artifactUrl = useMemo(
    () =>
      !isWriteFile ? urlOfArtifact({ filepath, threadId, isMock }) : null,
    [filepath, isMock, isWriteFile, threadId],
  );
  const authenticatedArtifactUrl =
    useAuthenticatedArtifactObjectUrl(artifactUrl);

  const displayContent = content ?? "";

  const [viewMode, setViewMode] = useState<"code" | "preview">("code");
  const [isInstalling, setIsInstalling] = useState(false);
  const installSkillMutation = useInstallSkill();
  useEffect(() => {
    if (isSupportPreview || isOfficePreview || isImagePreview || isPdfPreview) {
      setViewMode("preview");
    } else {
      setViewMode("code");
    }
  }, [isSupportPreview, isOfficePreview, isImagePreview, isPdfPreview]);

  const handleInstallSkill = useCallback(async () => {
    if (isInstalling) return;

    setIsInstalling(true);
    try {
      const result = await installSkillMutation.mutateAsync({
        thread_id: threadId,
        path: filepath,
      });
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message ?? "Failed to install skill");
      }
    } catch (error) {
      console.error("Failed to install skill:", error);
      toast.error("Failed to install skill");
    } finally {
      setIsInstalling(false);
    }
  }, [threadId, filepath, isInstalling, installSkillMutation]);
  return (
    <Artifact className={cn(className)}>
      {!hideHeader && (
      <ArtifactHeader className={cn("px-2", headerClassName)}>
        <div className="flex items-center gap-2">
          <ArtifactTitle>
            {isWriteFile ? (
              <div className="px-2">{getFileName(filepath)}</div>
            ) : (
              <Select value={filepath} onValueChange={select}>
                <SelectTrigger className="border-none bg-transparent! shadow-none select-none [&_svg]:hidden focus:outline-0 active:outline-0">
                  <SelectValue placeholder="Select a file" />
                </SelectTrigger>
                <SelectContent className="select-none">
                  <SelectGroup>
                    {(artifacts ?? []).map((filepath) => (
                      <SelectItem key={filepath} value={filepath}>
                        {getFileName(filepath)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </ArtifactTitle>
        </div>
        <div className="flex min-w-0 grow items-center justify-center">
          {isCodeFile && isSupportPreview && (
            <ToggleGroup
              className="mx-auto"
              type="single"
              variant="outline"
              size="sm"
              value={viewMode}
              onValueChange={(value) => {
                if (value) {
                  setViewMode(value as "code" | "preview");
                }
              }}
            >
              <ToggleGroupItem value="code">
                <Code2Icon />
              </ToggleGroupItem>
              <ToggleGroupItem value="preview">
                <EyeIcon />
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ArtifactActions>
            {!isWriteFile && filepath.endsWith(".skill") && (
              <Tooltip content={t.toolCalls.skillInstallTooltip}>
                <ArtifactAction
                  icon={isInstalling ? LoaderIcon : PackageIcon}
                  label={t.common.install}
                  tooltip={t.common.install}
                  disabled={
                    isInstalling ||
                    env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true"
                  }
                  onClick={handleInstallSkill}
                />
              </Tooltip>
            )}
            {!isWriteFile && (
              <ArtifactAction
                icon={SquareArrowOutUpRightIcon}
                label={t.common.openInNewWindow}
                tooltip={t.common.openInNewWindow}
                onClick={() => {
                  void openArtifactUrl(
                    urlOfArtifact({ filepath, threadId, isMock }),
                    getFileName(filepath),
                  );
                }}
              />
            )}
            {isCodeFile && (
              <ArtifactAction
                icon={CopyIcon}
                label={t.clipboard.copyToClipboard}
                disabled={!content}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(displayContent ?? "");
                    toast.success(t.clipboard.copiedToClipboard);
                  } catch (error) {
                    toast.error("Failed to copy to clipboard");
                    console.error(error);
                  }
                }}
                tooltip={t.clipboard.copyToClipboard}
              />
            )}
            {!isWriteFile && (
              <ArtifactAction
                icon={DownloadIcon}
                label={t.common.download}
                tooltip={t.common.download}
                onClick={() => {
                  void downloadArtifactUrl(
                    urlOfArtifact({
                      filepath,
                      threadId,
                      download: true,
                      isMock,
                    }),
                    getFileName(filepath),
                  );
                }}
              />
            )}
            <ArtifactAction
              icon={XIcon}
              label={t.common.close}
              onClick={() => setOpen(false)}
              tooltip={t.common.close}
            />
          </ArtifactActions>
        </div>
      </ArtifactHeader>
      )}
      <ArtifactContent className="p-0">
        {isSupportPreview &&
          viewMode === "preview" &&
          (language === "markdown" || language === "html") && (
            <ArtifactFilePreview
              content={displayContent}
              language={language ?? "text"}
            />
          )}
        {isOfficePreview &&
          viewMode === "preview" &&
          authenticatedArtifactUrl && (
            <OfficeFilePreview
              url={authenticatedArtifactUrl}
              filepath={filepath}
            />
          )}
        {isImagePreview && authenticatedArtifactUrl && (
          <ImageFilePreview url={authenticatedArtifactUrl} />
        )}
        {isPdfPreview && authenticatedArtifactUrl && (
          <PdfFilePreview
            url={authenticatedArtifactUrl}
            filepath={filepath}
          />
        )}
        {isCodeFile && viewMode === "code" && (
          <CodeEditor
            className="size-full resize-none rounded-none border-none"
            value={displayContent ?? ""}
            readonly
          />
        )}
        {!isCodeFile &&
          !isSupportPreview &&
          !isOfficePreview &&
          !isImagePreview &&
          !isPdfPreview && (
            <iframe
              className="size-full"
              src={authenticatedArtifactUrl}
            />
          )}
      </ArtifactContent>
    </Artifact>
  );
}
