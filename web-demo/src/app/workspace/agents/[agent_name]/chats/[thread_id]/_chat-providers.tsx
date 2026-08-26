"use client";

// ChatProviders 已提升到 WorkspaceContent（SubtasksProvider / ArtifactsProvider /
// PromptInputProvider），此文件保留导出以便 page.tsx 无需改动。
export function ChatProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
