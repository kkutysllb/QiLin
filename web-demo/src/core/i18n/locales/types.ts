import type { LucideIcon } from "lucide-react";

export interface Translations {
  // Locale meta
  locale: {
    localName: string;
  };

  // Common
  common: {
    settings: string;
    delete: string;
    rename: string;
    share: string;
    openInNewWindow: string;
    close: string;
    more: string;
    loadMore: string;
    download: string;
    thinking: string;
    artifacts: string;
    notAvailableInDemoMode: string;
    loading: string;
    cancel: string;
    save: string;
    install: string;
    export: string;
    exportAsMarkdown: string;
    exportAsJSON: string;
    exportSuccess: string;
  };

  // Welcome
  welcome: {
    tagline: string;
    greetings: {
      morning: string;
      afternoon: string;
      evening: string;
    };
  };

  // Clipboard
  clipboard: {
    copyToClipboard: string;
    copiedToClipboard: string;
    failedToCopyToClipboard: string;
    linkCopied: string;
  };

  messageActions: {
    copy: string;
    copied: string;
    copyFailed: string;
    branch: string;
    branching: string;
    branchFailed: string;
    regenerate: string;
    feedbackUp: string;
    feedbackDown: string;
    feedbackSubmitted: string;
    feedbackRemoved: string;
    feedbackFailed: string;
  };

  // Input Box
  inputBox: {
    pickWorkspace: string;
    accessMode: string;
    sandboxReadOnly: string;
    sandboxWorkspaceWrite: string;
    sandboxFullAccess: string;
    sandboxFullAccessConfirmTitle: string;
    sandboxFullAccessConfirmDesc: string;
    sandboxFullAccessConfirm: string;
    sandboxFullAccessCancel: string;
    ungroupedOption: string;
    addWorkspace: string;
    placeholder: string;
    createSkillPrompt: string;
    createCronPrompt: string;
    skillModeBanner: string;
    skillModeBannerHint: string;
    addAttachments: string;
    reasoningEffort: string;
    reasoningEffortMinimal: string;
    reasoningEffortMinimalDescription: string;
    reasoningEffortLow: string;
    reasoningEffortLowDescription: string;
    reasoningEffortMedium: string;
    reasoningEffortMediumDescription: string;
    reasoningEffortHigh: string;
    reasoningEffortHighDescription: string;
    searchModels: string;
    surpriseMe: string;
    surpriseMePrompt: string;
    followupLoading: string;
    followupConfirmTitle: string;
    followupConfirmDescription: string;
    followupConfirmAppend: string;
    followupConfirmReplace: string;
    suggestions: {
      suggestion: string;
      prompt: string;
      icon: LucideIcon;
    }[];
    suggestionsCreate: (
      | {
          suggestion: string;
          prompt: string;
          icon: LucideIcon;
        }
      | {
          type: "separator";
        }
    )[];
  };

  // Sidebar
  sidebar: {
    workspacesSection: string;
    searchWorkspaces: string;
    newSessionInWorkspace: string;
    sortBy: string;
    sortManual: string;
    sortRecent: string;
    addWorkspace: string;
    newChat: string;
    expandSidebar: string;
    agents: string;
    tokenUsage: string;
    ungroupedGroup: string;
    archivedSection: string;
    archiveThread: string;
    unarchiveThread: string;
    moveToWorkspace: string;
    renameWorkspace: string;
    deleteWorkspaceAction: string;
    deleteWorkspaceHint: string;
    moveUpItem: string;
    moveDownItem: string;
    emptyWorkspaceCount: string;
  };

  // Topbar
  topbar: {
    toggleRightPanel: string;
    backendConnected: string;
    backendDisconnected: string;
    backendChecking: string;
    noActiveSession: string;
  };

  // Right Panel
  rightPanel: {
    title: string;
    todos: string;
    subagents: string;
    skills: string;
    uploads: string;
    artifacts: string;
    empty: string;
  };

  // Toolbar
  toolbar: {
    refresh: string;
  };

  // Agents
  agents: {
    newChat: string;
  };

  // Breadcrumb
  breadcrumb: {
    workspace: string;
    chats: string;
  };

  // Workspace
  workspace: {
    settings: string;
    logout: string;
    userInfo: {
      admin: string;
      user: string;
    };
  };

  // MCP
  mcp: {
    title: string;
    description: string;
    addServer: string;
    editServer: string;
    deleteServer: string;
    deleteConfirm: string;
    deleteSuccess: string;
    createSuccess: string;
    updateSuccess: string;
    enabled: string;
    disabled: string;
    type: string;
    typeStdio: string;
    typeSse: string;
    typeHttp: string;
    command: string;
    commandHint: string;
    args: string;
    argsHint: string;
    env: string;
    envHint: string;
    url: string;
    urlHint: string;
    headers: string;
    headersHint: string;
    serverDescription: string;
    descriptionHint: string;
    oauth: string;
    oauthEnabled: string;
    oauthTokenUrl: string;
    grantType: string;
    clientId: string;
    clientSecret: string;
    scope: string;
    emptyTitle: string;
    emptyDescription: string;
    guide: string;
    guideIntro: string;
    guideStdioTitle: string;
    guideStdioSteps: string;
    guideSseTitle: string;
    guideSseSteps: string;
    guideLinks: string;
  };

  // Conversation
  conversation: {
    noMessages: string;
  };

  // Page titles (document title)
  pages: {
    appName: string;
    newChat: string;
    untitled: string;
  };

  // Tool calls
  toolCalls: {
    presentFiles: string;
    needYourHelp: string;
    useTool: (toolName: string) => string;
    searchFor: (query: string) => string;
    viewWebPage: string;
    writeTodos: string;
    skillInstallTooltip: string;
  };

  // Structured human-in-the-loop clarification forms
  humanInput: {
    answered: string;
    pending: string;
    readOnly: string;
    otherLabel: string;
    otherPlaceholder: string;
    submit: string;
    emptyError: string;
    requiredError: string;
    requiredA11yLabel: string;
    selectPlaceholder: string;
    answeredValue: (value: string) => string;
  };

  // Uploads
  uploads: {
    uploading: string;
    uploadingFiles: string;
  };

  // Subtasks
  subtasks: {
    subtask: string;
    in_progress: string;
    completed: string;
    failed: string;
  };

  // Token Usage
  tokenUsage: {
    title: string;
    label: string;
    input: string;
    output: string;
    total: string;
    unavailable: string;
    // Per-task summary bar (rendered below the chat input box)
    taskTitle: string;
    taskEmpty: string;
    taskCalls: string;
    taskCacheHitRate: string;
    taskCacheSaved: string;
    taskByModel: string;
  };

  // Shortcuts
  shortcuts: {
    searchActions: string;
    noResults: string;
    actions: string;
    keyboardShortcuts: string;
    keyboardShortcutsDescription: string;
    openCommandPalette: string;
    toggleSidebar: string;
  };

  // Models
  models: {
    addModel: string;
    editModel: string;
    name: string;
    nameHint: string;
    displayName: string;
    provider: string;
    providerHint: string;
    modelId: string;
    modelIdHint: string;
    apiKey: string;
    apiKeyHint: string;
    baseUrl: string;
    baseUrlHint: string;
    maxTokens: string;
    maxInputTokens: string;
    maxInputTokensHint: string;
    maxRetries: string;
    temperature: string;
    requestTimeout: string;
    modelDescription: string;
    modelDescriptionHint: string;
    supportsThinking: string;
    supportsVision: string;
    supportsReasoningEffort: string;
    reasoningEffortValues: string;
    reasoningEffortValuesHint: string;
    thinkingEnabled: string;
    thinkingDisabled: string;
    emptyDescription: string;
    badJson: string;
  };

  // Settings
  settings: {
    title: string;
    view: {
      backToApp: string;
      searchPlaceholder: string;
      resizeLabel: string;
      groups: {
        personal: string;
        agent: string;
        toolsData: string;
        engine: string;
      };
      titles: {
        general: string;
        models: string;
        memorySummary: string;
        tokenUsageBudget: string;
        mcp: string;
        plugins: string;
        toolsSandbox: string;
        webTools: string;
        uploads: string;
        skill: string;
        dataPersistence: string;
        skillModels: string;
        agents: string;
        subagents: string;
        runtime: string;
      };
      summaries: {
        general: string;
        models: string;
        memorySummary: string;
        tokenUsageBudget: string;
        skill: string;
        mcp: string;
        plugins: string;
        toolsSandbox: string;
        webTools: string;
        uploads: string;
        dataPersistence: string;
        skillModels: string;
        agents: string;
        subagents: string;
        runtime: string;
      };
    };
    general: {
      accountGroup: string;
      appearanceGroup: string;
      systemGroup: string;
    };
    composer: {
      groupTitle: string;
      busyEnterTitle: string;
      busyEnterDescription: string;
      busyEnterQueue: string;
      busyEnterSteer: string;
    };
    account: {
      email: string;
      role: string;
      passwordSection: string;
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
      passwordMismatch: string;
      passwordTooShort: string;
      update: string;
      updating: string;
      passwordSuccess: string;
      networkError: string;
      logout: string;
    };
    appearance: {
      themeTitle: string;
      themeDescription: string;
      system: string;
      light: string;
      dark: string;
      languageTitle: string;
      languageDescription: string;
      messageWidthTitle: string;
      messageWidthDescription: string;
      messageWidthNarrow: string;
      messageWidthMedium: string;
      messageWidthWide: string;
      messageFontSizeTitle: string;
      messageFontSizeDescription: string;
      messageFontSizeSmall: string;
      messageFontSizeMedium: string;
      messageFontSizeLarge: string;
      messageLineHeightTitle: string;
      messageLineHeightDescription: string;
      messageLineHeightCompact: string;
      messageLineHeightComfortable: string;
      messageLineHeightRelaxed: string;
    };
    skills: {
      title: string;
      description: string;
      createSkill: string;
      emptyTitle: string;
      emptyDescription: string;
      emptyButton: string;
    };
    tokenUsage: {
      title: string;
      summaryTotalRuns: string;
      summaryApiCalls: string;
      byModel: string;
      byCaller: string;
      runsColumn: string;
      leadAgent: string;
      subagent: string;
      middleware: string;
      noData: string;
      cacheHit: string;
      cacheHitTitle: string;
      cacheHitTokens: string;
      cacheHitRate: string;
      cacheMiss: string;
      cacheSavedHint: string;
      timezoneHint: string;
    };
  };

  // Queued messages
  queue: {
    title: string;
    count: string;
    sendAll: string;
    sendAllAllTitle: string;
    sendAllStreamingTitle: string;
    status: {
      pending: string;
      injecting: string;
      injected: string;
      sending: string;
      error: string;
    };
    action: {
      injectActiveTitle: string;
      injectInactiveTitle: string;
      edit: string;
      delete: string;
      deleteInjectedTitle: string;
      retry: string;
      steer: string;
      steerUnavailable: string;
      save: string;
      cancelEdit: string;
    };
    toast: {
      queued: string;
    };
  };
}
