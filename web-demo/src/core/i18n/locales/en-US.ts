import {
  CompassIcon,
  GraduationCapIcon,
  ImageIcon,
  MicroscopeIcon,
  PenLineIcon,
  ShapesIcon,
  SparklesIcon,
  VideoIcon,
} from "lucide-react";

import type { Translations } from "./types";

export const enUS: Translations = {
  // Locale meta
  locale: {
    localName: "English",
  },

  // Common
  common: {
    settings: "Settings",
    delete: "Delete",
    rename: "Rename",
    share: "Share",
    openInNewWindow: "Open in new window",
    close: "Close",
    more: "More",
    loadMore: "Load more",
    download: "Download",
    thinking: "Thinking",
    artifacts: "Artifacts",
    notAvailableInDemoMode: "Not available in demo mode",
    loading: "Loading...",
    cancel: "Cancel",
    save: "Save",
    install: "Install",
    export: "Export",
    exportAsMarkdown: "Export as Markdown",
    exportAsJSON: "Export as JSON",
    exportSuccess: "Conversation exported",
  },

  // Welcome
  welcome: {
    tagline: "Give me a request, and I'll surprise you",
    greetings: {
      morning: "Good morning, a fresh start to a new day",
      afternoon: "Good afternoon, hope your work goes well",
      evening: "Good evening, great job today",
    },
  },

  // Clipboard
  clipboard: {
    copyToClipboard: "Copy to clipboard",
    copiedToClipboard: "Copied to clipboard",
    failedToCopyToClipboard: "Failed to copy to clipboard",
    linkCopied: "Link copied to clipboard",
  },

  messageActions: {
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Copy failed",
    branch: "Copy thread to new conversation",
    branching: "Copying",
    branchFailed: "Failed to create branch",
    regenerate: "Regenerate",
    feedbackUp: "Like this response",
    feedbackDown: "Dislike this response",
    feedbackSubmitted: "Feedback submitted",
    feedbackRemoved: "Feedback removed",
    feedbackFailed: "Failed to submit feedback",
  },

  // Input Box
  inputBox: {
    pickWorkspace: "Pick workspace",
    accessMode: "Access mode",
    sandboxReadOnly: "Read-only",
    sandboxWorkspaceWrite: "Workspace write",
    sandboxFullAccess: "Full access",
    sandboxFullAccessConfirmTitle: "Confirm full access",
    sandboxFullAccessConfirmDesc:
      "Full access lets the agent read/write any file and system outside the workspace without sandbox restrictions, which may be irreversible. Continue to full access?",
    sandboxFullAccessConfirm: "Still allow",
    sandboxFullAccessCancel: "Cancel",
    ungroupedOption: "Ungrouped",
    addWorkspace: "Add workspace…",
    placeholder: "How can I assist you today?",
    createSkillPrompt:
      "We're going to build a new skill step by step with `skill-creator`. To start, what do you want this skill to do?",
    skillModeBanner: "Skill Creation Mode",
    skillModeBannerHint:
      "The new skill will be auto-bound to the selected work mode below. Switch modes to change the binding target.",
    createCronPrompt:
      "Let's create a scheduled cron job together. Tell me: when should it run and what should it do? For example, generate a daily summary every morning at 9 AM.",
    addAttachments: "Add attachments",
    reasoningEffort: "Reasoning Effort",
    reasoningEffortMinimal: "Minimal",
    reasoningEffortMinimalDescription: "Retrieval + Direct Output",
    reasoningEffortLow: "Low",
    reasoningEffortLowDescription: "Simple Logic Check + Shallow Deduction",
    reasoningEffortMedium: "Medium",
    reasoningEffortMediumDescription:
      "Multi-layer Logic Analysis + Basic Verification",
    reasoningEffortHigh: "High",
    reasoningEffortHighDescription:
      "Full-dimensional Logic Deduction + Multi-path Verification + Backward Check, with subagents to divide work; strongest capability",
    searchModels: "Search models...",
    surpriseMe: "Surprise",
    surpriseMePrompt: "Surprise me",
    followupLoading: "Generating follow-up questions...",
    followupConfirmTitle: "Send suggestion?",
    followupConfirmDescription:
      "You already have text in the input. Choose how to send it.",
    followupConfirmAppend: "Append & send",
    followupConfirmReplace: "Replace & send",
    suggestions: [
      {
        suggestion: "Write",
        prompt: "Write a blog post about the latest trends on [topic]",
        icon: PenLineIcon,
      },
      {
        suggestion: "Research",
        prompt:
          "Conduct a deep dive research on [topic], and summarize the findings.",
        icon: MicroscopeIcon,
      },
      {
        suggestion: "Collect",
        prompt: "Collect data from [source] and create a report.",
        icon: ShapesIcon,
      },
      {
        suggestion: "Learn",
        prompt: "Learn about [topic] and create a tutorial.",
        icon: GraduationCapIcon,
      },
    ],
    suggestionsCreate: [
      {
        suggestion: "Webpage",
        prompt: "Create a webpage about [topic]",
        icon: CompassIcon,
      },
      {
        suggestion: "Image",
        prompt: "Create an image about [topic]",
        icon: ImageIcon,
      },
      {
        suggestion: "Video",
        prompt: "Create a video about [topic]",
        icon: VideoIcon,
      },
      {
        type: "separator",
      },
      {
        suggestion: "Skill",
        prompt:
          "We're going to build a new skill step by step with `skill-creator`. To start, what do you want this skill to do?",
        icon: SparklesIcon,
      },
    ],
  },

  // Sidebar
  sidebar: {
    newChat: "New task",
    expandSidebar: "Expand sidebar",
    workspacesSection: "Workspaces",
    searchWorkspaces: "Search sessions",
    newSessionInWorkspace: "New session in workspace",
    sortBy: "Sort by",
    sortManual: "Manual (registry order)",
    sortRecent: "Recently updated",
    addWorkspace: "Add workspace",
    agents: "Agents",
    tokenUsage: "Token Usage",
    ungroupedGroup: "Ungrouped",
    archivedSection: "Archived",
    archiveThread: "Archive",
    unarchiveThread: "Unarchive",
    moveToWorkspace: "Move to workspace",
    renameWorkspace: "Rename workspace",
    deleteWorkspaceAction: "Delete workspace",
    deleteWorkspaceHint:
      "Removes registration only; directory and history stay",
    moveUpItem: "Move up",
    moveDownItem: "Move down",
    emptyWorkspaceCount: "empty",
  },

  // Topbar
  topbar: {
    toggleRightPanel: "Toggle context panel",
    backendConnected: "Backend connected",
    backendDisconnected: "Backend disconnected",
    backendChecking: "Connecting…",
    noActiveSession: "No active session",
  },

  // Right Panel
  rightPanel: {
    title: "Task Context",
    todos: "Todos",
    subagents: "Sub-agents",
    skills: "Skills",
    uploads: "Uploads",
    artifacts: "Artifacts",
    empty: "No content",
  },

  // Toolbar
  toolbar: {
    refresh: "Refresh",
  },

  // Agents
  agents: {
    newChat: "New chat",
  },

  // Breadcrumb
  breadcrumb: {
    workspace: "Workspace",
    chats: "Chats",
  },

  // Workspace
  workspace: {
    settings: "Settings",
    logout: "Log out",
    userInfo: {
      admin: "Admin",
      user: "User",
    },
  },

  // MCP
  mcp: {
    title: "MCP Management",
    description:
      "Manage Model Context Protocol (MCP) servers to extend QiLin with additional tools and data access capabilities.",
    addServer: "Add Server",
    editServer: "Edit Server",
    deleteServer: "Delete Server",
    deleteConfirm:
      'Are you sure you want to delete MCP server "{name}"? This action cannot be undone.',
    deleteSuccess: "MCP server deleted",
    createSuccess: "MCP server created",
    updateSuccess: "MCP server updated",
    enabled: "Enabled",
    disabled: "Disabled",
    type: "Transport Type",
    typeStdio: "STDIO (local process)",
    typeSse: "SSE (Server-Sent Events)",
    typeHttp: "HTTP (streamable)",
    command: "Command",
    commandHint: "e.g. npx, python, node",
    args: "Arguments",
    argsHint: "One per line, e.g. -y\n@modelcontextprotocol/server-github",
    env: "Environment Variables",
    envHint: "One per line, format: KEY=value (supports $ENV_VAR references)",
    url: "Server URL",
    urlHint: "e.g. https://mcp.example.com/sse",
    headers: "HTTP Headers",
    headersHint: "One per line, format: Header-Name: value",
    serverDescription: "Description",
    descriptionHint: "Briefly describe what this MCP server provides",
    oauth: "OAuth Authentication",
    oauthEnabled: "Enable OAuth",
    oauthTokenUrl: "Token URL",
    grantType: "Grant Type",
    clientId: "Client ID",
    clientSecret: "Client Secret",
    scope: "Scope",
    emptyTitle: "No MCP servers yet",
    emptyDescription:
      "Add MCP servers to extend QiLin with external tools like GitHub, filesystem, and database access.",
    guide: "Setup Guide",
    guideIntro:
      "Model Context Protocol (MCP) is an open protocol that enables AI applications to securely access local and remote data sources. By configuring MCP servers, QiLin gains additional tool capabilities such as filesystem access, web search, and database queries.",
    guideStdioTitle: "STDIO Transport",
    guideStdioSteps:
      "1. Select STDIO type for locally-running MCP servers.\n2. Enter the launch command (e.g. npx, python) and required arguments.\n3. Configure environment variables if needed (e.g. API keys).\n4. After saving, QiLin will automatically start and manage the MCP server process.",
    guideSseTitle: "SSE / HTTP Transport",
    guideSseSteps:
      "1. Select SSE or HTTP type for remote MCP servers.\n2. Enter the server's SSE or HTTP endpoint URL.\n3. Add authentication headers (e.g. Authorization) if the server requires it.\n4. OAuth 2.0 is supported — configure Token URL for automatic token acquisition and refresh.",
    guideLinks: "Popular MCP Servers",
  },

  // Conversation
  conversation: {
    noMessages: "No messages yet",
  },

  // Page titles (document title)
  pages: {
    appName: "QiLin",
    newChat: "New chat",
    untitled: "Untitled",
  },

  // Tool calls
  toolCalls: {
    presentFiles: "Present files",
    needYourHelp: "Need your help",
    useTool: (toolName: string) => `Use "${toolName}" tool`,
    searchFor: (query: string) => `Search for "${query}"`,
    viewWebPage: "View web page",
    writeTodos: "Update to-do list",
    skillInstallTooltip: "Install skill and make it available to the agent",
  },

  // Structured human-in-the-loop clarification forms
  humanInput: {
    answered: "Answered",
    pending: "Sending...",
    readOnly: "Read only",
    otherLabel: "Other answer",
    otherPlaceholder: "Type another answer...",
    submit: "Submit",
    emptyError: "Enter an answer before submitting.",
    requiredError: "Fill in all required fields before submitting.",
    requiredA11yLabel: "required",
    selectPlaceholder: "Select...",
    answeredValue: (value: string) => `Answered: ${value}`,
  },

  // Subtasks
  uploads: {
    uploading: "Uploading...",
    uploadingFiles: "Uploading files, please wait...",
  },

  subtasks: {
    subtask: "Subtask",
    in_progress: "Running subtask",
    completed: "Subtask completed",
    failed: "Subtask failed",
  },

  // Token Usage
  tokenUsage: {
    title: "Token Usage",
    label: "Tokens",
    input: "Input",
    output: "Output",
    total: "Total",
    unavailable:
      "No token usage yet. Usage appears only after a successful model response when the provider returns usage_metadata.",
    // Per-task summary bar (rendered below the input box on the chat page)
    taskTitle: "This task",
    taskEmpty: "No token usage yet",
    taskCalls: "Model calls",
    taskCacheHitRate: "Cache hit rate",
    taskCacheSaved: "Input tokens saved",
    taskByModel: "By model",
  },

  // Shortcuts
  shortcuts: {
    searchActions: "Search actions...",
    noResults: "No results found.",
    actions: "Actions",
    keyboardShortcuts: "Keyboard Shortcuts",
    keyboardShortcutsDescription:
      "Navigate QiLin faster with keyboard shortcuts.",
    openCommandPalette: "Open Command Palette",
    toggleSidebar: "Toggle Sidebar",
  },

  // Models
  models: {
    addModel: "Add Model",
    editModel: "Edit Model",
    name: "Name",
    nameHint: "Unique identifier for the model, e.g. gpt-4",
    displayName: "Display Name",
    provider: "Provider",
    providerHint: "Provider class path, e.g. langchain_openai:ChatOpenAI",
    modelId: "Model ID",
    modelIdHint: "Actual provider model identifier, e.g. gpt-4",
    apiKey: "API Key",
    apiKeyHint: "API key or $ENV_VAR reference, e.g. $OPENAI_API_KEY",
    baseUrl: "Base URL",
    baseUrlHint: "Base URL for the provider API",
    maxTokens: "Max Tokens",
    maxInputTokens: "Max Input Tokens",
    maxInputTokensHint:
      "Context window size (max input tokens). Used by auto-summarization and model profile injection.",
    maxRetries: "Max Retries",
    temperature: "Temperature",
    requestTimeout: "Timeout (seconds)",
    modelDescription: "Description",
    modelDescriptionHint: "Brief description of the model",
    supportsThinking: "Supports Thinking",
    supportsVision: "Supports Vision",
    supportsReasoningEffort: "Supports Reasoning Effort",
    reasoningEffortValues: "Allowed Reasoning Effort Values",
    reasoningEffortValuesHint:
      "Set this when the endpoint only accepts a subset of values. " +
      "Comma-separated, e.g.: high, max. " +
      "Any incoming value not in this list is automatically mapped to the nearest supported one. " +
      "Reference values: minimal / none / low / medium / high / xhigh / max. Leave empty to forward as-is.",
    thinkingEnabled: "When Thinking Enabled",
    thinkingDisabled: "When Thinking Disabled",
    emptyDescription:
      'Click "Add Model" to add your first model configuration.',
    badJson: "Invalid JSON format",
  },
  settings: {
    title: "Settings",
    view: {
      backToApp: "Back to app",
      searchPlaceholder: "Search settings…",
      resizeLabel: "Resize settings sidebar",
      groups: {
        personal: "Personal",
        agent: "Agent",
        toolsData: "Tools & Data",
        engine: "Engine",
      },
      titles: {
        general: "General",
        models: "Models",
        memorySummary: "Memory & Summary",
        tokenUsageBudget: "Token & Budget",
        mcp: "MCP",
        plugins: "Plugins",
        toolsSandbox: "Tools & Sandbox",
        webTools: "Web Tools",
        uploads: "Uploads",
        skill: "Skills",
        dataPersistence: "Data & Persistence",
        skillModels: "Skill Models",
        agents: "Agents",
        subagents: "Sub-agents",
        runtime: "Runtime",
      },
      summaries: {
        general:
          "Account info, password, theme, language, log level, and YAML editor.",
        models:
          "Manage LLM models, create from provider templates, configure thinking/vision capabilities.",
        memorySummary:
          "Configure long-term memory, conversation summarization, and title generation.",
        tokenUsageBudget:
          "Configure token usage tracking and per-run token budget limits.",
        skill: "Enable built-in and custom skills, manage the skill matrix.",
        mcp: "MCP server CRUD management and one-click preset installation.",
        plugins:
          "Install DSH plugins from npm, enable/disable or remove installed ones, and view the host baseline.",
        toolsSandbox:
          "Sandbox environment, tool output truncation, lazy loading, progress tracking, and loop detection.",
        webTools:
          "Network proxy, search tools, and browser automation settings.",
        uploads:
          "File upload count and size limits, PDF/Word/Excel auto-conversion.",
        dataPersistence:
          "Manage persistence backends, view status and disk usage.",
        skillModels: "Desktop skill model API credential management.",
        agents: "Manage custom agents, enable/disable the agent API.",
        subagents:
          "Configure sub-agent global parameters and multi-agent orchestration.",
        runtime: "Interactive visualization of the QiLin runtime architecture.",
      },
    },
    general: {
      accountGroup: "Account",
      appearanceGroup: "Appearance",
      systemGroup: "System",
    },
    composer: {
      groupTitle: "Composer",
      busyEnterTitle: "Enter behavior while busy",
      busyEnterDescription:
        "Applies only while the agent is running; Cmd/Ctrl+Enter uses the other behavior",
      busyEnterQueue: "Queue",
      busyEnterSteer: "Steer",
    },
    account: {
      email: "Email",
      role: "Role",
      passwordSection: "Change Password",
      currentPassword: "Current password",
      newPassword: "New password",
      confirmPassword: "Confirm new password",
      passwordMismatch: "Passwords do not match",
      passwordTooShort: "Password must be at least 8 characters",
      update: "Update password",
      updating: "Updating…",
      passwordSuccess: "Password updated",
      networkError: "Network error, please try again.",
      logout: "Log out",
    },
    appearance: {
      themeTitle: "Theme",
      themeDescription:
        "Choose how the interface follows your device or stays fixed.",
      system: "System",
      light: "Light",
      dark: "Dark",
      languageTitle: "Language",
      languageDescription: "Switch between languages.",
      messageWidthTitle: "Message width",
      messageWidthDescription: "Set the maximum width of message content.",
      messageWidthNarrow: "Narrow",
      messageWidthMedium: "Medium",
      messageWidthWide: "Wide",
      messageFontSizeTitle: "Message font",
      messageFontSizeDescription: "Set the font size of message text.",
      messageFontSizeSmall: "Small",
      messageFontSizeMedium: "Medium",
      messageFontSizeLarge: "Large",
      messageLineHeightTitle: "Line spacing",
      messageLineHeightDescription: "Set the line spacing of message text.",
      messageLineHeightCompact: "Compact",
      messageLineHeightComfortable: "Comfortable",
      messageLineHeightRelaxed: "Relaxed",
    },
    skills: {
      title: "Agent Skills",
      description:
        "Manage the configuration and enabled status of the agent skills.",
      createSkill: "Add Skill",
      emptyTitle: "No agent skill yet",
      emptyDescription:
        "Create via AI guidance, or upload a .skill / .zip package to install.",
      emptyButton: "Install Your First Skill",
    },
    tokenUsage: {
      title: "Token Usage Statistics",
      summaryTotalRuns: "Total Runs",
      summaryApiCalls: "API Calls",
      byModel: "By Model",
      byCaller: "By Caller",
      runsColumn: "Runs",
      leadAgent: "Lead Agent",
      subagent: "Sub-agent",
      middleware: "Middleware",
      noData: "No token usage data",
      cacheHit: "Cache Hit",
      cacheHitTitle: "Cache Hit Statistics",
      cacheHitTokens: "Cache Hit Tokens",
      cacheHitRate: "Cache Hit Rate",
      cacheMiss: "Cache Miss",
      cacheSavedHint: "Input Tokens Saved",
      timezoneHint: "All dates are shown in Beijing time (UTC+8)",
    },
  },

  // Queued messages
  queue: {
    title: "Queued",
    count: "queued message(s)",
    sendAll: "Send all",
    sendAllAllTitle: "Send all",
    sendAllStreamingTitle:
      "Task running; messages will auto-send after it ends",
    status: {
      pending: "Queued",
      injecting: "Injecting",
      injected: "Injected",
      sending: "Sending",
      error: "Failed",
    },
    action: {
      injectActiveTitle: "Inject into the running task",
      injectInactiveTitle: "Task not running; send directly",
      edit: "Edit",
      delete: "Delete",
      deleteInjectedTitle: "Delete (injected; removes from queue only)",
      retry: "Retry",
      steer: "Steer now",
      steerUnavailable: "Only available while the agent is running",
      save: "Save",
      cancelEdit: "Cancel editing",
    },
    toast: {
      queued: "Added to send queue",
    },
  },
};
