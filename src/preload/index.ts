import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'
import type { RunOptions, NormalizedEvent, HealthReport, EnrichedError, Attachment, SessionMeta, CatalogPlugin, SessionLoadMessage, AgentDefinition, MemoryListResult } from '../shared/types'

export interface CluiAPI {
  // ─── Request-response (renderer → main) ───
  start(): Promise<{ version: string; auth: { email?: string; subscriptionType?: string; authMethod?: string }; mcpServers: string[]; projectPath: string; homePath: string }>
  createTab(): Promise<{ tabId: string }>
  prompt(tabId: string, requestId: string, options: RunOptions): Promise<void>
  cancel(requestId: string): Promise<boolean>
  stopTab(tabId: string): Promise<boolean>
  retry(tabId: string, requestId: string, options: RunOptions): Promise<void>
  status(): Promise<HealthReport>
  tabHealth(): Promise<HealthReport>
  closeTab(tabId: string): Promise<void>
  selectDirectory(): Promise<string | null>
  openExternal(url: string): Promise<boolean>
  openInTerminal(sessionId: string | null, projectPath?: string): Promise<boolean>
  attachFiles(): Promise<Attachment[] | null>
  takeScreenshot(): Promise<Attachment | null>
  pasteImage(dataUrl: string): Promise<Attachment | null>
  transcribeAudio(audioBase64: string): Promise<{ error: string | null; transcript: string | null }>
  getDiagnostics(): Promise<any>
  respondPermission(tabId: string, questionId: string, optionId: string): Promise<boolean>
  initSession(tabId: string): void
  resetTabSession(tabId: string): void
  listSessions(projectPath?: string): Promise<SessionMeta[]>
  loadSession(sessionId: string, projectPath?: string): Promise<SessionLoadMessage[]>
  fetchMarketplace(forceRefresh?: boolean): Promise<{ plugins: CatalogPlugin[]; error: string | null }>
  listInstalledPlugins(): Promise<string[]>
  installPlugin(repo: string, pluginName: string, marketplace: string, sourcePath?: string, isSkillMd?: boolean): Promise<{ ok: boolean; error?: string }>
  uninstallPlugin(pluginName: string): Promise<{ ok: boolean; error?: string }>
  searchOnline(query: string): Promise<{ plugins: CatalogPlugin[]; error: string | null }>
  fetchCommunitySkills(query?: string): Promise<{ plugins: CatalogPlugin[]; error: string | null }>
  fetchSkillReadme(repo: string, skillPath: string): Promise<{ content: string; error: string | null }>
  // ─── Memory ───
  memoryList(projectPath?: string): Promise<MemoryListResult>
  memoryRead(projectPath: string, filename: string): Promise<string | null>
  memoryWrite(projectPath: string, filename: string, content: string): Promise<{ ok: boolean; error?: string }>
  memoryDelete(projectPath: string, filename: string): Promise<{ ok: boolean; error?: string }>

  // ─── MCP management ───
  mcpListConfig(): Promise<{ servers: Array<{ name: string; command: string; args: string[]; enabled: boolean }> }>
  mcpReconnect(serverName: string): Promise<{ ok: boolean; error?: string }>
  mcpToggle(serverName: string, enabled: boolean): Promise<{ ok: boolean; error?: string }>

  debugInjectWidget(tabId: string): Promise<{ success: boolean }>
  openWidgetWindow(title: string, srcDoc: string): Promise<{ success: boolean }>
  registerWidget(html: string): Promise<{ url: string }>

  setPermissionMode(mode: string): void
  getTheme(): Promise<{ isDark: boolean }>
  onThemeChange(callback: (isDark: boolean) => void): () => void

  // ─── Orchestration Mode ───
  orchAnalyze(prompt: string): Promise<{ analysis: { shouldOrchestrate: boolean; agents: Array<{ role: string; name: string; description: string }>; reasoning: string; complexity: string } | null; error: string | null }>
  orchDefineAgents(tabId: string, agents: AgentDefinition[]): Promise<void>
  orchStart(tabId: string, prompt: string, projectPath: string): Promise<void>
  orchCancelAgent(tabId: string, agentId: string): Promise<boolean>
  orchCancelAll(tabId: string): Promise<boolean>
  orchRespondPermission(tabId: string, agentId: string, questionId: string, optionId: string): Promise<boolean>
  onAgentEvent(callback: (tabId: string, agentId: string, event: NormalizedEvent) => void): () => void

  // ─── Prompt improvement (Haiku) ───
  improvePrompt(prompt: string): Promise<{ improved: string; error: string | null }>
  clarifyPrompt(payload: { action: string; prompt: string; answers?: Array<{ question: string; answer: string }> }): Promise<any>

  // ─── Embedded terminal (PTY) ───
  openTerminal(termId: string, cols: number, rows: number, cwd?: string): Promise<{ ok: boolean; available: boolean }>
  writeTerminal(termId: string, data: string): void
  resizeTerminal(termId: string, cols: number, rows: number): void
  closeTerminal(termId: string): Promise<void>
  onTerminalData(callback: (termId: string, data: string) => void): () => void
  onTerminalExit(callback: (termId: string, code: number) => void): () => void

  // ─── Window management ───
  resizeHeight(height: number): void
  setWindowWidth(width: number): void
  animateHeight(from: number, to: number, durationMs: number): Promise<void>
  hideWindow(): void
  isVisible(): Promise<boolean>
  /** OS platform (darwin, win32, linux) */
  platform: string
  /** OS-level click-through for transparent window regions */
  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void
  /** Manual window drag for frameless windows */
  startWindowDrag(deltaX: number, deltaY: number): void
  /** Reset overlay to its default bottom-center position */
  resetWindowPosition(): void

  // ─── Event listeners (main → renderer) ───
  onEvent(callback: (tabId: string, event: NormalizedEvent) => void): () => void
  onTabStatusChange(callback: (tabId: string, newStatus: string, oldStatus: string) => void): () => void
  onError(callback: (tabId: string, error: EnrichedError) => void): () => void
  onSkillStatus(callback: (status: { name: string; state: string; error?: string; reason?: string }) => void): () => void
  onWindowShown(callback: () => void): () => void
}

const api: CluiAPI = {
  // ─── Request-response ───
  start: () => ipcRenderer.invoke(IPC.START),
  createTab: () => ipcRenderer.invoke(IPC.CREATE_TAB),
  prompt: (tabId, requestId, options) => ipcRenderer.invoke(IPC.PROMPT, { tabId, requestId, options }),
  cancel: (requestId) => ipcRenderer.invoke(IPC.CANCEL, requestId),
  stopTab: (tabId) => ipcRenderer.invoke(IPC.STOP_TAB, tabId),
  retry: (tabId, requestId, options) => ipcRenderer.invoke(IPC.RETRY, { tabId, requestId, options }),
  status: () => ipcRenderer.invoke(IPC.STATUS),
  tabHealth: () => ipcRenderer.invoke(IPC.TAB_HEALTH),
  closeTab: (tabId) => ipcRenderer.invoke(IPC.CLOSE_TAB, tabId),
  selectDirectory: () => ipcRenderer.invoke(IPC.SELECT_DIRECTORY),
  openExternal: (url) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  openInTerminal: (sessionId, projectPath) => ipcRenderer.invoke(IPC.OPEN_IN_TERMINAL, { sessionId, projectPath }),
  attachFiles: () => ipcRenderer.invoke(IPC.ATTACH_FILES),
  takeScreenshot: () => ipcRenderer.invoke(IPC.TAKE_SCREENSHOT),
  pasteImage: (dataUrl) => ipcRenderer.invoke(IPC.PASTE_IMAGE, dataUrl),
  transcribeAudio: (audioBase64) => ipcRenderer.invoke(IPC.TRANSCRIBE_AUDIO, audioBase64),
  getDiagnostics: () => ipcRenderer.invoke(IPC.GET_DIAGNOSTICS),
  respondPermission: (tabId, questionId, optionId) =>
    ipcRenderer.invoke(IPC.RESPOND_PERMISSION, { tabId, questionId, optionId }),
  initSession: (tabId) => ipcRenderer.send(IPC.INIT_SESSION, tabId),
  resetTabSession: (tabId) => ipcRenderer.send(IPC.RESET_TAB_SESSION, tabId),
  listSessions: (projectPath?: string) => ipcRenderer.invoke(IPC.LIST_SESSIONS, projectPath),
  loadSession: (sessionId: string, projectPath?: string) => ipcRenderer.invoke(IPC.LOAD_SESSION, { sessionId, projectPath }),
  fetchMarketplace: (forceRefresh) => ipcRenderer.invoke(IPC.MARKETPLACE_FETCH, { forceRefresh }),
  listInstalledPlugins: () => ipcRenderer.invoke(IPC.MARKETPLACE_INSTALLED),
  installPlugin: (repo, pluginName, marketplace, sourcePath, isSkillMd) =>
    ipcRenderer.invoke(IPC.MARKETPLACE_INSTALL, { repo, pluginName, marketplace, sourcePath, isSkillMd }),
  uninstallPlugin: (pluginName) =>
    ipcRenderer.invoke(IPC.MARKETPLACE_UNINSTALL, { pluginName }),
  searchOnline: (query) =>
    ipcRenderer.invoke('clui:marketplace-search-online', query),
  fetchCommunitySkills: (query?) =>
    ipcRenderer.invoke('clui:marketplace-community', query),
  fetchSkillReadme: (repo, skillPath) =>
    ipcRenderer.invoke('clui:marketplace-skill-readme', repo, skillPath),
  // ─── Memory ───
  memoryList: (projectPath?: string) => ipcRenderer.invoke(IPC.MEMORY_LIST, projectPath),
  memoryRead: (projectPath, filename) => ipcRenderer.invoke(IPC.MEMORY_READ, { projectPath, filename }),
  memoryWrite: (projectPath, filename, content) => ipcRenderer.invoke(IPC.MEMORY_WRITE, { projectPath, filename, content }),
  memoryDelete: (projectPath, filename) => ipcRenderer.invoke(IPC.MEMORY_DELETE, { projectPath, filename }),

  // ─── MCP management ───
  mcpListConfig: () => ipcRenderer.invoke('clui:mcp-list-config'),
  mcpReconnect: (serverName) => ipcRenderer.invoke('clui:mcp-reconnect', serverName),
  mcpToggle: (serverName, enabled) => ipcRenderer.invoke('clui:mcp-toggle', { serverName, enabled }),

  debugInjectWidget: (tabId) => ipcRenderer.invoke('clui:debug-inject-widget', tabId),
  openWidgetWindow: (title, srcDoc) => ipcRenderer.invoke('clui:open-widget-window', { title, srcDoc }),
  registerWidget: (html) => ipcRenderer.invoke('clui:register-widget', html),

  setPermissionMode: (mode) => ipcRenderer.send(IPC.SET_PERMISSION_MODE, mode),
  getTheme: () => ipcRenderer.invoke(IPC.GET_THEME),
  onThemeChange: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, isDark: boolean) => callback(isDark)
    ipcRenderer.on(IPC.THEME_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.THEME_CHANGED, handler)
  },

  // ─── Orchestration Mode ───
  orchAnalyze: (prompt) =>
    ipcRenderer.invoke(IPC.ORCH_ANALYZE, prompt),
  orchDefineAgents: (tabId, agents) =>
    ipcRenderer.invoke(IPC.ORCH_DEFINE_AGENTS, { tabId, agents }),
  orchStart: (tabId, prompt, projectPath) =>
    ipcRenderer.invoke(IPC.ORCH_START, { tabId, prompt, projectPath }),
  orchCancelAgent: (tabId, agentId) =>
    ipcRenderer.invoke(IPC.ORCH_CANCEL_AGENT, { tabId, agentId }),
  orchCancelAll: (tabId) =>
    ipcRenderer.invoke(IPC.ORCH_CANCEL_ALL, tabId),
  orchRespondPermission: (tabId, agentId, questionId, optionId) =>
    ipcRenderer.invoke(IPC.ORCH_RESPOND_PERMISSION, { tabId, agentId, questionId, optionId }),
  onAgentEvent: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, agentId: string, event: NormalizedEvent) =>
      callback(tabId, agentId, event)
    ipcRenderer.on(IPC.ORCH_AGENT_EVENT, handler)
    return () => ipcRenderer.removeListener(IPC.ORCH_AGENT_EVENT, handler)
  },

  // ─── Prompt improvement ───
  improvePrompt: (prompt) => ipcRenderer.invoke(IPC.PROMPT_IMPROVE, prompt),
  clarifyPrompt: (payload) => ipcRenderer.invoke(IPC.PROMPT_CLARIFY, payload),

  // ─── Embedded terminal ───
  openTerminal: (termId, cols, rows, cwd) =>
    ipcRenderer.invoke(IPC.PTY_OPEN, { termId, cols, rows, cwd }),
  writeTerminal: (termId, data) =>
    ipcRenderer.send(IPC.PTY_INPUT, termId, data),
  resizeTerminal: (termId, cols, rows) =>
    ipcRenderer.send(IPC.PTY_RESIZE, termId, cols, rows),
  closeTerminal: (termId) =>
    ipcRenderer.invoke(IPC.PTY_CLOSE, termId),
  onTerminalData: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, termId: string, data: string) => callback(termId, data)
    ipcRenderer.on(IPC.PTY_DATA, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_DATA, handler)
  },
  onTerminalExit: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, termId: string, code: number) => callback(termId, code)
    ipcRenderer.on(IPC.PTY_EXIT, handler)
    return () => ipcRenderer.removeListener(IPC.PTY_EXIT, handler)
  },

  // ─── Window management ───
  resizeHeight: (height) => ipcRenderer.send(IPC.RESIZE_HEIGHT, height),
  animateHeight: (from, to, durationMs) =>
    ipcRenderer.invoke(IPC.ANIMATE_HEIGHT, { from, to, durationMs }),
  hideWindow: () => ipcRenderer.send(IPC.HIDE_WINDOW),
  isVisible: () => ipcRenderer.invoke(IPC.IS_VISIBLE),
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.send(IPC.SET_IGNORE_MOUSE_EVENTS, ignore, options || {}),
  startWindowDrag: (deltaX, deltaY) =>
    ipcRenderer.send(IPC.START_WINDOW_DRAG, deltaX, deltaY),
  resetWindowPosition: () => ipcRenderer.send(IPC.RESET_WINDOW_POSITION),
  setWindowWidth: (width) => ipcRenderer.send(IPC.SET_WINDOW_WIDTH, width),
  platform: process.platform,

  // ─── Event listeners ───
  onEvent: (callback) => {
    const channels = [
      IPC.TEXT_CHUNK, IPC.TOOL_CALL, IPC.TOOL_CALL_UPDATE,
      IPC.TOOL_CALL_COMPLETE, IPC.TASK_UPDATE, IPC.TASK_COMPLETE,
      IPC.SESSION_DEAD, IPC.SESSION_INIT, IPC.ERROR, IPC.RATE_LIMIT,
    ]
    // Single unified handler — all normalized events come through one channel
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, event: NormalizedEvent) => callback(tabId, event)
    ipcRenderer.on('clui:normalized-event', handler)
    return () => ipcRenderer.removeListener('clui:normalized-event', handler)
  },

  onTabStatusChange: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, newStatus: string, oldStatus: string) =>
      callback(tabId, newStatus, oldStatus)
    ipcRenderer.on('clui:tab-status-change', handler)
    return () => ipcRenderer.removeListener('clui:tab-status-change', handler)
  },

  onError: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, error: EnrichedError) =>
      callback(tabId, error)
    ipcRenderer.on('clui:enriched-error', handler)
    return () => ipcRenderer.removeListener('clui:enriched-error', handler)
  },

  onSkillStatus: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, status: any) => callback(status)
    ipcRenderer.on(IPC.SKILL_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.SKILL_STATUS, handler)
  },

  onWindowShown: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.WINDOW_SHOWN, handler)
    return () => ipcRenderer.removeListener(IPC.WINDOW_SHOWN, handler)
  },
}

contextBridge.exposeInMainWorld('clui', api)
