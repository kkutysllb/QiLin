import type { LucideIcon } from "lucide-react";

export interface Translations {
  // Locale meta
  locale: {
    localName: string;
  };

  // Common
  common: {
    home: string;
    settings: string;
    delete: string;
    edit: string;
    rename: string;
    share: string;
    openInNewWindow: string;
    close: string;
    more: string;
    search: string;
    loadMore: string;
    download: string;
    thinking: string;
    artifacts: string;
    public: string;
    custom: string;
    builtin: string;
    locked: string;
    notAvailableInDemoMode: string;
    loading: string;
    version: string;
    all: string;
    lastUpdated: string;
    code: string;
    preview: string;
    cancel: string;
    save: string;
    install: string;
    create: string;
    import: string;
    export: string;
    exportAsMarkdown: string;
    exportAsJSON: string;
    exportSuccess: string;
  };

  runDuration: {
    reasoning: string;
    working: string;
    completedIn: (duration: string) => string;
    description: string;
    lessThanSecond: string;
    hours: (value: number) => string;
    minutes: (value: number) => string;
    seconds: (value: number) => string;
    separator: string;
  };

  home: {
    docs: string;
  };

  // Welcome
  welcome: {
    tagline: string;
    greetings: {
      morning: string;
      afternoon: string;
      evening: string;
    };
    description: string;
    createYourOwnSkill: string;
    createYourOwnSkillDescription: string;
    createCronJob: string;
    createCronJobDescription: string;
  };

  // Clipboard
  clipboard: {
    copyToClipboard: string;
    copiedToClipboard: string;
    failedToCopyToClipboard: string;
    linkCopied: string;
  };

  // Input Box
  inputBox: {
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
    // Workspace selector (per-thread local directory)
    workspace: string;
    workspaceDefault: string;
    workspaceDefaultDescription: string;
    workspaceSelectDirectory: string;
    workspaceEnterPath: string;
    workspaceEnterPathPlaceholder: string;
    workspaceUsePath: string;
    workspaceRecent: string;
    workspaceClear: string;
    workspaceClearConfirm: string;
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
    recentChats: string;
    recent3: string;
    thisWeek: string;
    thisMonth: string;
    earlier: string;
    newChat: string;
    chats: string;
    demoChats: string;
    agents: string;
    models: string;
    skills: string;
    mcp: string;
    crons: string;
    tokenUsage: string;
    customModes: string;
  };

  // Topbar
  topbar: {
    toggleSidebar: string;
    toggleRightPanel: string;
    backendConnected: string;
    backendDisconnected: string;
    backendChecking: string;
    tokens: string;
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
    noSession: string;
  };

  // Toolbar
  toolbar: {
    refresh: string;
    refreshing: string;
  };

  // Agents
  agents: {
    title: string;
    description: string;
    newAgent: string;
    emptyTitle: string;
    emptyDescription: string;
    chat: string;
    delete: string;
    deleteConfirm: string;
    deleteSuccess: string;
    newChat: string;
    createPageTitle: string;
    createPageSubtitle: string;
    nameStepTitle: string;
    nameStepHint: string;
    nameStepPlaceholder: string;
    nameStepContinue: string;
    nameStepInvalidError: string;
    nameStepAlreadyExistsError: string;
    nameStepNetworkError: string;
    nameStepCheckError: string;
    nameStepBootstrapMessage: string;
    save: string;
    saving: string;
    saveRequested: string;
    saveHint: string;
    saveCommandMessage: string;
    agentCreatedPendingRefresh: string;
    more: string;
    agentCreated: string;
    startChatting: string;
    backToGallery: string;
  };

  // Breadcrumb
  breadcrumb: {
    workspace: string;
    chats: string;
  };

  // Workspace
  workspace: {
    settings: string;
    settingsAndMore: string;
    logout: string;
    userInfo: {
      email: string;
      role: string;
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
    saveSuccess: string;
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

  // Crons / Automation
  crons: {
    title: string;
    description: string;
    addJob: string;
    editJob: string;
    deleteJob: string;
    deleteConfirm: string;
    deleteSuccess: string;
    createSuccess: string;
    updateSuccess: string;
    enabled: string;
    disabled: string;
    paused: string;
    running: string;
    completed: string;
    failed: string;
    cancelled: string;
    statusEnabled: string;
    statusPaused: string;
    statusRunning: string;
    statusCompleted: string;
    statusFailed: string;
    statusCancelled: string;
    pause: string;
    resume: string;
    trigger: string;
    triggerSuccess: string;
    nextRun: string;
    lastRun: string;
    scheduleType: string;
    scheduleOnce: string;
    scheduleCron: string;
    timezone: string;
    timezonePlaceholder: string;
    contextMode: string;
    contextFresh: string;
    contextReuse: string;
    name: string;
    nameHint: string;
    cron: string;
    cronHint: string;
    cronPlaceholder: string;
    jobDescription: string;
    jobDescriptionHint: string;
    agent: string;
    agentHint: string;
    model: string;
    modelHint: string;
    modelPlaceholder: string;
    prompt: string;
    promptHint: string;
    promptPlaceholder: string;
    emptyTitle: string;
    emptyDescription: string;
    guide: string;
    guideIntro: string;
    guideCronSyntax: string;
    guideCronFormat: string;
    guideExamples: string;
    guideModelNote: string;
    jobCount: string;
    retry: string;
  };

  // Conversation
  conversation: {
    noMessages: string;
    startConversation: string;
  };

  // Chats
  chats: {
    searchChats: string;
  };

  // Page titles (document title)
  pages: {
    appName: string;
    chats: string;
    newChat: string;
    untitled: string;
  };

  // Tool calls
  toolCalls: {
    moreSteps: (count: number) => string;
    lessSteps: string;
    executeCommand: string;
    presentFiles: string;
    needYourHelp: string;
    useTool: (toolName: string) => string;
    searchForRelatedInfo: string;
    searchForRelatedImages: string;
    searchFor: (query: string) => string;
    searchForRelatedImagesFor: (query: string) => string;
    searchOnWebFor: (query: string) => string;
    viewWebPage: string;
    listFolder: string;
    readFile: string;
    writeFile: string;
    clickToViewContent: string;
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
    executing: (count: number) => string;
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
    unavailableShort: string;
    finalAnswer: string;
    stepTotal: string;
    sharedAttribution: string;
    subagent: (description: string) => string;
    startTodo: (content: string) => string;
    completeTodo: (content: string) => string;
    updateTodo: (content: string) => string;
    removeTodo: (content: string) => string;
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
    title: string;
    description: string;
    addModel: string;
    editModel: string;
    deleteModel: string;
    deleteConfirm: string;
    deleteSuccess: string;
    createSuccess: string;
    updateSuccess: string;
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
    emptyTitle: string;
    emptyDescription: string;
    badJson: string;
  };

  // Settings
  settings: {
    title: string;
    description: string;
    sections: {
      models: string;
      general: string;
      account: string;
      appearance: string;
      memorySummary: string;
      tokenUsageBudget: string;
      mcp: string;
      toolsSandbox: string;
      webTools: string;
      uploads: string;
      skills: string;
      tokenUsage: string;
      dataSources: string;
      skillModels: string;
      agents: string;
      subagents: string;
    };
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
        toolsSandbox: string;
        webTools: string;
        uploads: string;
        skill: string;
        dataSources: string;
        dataPersistence: string;
        skillModels: string;
        agents: string;
        subagents: string;
      };
      summaries: {
        general: string;
        models: string;
        memorySummary: string;
        tokenUsageBudget: string;
        skill: string;
        mcp: string;
        toolsSandbox: string;
        webTools: string;
        uploads: string;
        dataSources: string;
        dataPersistence: string;
        skillModels: string;
        agents: string;
        subagents: string;
      };
    };
    backend: {
      title: string;
      description: string;
      restartButton: string;
      restarting: string;
      restartingToast: string;
      restartSuccess: string;
      restartFailedTray: string;
      restartTimeout: string;
      restartFailed: string;
    };
    general: {
      accountGroup: string;
      appearanceGroup: string;
      systemGroup: string;
      advancedGroup: string;
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
      systemDescription: string;
      lightDescription: string;
      darkDescription: string;
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
    mcpSettings: {
      title: string;
      description: string;
    };
    skills: {
      title: string;
      description: string;
      createSkill: string;
      emptyTitle: string;
      emptyDescription: string;
      emptyButton: string;
    };
    createSkillWizard: {
      title: string;
      stepBasics: string;
      stepTemplate: string;
      stepEdit: string;
      stepPreview: string;
      stepOf: string;
      // Step 1: basics
      nameLabel: string;
      namePlaceholder: string;
      nameHint: string;
      descriptionLabel: string;
      descriptionPlaceholder: string;
      descriptionCount: string;
      // Step 2: template
      templateLabel: string;
      templateBlank: string;
      templateTask: string;
      templateCoding: string;
      templateCopy: string;
      templateCopyHint: string;
      // Step 3: edit
      editLabel: string;
      editHint: string;
      // Step 4: preview
      previewLabel: string;
      previewHint: string;
      willCreateAt: string;
      // Footer
      cancel: string;
      back: string;
      next: string;
      create: string;
      creating: string;
      // Validation
      nameRequired: string;
      descriptionRequired: string;
      // States
      success: string;
      enhanceInChat: string;
      // Home (mode picker)
      homeTitle: string;
      homeDescription: string;
      modeTemplate: string;
      modeTemplateDesc: string;
      modeUpload: string;
      modeUploadDesc: string;
      modeScripts: string;
      modeScriptsDesc: string;
      backToHome: string;
      // Upload (.skill package) flow
      uploadDropHere: string;
      uploadButton: string;
      uploadSelected: string;
      uploadSize: string;
      uploadReplace: string;
      // Scripts flow
      scriptsSubdir: string;
      scriptsSubdirScripts: string;
      scriptsSubdirReferences: string;
      scriptsSubdirTemplates: string;
      scriptsSubdirAssets: string;
      scriptsAddMore: string;
      scriptsRemove: string;
      scriptsUploadHint: string;
      scriptsPartialFailure: string;
      scriptsCreateAndUpload: string;
      scriptsCreateAndUploading: string;
    };
    tokenUsage: {
      title: string;
      description: string;
      summaryTotalTokens: string;
      summaryTotalRuns: string;
      summaryApiCalls: string;
      summaryModels: string;
      byModel: string;
      byCaller: string;
      modelColumn: string;
      tokensColumn: string;
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
    acknowledge: {
      emptyTitle: string;
      emptyDescription: string;
    };
  };

  // Queued messages
  queue: {
    title: string;
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
      inject: string;
      injectActiveTitle: string;
      injectInactiveTitle: string;
      edit: string;
      delete: string;
      deleteInjectedTitle: string;
      retry: string;
      moveUp: string;
    };
    toast: {
      injected: string;
      runNotActive: string;
      limitExceeded: string;
      queued: string;
    };
    sendButtonStreaming: string;
  };

  // Todo panel
  todoPanel: {
    title: string;
    empty: string;
    close: string;
  };
}
