"use client";

import {
  ArrowLeftIcon,
  BotIcon,
  CpuIcon,
  DatabaseIcon,
  GaugeIcon,
  GlobeIcon,
  HardDriveIcon,
  KeyRoundIcon,
  type LucideIcon,
  PaperclipIcon,
  ScrollTextIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { KWorksLogo } from "@/components/kworks-logo";
import { Input } from "@/components/ui/input";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isDesktop } from "@/core/config";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

import { AgentsSettingsPage } from "./agents-settings-page";
import { DataPersistenceSettingsPage } from "./data-persistence-settings-page";
import { DatasourcesSettingsPage } from "./datasources-settings-page";
import { GeneralSettingsPage } from "./general-settings-page";
import { McpSettingsPage } from "./mcp-settings-page";
import { MemorySummarySettingsPage } from "./memory-summary-settings-page";
import { ModelsSettingsPage } from "./models/models-settings-page";
import { SkillModelsSettingsPage } from "./skill-models-settings-page";
import { SkillSettingsPage } from "./skill-settings-page";
import { SubagentsSettingsPage } from "./subagents-settings-page";
import { TokenUsageBudgetSettingsPage } from "./token-usage-budget-settings-page";
import { ToolsSandboxSettingsPage } from "./tools-sandbox-settings-page";
import { UploadsSettingsPage } from "./uploads-settings-page";
import { WebToolsSettingsPage } from "./web-tools-settings-page";

const SIDEBAR_WIDTH_KEY = "kworks.settings.sidebarWidth";
const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 360;

type SectionId =
  | "general"
  | "models"
  | "memorySummary"
  | "tokenUsageBudget"
  | "mcp"
  | "toolsSandbox"
  | "webTools"
  | "uploads"
  | "dataSources"
  | "dataPersistence"
  | "skillModels"
  | "skill"
  | "agents"
  | "subagents";

type SectionGroup = "personal" | "engine" | "agent" | "toolsData";

interface SectionDef {
  id: SectionId;
  icon: LucideIcon;
  groupKey: SectionGroup;
  desktopOnly?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: "general", icon: Settings2Icon, groupKey: "personal" },
  { id: "agents", icon: BotIcon, groupKey: "agent" },
  { id: "subagents", icon: UsersIcon, groupKey: "agent" },
  { id: "skill", icon: SparklesIcon, groupKey: "agent" },
  { id: "mcp", icon: WrenchIcon, groupKey: "toolsData" },
  { id: "dataSources", icon: DatabaseIcon, groupKey: "toolsData" },
  { id: "models", icon: CpuIcon, groupKey: "engine" },
  { id: "dataPersistence", icon: HardDriveIcon, groupKey: "engine" },
  { id: "memorySummary", icon: ScrollTextIcon, groupKey: "engine" },
  { id: "tokenUsageBudget", icon: GaugeIcon, groupKey: "engine" },
  { id: "toolsSandbox", icon: WrenchIcon, groupKey: "engine" },
  { id: "webTools", icon: GlobeIcon, groupKey: "engine" },
  { id: "uploads", icon: PaperclipIcon, groupKey: "toolsData" },
  {
    id: "skillModels",
    icon: KeyRoundIcon,
    groupKey: "engine",
    desktopOnly: true,
  },
];

const GROUP_ORDER: SectionGroup[] = ["personal", "agent", "toolsData", "engine"];

interface SettingsViewProps {
  activeSection: SectionId;
  onSelectSection: (id: SectionId) => void;
  onBack: () => void;
}

function readSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        return Math.min(Math.max(n, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

export function SettingsView({
  activeSection,
  onSelectSection,
  onBack,
}: SettingsViewProps) {
  const { t } = useI18n();
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSidebarWidth(readSidebarWidth());
  }, []);

  const handleResize = (width: number) => {
    setSidebarWidth(width);
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
    } catch {
      /* ignore */
    }
  };

  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => !s.desktopOnly || isDesktop()),
    [],
  );

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const titles = t.settings.view.titles;
    const summaries = t.settings.view.summaries;
    const filtered = q
      ? visibleSections.filter((s) => {
          const title = titles[s.id] ?? "";
          const summary = summaries[s.id] ?? "";
          return (
            title.toLowerCase().includes(q) || summary.toLowerCase().includes(q)
          );
        })
      : visibleSections;
    return GROUP_ORDER.map((g) => ({
      group: g,
      items: filtered.filter((s) => s.groupKey === g),
    })).filter((g) => g.items.length > 0);
  }, [visibleSections, search, t]);

  const active: SectionDef =
    SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0]!;
  const ActiveIcon = active.icon;

  return (
    <div className="kworks-settings-view bg-background flex h-screen w-full flex-col overflow-hidden">
      {/* Windows frameless shell: 48px spacer reserving the native title-bar
          overlay area (hidden on the web and on macOS / Linux via globals.css;
          also hidden on the Windows settings view, which flows to the very top
          of the window instead — see globals.css). Without this, the main
          content header gets covered by the native overlay strip and looks
          like a top blank band. */}
      <div className="kworks-win-titlebar" aria-hidden="true" />
      <div className="flex min-h-0 flex-1">
        {/* 左侧分组导航 */}
        <aside
          aria-label={t.settings.title}
          style={{ width: sidebarWidth }}
          className="bg-sidebar kworks-win-pad-top flex shrink-0 flex-col"
        >
          <div className="[-webkit-app-region:drag] flex items-center gap-2 px-4 py-3">
            <KWorksLogo size={24} className="shrink-0" />
            <span className="text-base font-bold text-foreground">KWorks</span>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="hover:bg-sidebar-accent flex items-center gap-2 px-4 py-3 text-left text-sm transition-colors"
          >
            <ArrowLeftIcon className="size-4 shrink-0" />
            <span className="truncate">{t.settings.view.backToApp}</span>
          </button>
          <div className="px-3 pb-2">
            <div className="relative">
              <SearchIcon className="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.settings.view.searchPlaceholder}
                className="h-8 rounded-md pl-8 text-xs"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <nav className="space-y-3 px-2 pb-4">
              {grouped.map(({ group, items }) => (
                <div key={group} className="space-y-0.5">
                  <p className="text-muted-foreground/70 px-2 py-1 text-[11px] font-semibold tracking-wider uppercase">
                    {t.settings.view.groups[group]}
                  </p>
                  {items.map((section) => {
                    const isActive = section.id === activeSection;
                    const Icon = section.icon;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => onSelectSection(section.id)}
                        className={cn(
                          "hover:bg-sidebar-accent flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
                          isActive && "bg-sidebar-accent font-medium",
                        )}
                      >
                        <Icon
                          className={cn(
                            "size-4 shrink-0",
                            isActive ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <span className="truncate">
                          {t.settings.view.titles[section.id]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        <ResizeHandle
          width={sidebarWidth}
          minWidth={MIN_SIDEBAR_WIDTH}
          maxWidth={MAX_SIDEBAR_WIDTH}
          onResize={handleResize}
          label={t.settings.view.resizeLabel}
        />

        {/* 右侧内容 */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="kworks-settings-header flex items-center gap-3 border-b px-8 py-5">
            <ActiveIcon className="text-primary size-6 shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">
                {t.settings.view.titles[active.id]}
              </h1>
              <p className="text-muted-foreground mt-0.5 text-sm leading-relaxed">
                {t.settings.view.summaries[active.id]}
              </p>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto w-full max-w-4xl px-8 py-6">
              {active.id === "general" && <GeneralSettingsPage />}
              {active.id === "models" && <ModelsSettingsPage />}
              {active.id === "memorySummary" && <MemorySummarySettingsPage />}
              {active.id === "tokenUsageBudget" && <TokenUsageBudgetSettingsPage />}
              {active.id === "skill" && <SkillSettingsPage />}
              {active.id === "mcp" && <McpSettingsPage />}
              {active.id === "toolsSandbox" && <ToolsSandboxSettingsPage />}
              {active.id === "webTools" && <WebToolsSettingsPage />}
              {active.id === "uploads" && <UploadsSettingsPage />}
              {active.id === "dataPersistence" && <DataPersistenceSettingsPage />}
              {active.id === "dataSources" && <DatasourcesSettingsPage />}
              {active.id === "agents" && <AgentsSettingsPage />}
              {active.id === "subagents" && <SubagentsSettingsPage />}
              {active.id === "skillModels" && <SkillModelsSettingsPage />}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
