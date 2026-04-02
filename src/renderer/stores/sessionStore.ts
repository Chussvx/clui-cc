import { create } from 'zustand'
import type { TabStatus, NormalizedEvent, EnrichedError, Message, TabState, Attachment, CatalogPlugin, PluginStatus, PanelType, AgentDefinition, AgentState, AgentStatus } from '../../shared/types'
import { useThemeStore } from '../theme'
import notificationSrc from '../../../resources/notification.mp3'

// ─── Known models ───

export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
] as const

function normalizeModelId(modelId: string): string {
  // Claude sometimes appends context window hints like "[1m]" to model IDs.
  return modelId.replace(/\[[^\]]+\]/g, '').trim()
}

export function getModelDisplayLabel(modelId: string): string {
  const normalizedId = normalizeModelId(modelId)
  const has1MContext = /\[\s*1m\s*\]/i.test(modelId)

  const known = AVAILABLE_MODELS.find((m) => m.id === normalizedId)
  if (known) {
    return has1MContext ? `${known.label} (1M)` : known.label
  }

  // Fallback for future model IDs not yet listed in AVAILABLE_MODELS.
  const compact = normalizedId
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '')
  const familyMatch = compact.match(/^(opus|sonnet|haiku)-(\d+)-(\d+)$/i)
  if (familyMatch) {
    const family = familyMatch[1][0].toUpperCase() + familyMatch[1].slice(1).toLowerCase()
    const label = `${family} ${familyMatch[2]}.${familyMatch[3]}`
    return has1MContext ? `${label} (1M)` : label
  }

  return has1MContext ? `${normalizedId} (1M)` : normalizedId
}

// ─── Auto Model Selection ───

const COMPLEX_KEYWORDS = /\b(refactor|optimize|architect|redesign|migrate|rewrite|implement|build)\b/i
const MEDIUM_KEYWORDS = /\b(fix|debug|update|change|modify|add|remove|test)\b/i

export function autoSelectModel(prompt: string): string {
  const wordCount = prompt.split(/\s+/).length
  if (wordCount > 300 || COMPLEX_KEYWORDS.test(prompt)) return 'claude-opus-4-6'
  if (wordCount > 80 || MEDIUM_KEYWORDS.test(prompt)) return 'claude-sonnet-4-6'
  return 'claude-haiku-4-5-20251001'
}

// ─── Store ───

interface StaticInfo {
  version: string
  email: string | null
  subscriptionType: string | null
  projectPath: string
  homePath: string
}

interface State {
  tabs: TabState[]
  activeTabId: string
  /** Global expand/collapse — user-controlled, not per-tab */
  isExpanded: boolean
  /** Global info fetched on startup (not per-session) */
  staticInfo: StaticInfo | null
  /** User's preferred model override (null = use default) */
  preferredModel: string | null
  /** Global permission mode: 'ask' shows cards, 'auto' auto-approves all tool calls */
  permissionMode: 'ask' | 'auto'

  /** Plan mode — prepends system instruction telling Claude to only plan, not edit */
  planMode: boolean
  /** Currently open panel (mutual exclusion — only one at a time) */
  activePanel: PanelType
  /** Per-session cost history */
  costHistory: import('../../shared/types').RunResult[]
  /** Model resolved by auto-select for the current in-flight request */
  lastResolvedModel: string | null

  // Terminal panel
  terminalOpen: boolean

  // Marketplace state
  marketplaceOpen: boolean
  marketplaceCatalog: CatalogPlugin[]
  marketplaceLoading: boolean
  marketplaceError: string | null
  marketplaceInstalledNames: string[]
  marketplacePluginStates: Record<string, PluginStatus>
  marketplaceSearch: string
  marketplaceFilter: string

  // Actions
  initStaticInfo: () => Promise<void>
  setPreferredModel: (model: string | null) => void
  setPermissionMode: (mode: 'ask' | 'auto') => void
  createTab: () => Promise<string>
  selectTab: (tabId: string) => void
  closeTab: (tabId: string) => void
  clearTab: () => void
  toggleExpanded: () => void
  toggleTerminal: () => void
  toggleMarketplace: () => void
  closeMarketplace: () => void
  loadMarketplace: (forceRefresh?: boolean) => Promise<void>
  setMarketplaceSearch: (query: string) => void
  setMarketplaceFilter: (filter: string) => void
  installMarketplacePlugin: (plugin: CatalogPlugin) => Promise<void>
  uninstallMarketplacePlugin: (plugin: CatalogPlugin) => Promise<void>
  togglePlanMode: () => void
  togglePanel: (panel: PanelType) => void
  clearCostHistory: () => void
  buildYourOwn: () => void
  resumeSession: (sessionId: string, title?: string, projectPath?: string) => Promise<string>
  addSystemMessage: (content: string) => void
  sendMessage: (prompt: string, projectPath?: string) => void
  respondPermission: (tabId: string, questionId: string, optionId: string) => void
  addDirectory: (dir: string) => void
  removeDirectory: (dir: string) => void
  setBaseDirectory: (dir: string) => void
  addAttachments: (attachments: Attachment[]) => void
  removeAttachment: (attachmentId: string) => void
  clearAttachments: () => void
  handleNormalizedEvent: (tabId: string, event: NormalizedEvent) => void
  handleStatusChange: (tabId: string, newStatus: string, oldStatus: string) => void
  handleError: (tabId: string, error: EnrichedError) => void

  // Orchestration actions
  orchDefineAgents: (tabId: string, agents: AgentDefinition[]) => Promise<void>
  orchStart: (prompt: string, projectPath: string) => Promise<void>
  orchCancelAgent: (agentId: string) => void
  orchCancelAll: () => void
  orchRespondPermission: (agentId: string, questionId: string, optionId: string) => void
  handleAgentEvent: (tabId: string, agentId: string, event: NormalizedEvent) => void
}

let msgCounter = 0
const nextMsgId = () => `msg-${++msgCounter}`

// ─── Notification sound (plays when task completes while window is hidden) ───
const notificationAudio = new Audio(notificationSrc)
notificationAudio.volume = 1.0

async function playNotificationIfHidden(): Promise<void> {
  if (!useThemeStore.getState().soundEnabled) return
  try {
    const visible = await window.clui.isVisible()
    if (!visible) {
      notificationAudio.currentTime = 0
      notificationAudio.play().catch(() => {})
    }
  } catch {}
}

function makeLocalTab(): TabState {
  return {
    id: crypto.randomUUID(),
    claudeSessionId: null,
    status: 'idle',
    activeRequestId: null,
    hasUnread: false,
    currentActivity: '',
    permissionQueue: [],
    permissionDenied: null,
    attachments: [],
    messages: [],
    title: 'New Tab',
    lastResult: null,
    sessionModel: null,
    sessionTools: [],
    sessionMcpServers: [],
    sessionSkills: [],
    sessionVersion: null,
    queuedPrompts: [],
    workingDirectory: '~',
    hasChosenDirectory: false,
    additionalDirs: [],
    orchestrationMode: 'single',
    agentDefinitions: [],
    agentStates: {},
    primaryAgentId: null,
  }
}

const initialTab = makeLocalTab()

export const useSessionStore = create<State>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,
  isExpanded: false,
  staticInfo: null,
  preferredModel: null,
  permissionMode: 'ask',
  planMode: false,
  activePanel: null,
  costHistory: [],
  lastResolvedModel: null,

  // Terminal
  terminalOpen: false,

  // Marketplace
  marketplaceOpen: false,
  marketplaceCatalog: [],
  marketplaceLoading: false,
  marketplaceError: null,
  marketplaceInstalledNames: [],
  marketplacePluginStates: {},
  marketplaceSearch: '',
  marketplaceFilter: 'All',

  initStaticInfo: async () => {
    try {
      const result = await window.clui.start()
      set({
        staticInfo: {
          version: result.version || 'unknown',
          email: result.auth?.email || null,
          subscriptionType: result.auth?.subscriptionType || null,
          projectPath: result.projectPath || '~',
          homePath: result.homePath || '~',
        },
      })
    } catch {}
  },

  setPreferredModel: (model) => {
    set({ preferredModel: model })
  },

  setPermissionMode: (mode) => {
    set({ permissionMode: mode })
    window.clui.setPermissionMode(mode)
  },

  togglePlanMode: () => {
    set((s) => ({ planMode: !s.planMode }))
  },

  togglePanel: (panel) => {
    set((s) => ({ activePanel: s.activePanel === panel ? null : panel }))
  },

  clearCostHistory: () => {
    set({ costHistory: [] })
  },

  createTab: async () => {
    const homeDir = get().staticInfo?.homePath || '~'
    try {
      const { tabId } = await window.clui.createTab()
      const tab: TabState = {
        ...makeLocalTab(),
        id: tabId,
        workingDirectory: homeDir,
      }
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }))
      return tabId
    } catch {
      const tab = makeLocalTab()
      tab.workingDirectory = homeDir
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
      }))
      return tab.id
    }
  },

  selectTab: (tabId) => {
    const s = get()
    if (tabId === s.activeTabId) {
      // Clicking the already-active tab: toggle global expand/collapse
      const willExpand = !s.isExpanded
      set((prev) => ({
        isExpanded: willExpand,
        marketplaceOpen: false,
        terminalOpen: false,
        // Expanding = reading: clear unread flag
        tabs: willExpand
          ? prev.tabs.map((t) => t.id === tabId ? { ...t, hasUnread: false } : t)
          : prev.tabs,
      }))
    } else {
      // Switching to a different tab: mark as read
      set((prev) => ({
        activeTabId: tabId,
        marketplaceOpen: false,
        terminalOpen: false,
        tabs: prev.tabs.map((t) =>
          t.id === tabId ? { ...t, hasUnread: false } : t
        ),
      }))
    }
  },

  toggleExpanded: () => {
    const { activeTabId, isExpanded } = get()
    const willExpand = !isExpanded
    set((s) => ({
      isExpanded: willExpand,
      marketplaceOpen: false,
      // Expanding = reading: clear unread flag for the active tab
      tabs: willExpand
        ? s.tabs.map((t) => t.id === activeTabId ? { ...t, hasUnread: false } : t)
        : s.tabs,
    }))
  },

  toggleTerminal: () => {
    const s = get()
    if (s.terminalOpen) {
      set({ terminalOpen: false })
    } else {
      set({ terminalOpen: !s.terminalOpen, isExpanded: false, marketplaceOpen: false })
    }
  },

  toggleMarketplace: () => {
    const s = get()
    if (s.marketplaceOpen) {
      set({ marketplaceOpen: false })
    } else {
      set({ isExpanded: false, marketplaceOpen: true, terminalOpen: false })
      get().loadMarketplace()
    }
  },

  closeMarketplace: () => {
    set({ marketplaceOpen: false })
  },

  loadMarketplace: async (forceRefresh) => {
    set({ marketplaceLoading: true, marketplaceError: null })
    try {
      const [catalog, installed] = await Promise.all([
        window.clui.fetchMarketplace(forceRefresh),
        window.clui.listInstalledPlugins(),
      ])
      if (catalog.error && catalog.plugins.length === 0) {
        set({ marketplaceError: catalog.error, marketplaceLoading: false })
        return
      }
      const installedSet = new Set(installed.map((n) => n.toLowerCase()))
      const pluginStates: Record<string, PluginStatus> = {}
      for (const p of catalog.plugins) {
        // For SKILL.md skills: match individual name against ~/.claude/skills/ dirs
        // For CLI plugins: match installName or "installName@marketplace" against installed_plugins.json
        const candidates = p.isSkillMd
          ? [p.installName]
          : [p.installName, `${p.installName}@${p.marketplace}`]
        const isInstalled = candidates.some((c) => installedSet.has(c.toLowerCase()))
        pluginStates[p.id] = isInstalled ? 'installed' : 'not_installed'
      }
      set({
        marketplaceCatalog: catalog.plugins,
        marketplaceInstalledNames: installed,
        marketplacePluginStates: pluginStates,
        marketplaceLoading: false,
      })
    } catch (err: unknown) {
      set({
        marketplaceError: err instanceof Error ? err.message : String(err),
        marketplaceLoading: false,
      })
    }
  },

  setMarketplaceSearch: (query) => {
    set({ marketplaceSearch: query })
  },

  setMarketplaceFilter: (filter) => {
    set({ marketplaceFilter: filter })
  },

  installMarketplacePlugin: async (plugin) => {
    set((s) => ({
      marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'installing' },
    }))
    const result = await window.clui.installPlugin(plugin.repo, plugin.installName, plugin.marketplace, plugin.sourcePath, plugin.isSkillMd)
    if (result.ok) {
      set((s) => ({
        marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'installed' as PluginStatus },
        marketplaceInstalledNames: [...s.marketplaceInstalledNames, plugin.installName],
      }))
    } else {
      set((s) => ({
        marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'failed' },
      }))
    }
  },

  uninstallMarketplacePlugin: async (plugin) => {
    const result = await window.clui.uninstallPlugin(plugin.installName)
    if (result.ok) {
      set((s) => ({
        marketplacePluginStates: { ...s.marketplacePluginStates, [plugin.id]: 'not_installed' as PluginStatus },
        marketplaceInstalledNames: s.marketplaceInstalledNames.filter((n) => n !== plugin.installName),
      }))
    }
  },

  buildYourOwn: () => {
    set({ marketplaceOpen: false, isExpanded: true })
    // Small delay to let the UI transition
    setTimeout(() => {
      get().sendMessage('Help me create a new Claude Code skill')
    }, 100)
  },

  closeTab: (tabId) => {
    window.clui.closeTab(tabId).catch(() => {})

    const s = get()
    const remaining = s.tabs.filter((t) => t.id !== tabId)

    if (s.activeTabId === tabId) {
      if (remaining.length === 0) {
        const newTab = makeLocalTab()
        set({ tabs: [newTab], activeTabId: newTab.id })
        return
      }
      const closedIndex = s.tabs.findIndex((t) => t.id === tabId)
      const newActive = remaining[Math.min(closedIndex, remaining.length - 1)]
      set({ tabs: remaining, activeTabId: newActive.id })
    } else {
      set({ tabs: remaining })
    }
  },

  clearTab: () => {
    const { activeTabId } = get()
    set((s) => ({
      costHistory: [],
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, messages: [], lastResult: null, currentActivity: '', permissionQueue: [], permissionDenied: null, queuedPrompts: [] }
          : t
      ),
    }))
  },

  resumeSession: async (sessionId, title, projectPath) => {
    const defaultDir = projectPath || get().staticInfo?.homePath || '~'
    try {
      const { tabId } = await window.clui.createTab()

      // Load previous conversation messages from the JSONL file
      const history = await window.clui.loadSession(sessionId, defaultDir).catch(() => [])
      const messages: Message[] = history.map((m) => ({
        id: nextMsgId(),
        role: m.role as Message['role'],
        content: m.content,
        toolName: m.toolName,
        toolStatus: m.toolName ? 'completed' as const : undefined,
        timestamp: m.timestamp,
      }))

      const tab: TabState = {
        ...makeLocalTab(),
        id: tabId,
        claudeSessionId: sessionId,
        title: title || 'Resumed Session',
        workingDirectory: defaultDir,
        hasChosenDirectory: !!projectPath,
        messages,
      }
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        isExpanded: true,
      }))
      // Don't call initSession — the first real prompt will use --resume with the sessionId
      return tabId
    } catch {
      const tab = makeLocalTab()
      tab.claudeSessionId = sessionId
      tab.title = title || 'Resumed Session'
      tab.workingDirectory = defaultDir
      tab.hasChosenDirectory = !!projectPath
      set((s) => ({
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        isExpanded: true,
      }))
      return tab.id
    }
  },

  addSystemMessage: (content) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              messages: [
                ...t.messages,
                { id: nextMsgId(), role: 'system' as const, content, timestamp: Date.now() },
              ],
            }
          : t
      ),
    }))
  },

  // ─── Permission response ───

  respondPermission: (tabId, questionId, optionId) => {
    // Send to backend
    window.clui.respondPermission(tabId, questionId, optionId).catch(() => {})

    // Remove answered item from queue; show next tool's activity or clear
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t
        const remaining = t.permissionQueue.filter((p) => p.questionId !== questionId)
        return {
          ...t,
          permissionQueue: remaining,
          currentActivity: remaining.length > 0
            ? `Waiting for permission: ${remaining[0].toolTitle}`
            : 'Working...',
        }
      }),
    }))
  },

  // ─── Directory management ───

  addDirectory: (dir) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              additionalDirs: t.additionalDirs.includes(dir)
                ? t.additionalDirs
                : [...t.additionalDirs, dir],
            }
          : t
      ),
    }))
  },

  removeDirectory: (dir) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, additionalDirs: t.additionalDirs.filter((d) => d !== dir) }
          : t
      ),
    }))
  },

  setBaseDirectory: (dir) => {
    const { activeTabId } = get()
    window.clui.resetTabSession(activeTabId)
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              workingDirectory: dir,
              hasChosenDirectory: true,
              claudeSessionId: null,
              additionalDirs: [],
            }
          : t
      ),
    }))
  },

  // ─── Attachment management ───

  addAttachments: (attachments) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, attachments: [...t.attachments, ...attachments] }
          : t
      ),
    }))
  },

  removeAttachment: (attachmentId) => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? { ...t, attachments: t.attachments.filter((a) => a.id !== attachmentId) }
          : t
      ),
    }))
  },

  clearAttachments: () => {
    const { activeTabId } = get()
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId ? { ...t, attachments: [] } : t
      ),
    }))
  },

  // ─── Send ───

  sendMessage: (prompt, projectPath) => {
    const { activeTabId, tabs, staticInfo } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    // Use explicitly chosen directory, otherwise fall back to user home
    const resolvedPath = projectPath || (tab?.hasChosenDirectory ? tab.workingDirectory : (staticInfo?.homePath || tab?.workingDirectory || '~'))
    if (!tab) return

    // Guard: don't send while connecting (warmup in progress)
    if (tab.status === 'connecting') return

    const isBusy = tab.status === 'running'
    const requestId = crypto.randomUUID()

    // Build full prompt with attachment context
    let fullPrompt = prompt
    const imageAttachments = tab.attachments.filter((a) => a.type === 'image' && a.dataUrl)
    if (tab.attachments.length > 0) {
      const attachmentCtx = tab.attachments
        .map((a) => {
          if (a.textContent) return `[Attached file: ${a.name}]\n\`\`\`\n${a.textContent}\n\`\`\``
          if (a.type === 'image') return `[Attached image: ${a.name}]`
          return `[Attached ${a.type}: ${a.path}]`
        })
        .join('\n\n')
      fullPrompt = `${attachmentCtx}\n\n${prompt}`
    }

    const title = tab.messages.length === 0
      ? (prompt.length > 30 ? prompt.substring(0, 27) + '...' : prompt)
      : tab.title

    // Optimistic update: clear attachments
    // If busy, add to queuedPrompts (shown at bottom); otherwise add to messages and set connecting
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== activeTabId) return t
        const withEffectiveBase = t.hasChosenDirectory
          ? t
          : {
              ...t,
              // Once the user sends the first message, lock in the effective
              // base directory (home by default) so the footer no longer shows "—".
              hasChosenDirectory: true,
              workingDirectory: resolvedPath,
            }
        if (isBusy) {
          return {
            ...withEffectiveBase,
            title,
            attachments: [],
            queuedPrompts: [...withEffectiveBase.queuedPrompts, prompt],
          }
        }
        return {
          ...withEffectiveBase,
          status: 'connecting' as TabStatus,
          activeRequestId: requestId,
          currentActivity: 'Starting...',
          title,
          attachments: [],
          messages: [
            ...withEffectiveBase.messages,
            { id: nextMsgId(), role: 'user' as const, content: prompt, timestamp: Date.now() },
          ],
        }
      }),
    }))

    // Send to backend — ControlPlane will queue if a run is active
    const { preferredModel, planMode } = get()

    // Plan mode: prepend system instruction
    if (planMode) {
      fullPrompt = `[PLAN MODE] You are in PLAN MODE. Analyze the request, research the approach, and describe your plan in detail. Do NOT make any code changes.\n\n${fullPrompt}`
    }

    // Auto model selection
    let resolvedModel = preferredModel
    if (preferredModel === 'auto') {
      resolvedModel = autoSelectModel(fullPrompt)
      set({ lastResolvedModel: resolvedModel })
    }

    // Extract base64 data from image attachments for content blocks
    const images = imageAttachments
      .map((a) => {
        const match = a.dataUrl!.match(/^data:([^;]+);base64,(.+)$/)
        if (!match) return null
        return { mediaType: match[1], data: match[2] }
      })
      .filter((x): x is { mediaType: string; data: string } => x !== null)

    window.clui.prompt(activeTabId, requestId, {
      prompt: fullPrompt,
      projectPath: resolvedPath,
      sessionId: tab.claudeSessionId || undefined,
      model: resolvedModel || undefined,
      addDirs: tab.additionalDirs.length > 0 ? tab.additionalDirs : undefined,
      images: images.length > 0 ? images : undefined,
    }).catch((err: Error) => {
      get().handleError(activeTabId, {
        message: err.message,
        stderrTail: [],
        exitCode: null,
        elapsedMs: 0,
        toolCallCount: 0,
      })
    })
  },

  // ─── Event handlers ───

  handleNormalizedEvent: (tabId, event) => {
    set((s) => {
      const { activeTabId } = s
      const tabs = s.tabs.map((tab) => {
        if (tab.id !== tabId) return tab
        const updated = { ...tab }

        switch (event.type) {
          case 'session_init':
            updated.claudeSessionId = event.sessionId
            updated.sessionModel = event.model
            updated.sessionTools = event.tools
            updated.sessionMcpServers = event.mcpServers
            updated.sessionSkills = event.skills
            updated.sessionVersion = event.version
            // Don't change status/activity for warmup inits — they're invisible
            if (!event.isWarmup) {
              updated.status = 'running'
              updated.currentActivity = 'Thinking...'
              // Move the first queued prompt into the timeline (it's now being processed)
              if (updated.queuedPrompts.length > 0) {
                const [nextPrompt, ...rest] = updated.queuedPrompts
                updated.queuedPrompts = rest
                updated.messages = [
                  ...updated.messages,
                  { id: nextMsgId(), role: 'user' as const, content: nextPrompt, timestamp: Date.now() },
                ]
              }
            }
            break

          case 'text_chunk': {
            updated.currentActivity = 'Writing...'
            const lastMsg = updated.messages[updated.messages.length - 1]
            if (lastMsg?.role === 'assistant' && !lastMsg.toolName) {
              updated.messages = [
                ...updated.messages.slice(0, -1),
                { ...lastMsg, content: lastMsg.content + event.text },
              ]
            } else {
              updated.messages = [
                ...updated.messages,
                { id: nextMsgId(), role: 'assistant', content: event.text, timestamp: Date.now() },
              ]
            }
            break
          }

          case 'tool_call':
            updated.currentActivity = `Running ${event.toolName}...`
            updated.messages = [
              ...updated.messages,
              {
                id: nextMsgId(),
                role: 'tool',
                content: '',
                toolName: event.toolName,
                toolInput: '',
                toolStatus: 'running',
                timestamp: Date.now(),
              },
            ]
            break

          case 'tool_call_update': {
            const msgs = [...updated.messages]
            const lastTool = [...msgs].reverse().find((m) => m.role === 'tool' && m.toolStatus === 'running')
            if (lastTool) {
              lastTool.toolInput = (lastTool.toolInput || '') + event.partialInput
            }
            updated.messages = msgs
            break
          }

          case 'tool_call_complete': {
            const msgs2 = [...updated.messages]
            const runningTool = [...msgs2].reverse().find((m) => m.role === 'tool' && m.toolStatus === 'running')
            if (runningTool) {
              runningTool.toolStatus = 'completed'
            }
            updated.messages = msgs2
            break
          }

          case 'task_update': {
            // ── Text fallback ──
            // text_chunk events (from stream_event deltas) are the primary render path.
            // If they didn't arrive for this run (timing, partial stream, etc.), the
            // assembled assistant event still has the full text — extract it here.
            // "This run" = everything after the last user message.
            if (event.message?.content) {
              const lastUserIdx = (() => {
                for (let i = updated.messages.length - 1; i >= 0; i--) {
                  if (updated.messages[i].role === 'user') return i
                }
                return -1
              })()
              const hasStreamedText = updated.messages
                .slice(lastUserIdx + 1)
                .some((m) => m.role === 'assistant' && !m.toolName)

              if (!hasStreamedText) {
                const textContent = event.message.content
                  .filter((b) => b.type === 'text' && b.text)
                  .map((b) => b.text!)
                  .join('')
                if (textContent) {
                  updated.messages = [
                    ...updated.messages,
                    { id: nextMsgId(), role: 'assistant' as const, content: textContent, timestamp: Date.now() },
                  ]
                }
              }

              // ── Tool card deduplication (unchanged) ──
              for (const block of event.message.content) {
                if (block.type === 'tool_use' && block.name) {
                  const exists = updated.messages.find(
                    (m) => m.role === 'tool' && m.toolName === block.name && !m.content
                  )
                  if (!exists) {
                    updated.messages = [
                      ...updated.messages,
                      {
                        id: nextMsgId(),
                        role: 'tool',
                        content: '',
                        toolName: block.name,
                        toolInput: JSON.stringify(block.input, null, 2),
                        toolStatus: 'completed',
                        timestamp: Date.now(),
                      },
                    ]
                  }
                }
              }
            }
            break
          }

          case 'task_complete': {
            updated.status = 'completed'
            updated.activeRequestId = null
            updated.currentActivity = ''
            updated.permissionQueue = []
            const runResult = {
              totalCostUsd: event.costUsd,
              durationMs: event.durationMs,
              numTurns: event.numTurns,
              usage: event.usage,
              sessionId: event.sessionId,
              model: s.lastResolvedModel || updated.sessionModel || undefined,
            }
            updated.lastResult = runResult
            // ── Final text fallback ──
            // If neither text_chunks nor task_update text produced an assistant message,
            // use event.result (the CLI's assembled final output) as last resort.
            if (event.result) {
              const lastUserIdx2 = (() => {
                for (let i = updated.messages.length - 1; i >= 0; i--) {
                  if (updated.messages[i].role === 'user') return i
                }
                return -1
              })()
              const hasAnyText = updated.messages
                .slice(lastUserIdx2 + 1)
                .some((m) => m.role === 'assistant' && !m.toolName)
              if (!hasAnyText) {
                updated.messages = [
                  ...updated.messages,
                  { id: nextMsgId(), role: 'assistant' as const, content: event.result, timestamp: Date.now() },
                ]
              }
            }
            // Mark as unread unless the user is actively viewing this tab
            // (active tab with card expanded). A collapsed active tab still
            // counts as "unread" — the user hasn't seen the response yet.
            if (tabId !== activeTabId || !s.isExpanded) {
              updated.hasUnread = true
            }
            // Show fallback card when tools were denied by permission settings
            if (event.permissionDenials && event.permissionDenials.length > 0) {
              updated.permissionDenied = { tools: event.permissionDenials }
            } else {
              updated.permissionDenied = null
            }
            // Play notification sound if window is hidden
            playNotificationIfHidden()
            break
          }

          case 'error':
            updated.status = 'failed'
            updated.activeRequestId = null
            updated.currentActivity = ''
            updated.permissionQueue = []
            updated.permissionDenied = null
            updated.messages = [
              ...updated.messages,
              { id: nextMsgId(), role: 'system', content: `Error: ${event.message}`, timestamp: Date.now() },
            ]
            break

          case 'session_dead':
            updated.status = 'dead'
            updated.activeRequestId = null
            updated.currentActivity = ''
            updated.permissionQueue = []
            updated.permissionDenied = null
            updated.messages = [
              ...updated.messages,
              {
                id: nextMsgId(),
                role: 'system',
                content: `Session ended unexpectedly (exit ${event.exitCode})`,
                timestamp: Date.now(),
              },
            ]
            break

          case 'permission_request': {
            const newReq: import('../../shared/types').PermissionRequest = {
              questionId: event.questionId,
              toolTitle: event.toolName,
              toolDescription: event.toolDescription,
              toolInput: event.toolInput,
              options: event.options.map((o) => ({
                optionId: o.id,
                kind: o.kind,
                label: o.label,
              })),
            }
            updated.permissionQueue = [...updated.permissionQueue, newReq]
            updated.currentActivity = `Waiting for permission: ${event.toolName}`
            break
          }

          case 'rate_limit':
            if (event.status !== 'allowed') {
              updated.messages = [
                ...updated.messages,
                {
                  id: nextMsgId(),
                  role: 'system',
                  content: `Rate limited (${event.rateLimitType}). Resets at ${new Date(event.resetsAt).toLocaleTimeString()}.`,
                  timestamp: Date.now(),
                },
              ]
            }
            break

          case 'agent_status_change': {
            const agentState = updated.agentStates[event.agentId]
            if (agentState) {
              updated.agentStates = {
                ...updated.agentStates,
                [event.agentId]: {
                  ...agentState,
                  status: event.newStatus as AgentStatus,
                  currentActivity: event.newStatus === 'running' ? 'Working...' : '',
                },
              }
            }
            break
          }

          case 'orchestration_complete':
            updated.status = 'completed'
            updated.currentActivity = ''
            updated.messages = [
              ...updated.messages,
              {
                id: nextMsgId(),
                role: 'system',
                content: 'All agents completed.',
                timestamp: Date.now(),
              },
            ]
            playNotificationIfHidden()
            break
        }

        return updated
      })

      // Push completed runs to session-level costHistory
      if (event.type === 'task_complete') {
        const runResult = {
          totalCostUsd: event.costUsd,
          durationMs: event.durationMs,
          numTurns: event.numTurns,
          usage: event.usage,
          sessionId: event.sessionId,
          model: s.lastResolvedModel || tabs.find((t) => t.id === tabId)?.sessionModel || undefined,
        }
        return { tabs, costHistory: [...s.costHistory, runResult], lastResolvedModel: null }
      }

      return { tabs }
    })
  },

  handleStatusChange: (tabId, newStatus) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              status: newStatus as TabStatus,
              // Clear activity when transitioning to idle (e.g., after warmup init)
              ...(newStatus === 'idle' ? { currentActivity: '', permissionQueue: [] as import('../../shared/types').PermissionRequest[], permissionDenied: null } : {}),
            }
          : t
      ),
    }))
  },

  handleError: (tabId, error) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t

        // Deduplicate: skip if the last message is already an error for this failure
        const lastMsg = t.messages[t.messages.length - 1]
        const alreadyHasError = lastMsg?.role === 'system' && lastMsg.content.startsWith('Error:')

        return {
          ...t,
          status: 'failed' as TabStatus,
          activeRequestId: null,
          currentActivity: '',
          permissionQueue: [],
          messages: alreadyHasError
            ? t.messages
            : [
                ...t.messages,
                {
                  id: nextMsgId(),
                  role: 'system' as const,
                  content: `Error: ${error.message}${error.stderrTail.length > 0 ? '\n\n' + error.stderrTail.slice(-5).join('\n') : ''}`,
                  timestamp: Date.now(),
                },
              ],
        }
      }),
    }))
  },

  // ─── Orchestration Actions ───

  orchDefineAgents: async (tabId, agents) => {
    await window.clui.orchDefineAgents(tabId, agents)

    // Build initial AgentState records
    const agentStates: Record<string, AgentState> = {}
    for (const agent of agents) {
      agentStates[agent.id] = {
        id: agent.id,
        tabId,
        role: agent.role,
        name: agent.name,
        status: 'idle',
        activeRequestId: null,
        claudeSessionId: null,
        messages: [],
        permissionQueue: [],
        currentActivity: '',
        lastResult: null,
        costUsd: 0,
      }
    }

    const primaryId = agents.find((a) => a.role === 'orchestrator')?.id ?? agents[0].id

    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              orchestrationMode: 'multi' as const,
              agentDefinitions: agents,
              agentStates,
              primaryAgentId: primaryId,
            }
          : t
      ),
    }))
  },

  orchStart: async (prompt, projectPath) => {
    const { activeTabId } = get()
    try {
      await window.clui.orchStart(activeTabId, prompt, projectPath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.id === activeTabId
            ? {
                ...t,
                messages: [
                  ...t.messages,
                  { id: nextMsgId(), role: 'system' as const, content: `Orchestration error: ${msg}`, timestamp: Date.now() },
                ],
              }
            : t
        ),
      }))
    }
  },

  orchCancelAgent: (agentId) => {
    const { activeTabId } = get()
    window.clui.orchCancelAgent(activeTabId, agentId).catch(() => {})
  },

  orchCancelAll: () => {
    const { activeTabId } = get()
    window.clui.orchCancelAll(activeTabId).catch(() => {})
  },

  orchRespondPermission: (agentId, questionId, optionId) => {
    const { activeTabId } = get()
    window.clui.orchRespondPermission(activeTabId, agentId, questionId, optionId).catch(() => {})

    // Remove from the agent's permission queue
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== activeTabId) return t
        const agent = t.agentStates[agentId]
        if (!agent) return t
        const remaining = agent.permissionQueue.filter((p) => p.questionId !== questionId)
        return {
          ...t,
          agentStates: {
            ...t.agentStates,
            [agentId]: {
              ...agent,
              permissionQueue: remaining,
              currentActivity: remaining.length > 0
                ? `Waiting for permission: ${remaining[0].toolTitle}`
                : 'Working...',
            },
          },
        }
      }),
    }))
  },

  handleAgentEvent: (tabId, agentId, event) => {
    set((s) => {
      const tabs = s.tabs.map((tab) => {
        if (tab.id !== tabId) return tab
        const agent = tab.agentStates[agentId]
        if (!agent) return tab

        const updatedAgent = { ...agent }

        switch (event.type) {
          case 'text_chunk': {
            updatedAgent.currentActivity = 'Writing...'
            const lastMsg = updatedAgent.messages[updatedAgent.messages.length - 1]
            if (lastMsg?.role === 'assistant' && !lastMsg.toolName) {
              updatedAgent.messages = [
                ...updatedAgent.messages.slice(0, -1),
                { ...lastMsg, content: lastMsg.content + event.text, agentId },
              ]
            } else {
              updatedAgent.messages = [
                ...updatedAgent.messages,
                { id: nextMsgId(), role: 'assistant', content: event.text, timestamp: Date.now(), agentId },
              ]
            }
            break
          }

          case 'tool_call':
            updatedAgent.currentActivity = `Running ${event.toolName}...`
            updatedAgent.messages = [
              ...updatedAgent.messages,
              {
                id: nextMsgId(),
                role: 'tool',
                content: '',
                toolName: event.toolName,
                toolInput: '',
                toolStatus: 'running',
                timestamp: Date.now(),
                agentId,
              },
            ]
            break

          case 'tool_call_complete': {
            const msgs = [...updatedAgent.messages]
            const runningTool = [...msgs].reverse().find((m) => m.role === 'tool' && m.toolStatus === 'running')
            if (runningTool) {
              runningTool.toolStatus = 'completed'
            }
            updatedAgent.messages = msgs
            break
          }

          case 'task_complete':
            updatedAgent.status = 'completed'
            updatedAgent.currentActivity = ''
            updatedAgent.costUsd += event.costUsd
            updatedAgent.lastResult = {
              totalCostUsd: event.costUsd,
              durationMs: event.durationMs,
              numTurns: event.numTurns,
              usage: event.usage,
              sessionId: event.sessionId,
            }
            break

          case 'permission_request': {
            const newReq: import('../../shared/types').PermissionRequest = {
              questionId: event.questionId,
              toolTitle: event.toolName,
              toolDescription: event.toolDescription,
              toolInput: event.toolInput,
              options: event.options.map((o: { id: string; kind?: string; label: string }) => ({
                optionId: o.id,
                kind: o.kind,
                label: o.label,
              })),
              agentId: event.agentId,
              agentName: event.agentName,
            }
            updatedAgent.permissionQueue = [...updatedAgent.permissionQueue, newReq]
            updatedAgent.currentActivity = `Waiting for permission: ${event.toolName}`
            break
          }

          case 'error':
            updatedAgent.status = 'failed'
            updatedAgent.currentActivity = ''
            updatedAgent.messages = [
              ...updatedAgent.messages,
              { id: nextMsgId(), role: 'system', content: `Error: ${event.message}`, timestamp: Date.now(), agentId },
            ]
            break
        }

        return {
          ...tab,
          agentStates: { ...tab.agentStates, [agentId]: updatedAgent },
        }
      })

      return { tabs }
    })
  },
}))

// ─── HMR state persistence ───
// During `npm run dev`, Vite HMR re-executes this module on every code change.
// Without this guard, `create(...)` runs again, resetting the store to defaults.
// We stash the live state on the module's hot data and restore it after reload.
if (import.meta.hot) {
  const prev = import.meta.hot.data?.sessionStoreState as State | undefined
  if (prev) {
    const { tabs, activeTabId, isExpanded, staticInfo, preferredModel, permissionMode,
      planMode, activePanel, costHistory, lastResolvedModel,
      marketplaceOpen, marketplaceCatalog, marketplaceLoading, marketplaceError,
      marketplaceInstalledNames, marketplacePluginStates, marketplaceSearch, marketplaceFilter,
    } = prev
    useSessionStore.setState({
      tabs, activeTabId, isExpanded, staticInfo, preferredModel, permissionMode,
      planMode, activePanel, costHistory, lastResolvedModel,
      marketplaceOpen, marketplaceCatalog, marketplaceLoading, marketplaceError,
      marketplaceInstalledNames, marketplacePluginStates, marketplaceSearch, marketplaceFilter,
    })
  }

  import.meta.hot.dispose(() => {
    import.meta.hot!.data.sessionStoreState = useSessionStore.getState()
  })

  import.meta.hot.accept()
}
