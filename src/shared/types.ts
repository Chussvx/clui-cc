// ─── Claude Code Stream Event Types (verified from v2.1.63) ───

export interface InitEvent {
  type: 'system'
  subtype: 'init'
  cwd: string
  session_id: string
  tools: string[]
  mcp_servers: Array<{ name: string; status: string }>
  model: string
  permissionMode: string
  agents: string[]
  skills: string[]
  plugins: string[]
  claude_code_version: string
  fast_mode_state: string
  uuid: string
}

export interface StreamEvent {
  type: 'stream_event'
  event: StreamSubEvent
  session_id: string
  parent_tool_use_id: string | null
  uuid: string
}

export type StreamSubEvent =
  | { type: 'message_start'; message: AssistantMessagePayload }
  | { type: 'content_block_start'; index: number; content_block: ContentBlock }
  | { type: 'content_block_delta'; index: number; delta: ContentDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string | null }; usage: UsageData; context_management?: unknown }
  | { type: 'message_stop' }

export interface ContentBlock {
  type: 'text' | 'tool_use'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

export type ContentDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'input_json_delta'; partial_json: string }

export interface AssistantEvent {
  type: 'assistant'
  message: AssistantMessagePayload
  parent_tool_use_id: string | null
  session_id: string
  uuid: string
}

export interface AssistantMessagePayload {
  model: string
  id: string
  role: 'assistant'
  content: ContentBlock[]
  stop_reason: string | null
  usage: UsageData
}

export interface RateLimitEvent {
  type: 'rate_limit_event'
  rate_limit_info: {
    status: string
    resetsAt: number
    rateLimitType: string
  }
  session_id: string
  uuid: string
}

export interface ResultEvent {
  type: 'result'
  subtype: 'success' | 'error'
  is_error: boolean
  duration_ms: number
  num_turns: number
  result: string
  total_cost_usd: number
  session_id: string
  usage: UsageData & {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  permission_denials: string[]
  uuid: string
}

export interface UsageData {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  service_tier?: string
}

export interface PermissionEvent {
  type: 'permission_request'
  tool: { name: string; description?: string; input?: Record<string, unknown> }
  question_id: string
  options: Array<{ id: string; label: string; kind?: string }>
  session_id: string
  uuid: string
}

// Union of all possible top-level events
export type ClaudeEvent = InitEvent | StreamEvent | AssistantEvent | RateLimitEvent | ResultEvent | PermissionEvent | UnknownEvent

export interface UnknownEvent {
  type: string
  [key: string]: unknown
}

// ─── Orchestration Mode Types ───

export type AgentRole = 'orchestrator' | 'worker' | 'researcher' | 'implementer' | 'reviewer' | 'custom'

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'

export type OrchestrationMode = 'single' | 'multi'

export interface AgentDefinition {
  id: string
  role: AgentRole
  name: string
  systemPrompt?: string
  model?: string
  allowedTools?: string[]
  maxTurns?: number
}

export interface AgentState {
  id: string
  tabId: string
  role: AgentRole
  name: string
  status: AgentStatus
  activeRequestId: string | null
  claudeSessionId: string | null
  messages: Message[]
  permissionQueue: PermissionRequest[]
  currentActivity: string
  lastResult: RunResult | null
  /** Cumulative cost for this agent */
  costUsd: number
}

// ─── Tab State Machine (v2 — from execution plan) ───

export type TabStatus = 'connecting' | 'idle' | 'running' | 'completed' | 'failed' | 'dead'

export interface PermissionRequest {
  questionId: string
  toolTitle: string
  toolDescription?: string
  toolInput?: Record<string, unknown>
  options: Array<{ optionId: string; kind?: string; label: string }>
  /** Agent that triggered this permission (orchestration mode only) */
  agentId?: string
  agentName?: string
}

export interface Attachment {
  id: string
  type: 'image' | 'file'
  name: string
  path: string
  mimeType?: string
  /** Base64 data URL for image previews */
  dataUrl?: string
  /** Text content for text-based files (read at attach time) */
  textContent?: string
  /** File size in bytes */
  size?: number
}

export interface TabState {
  id: string
  claudeSessionId: string | null
  status: TabStatus
  activeRequestId: string | null
  hasUnread: boolean
  currentActivity: string
  permissionQueue: PermissionRequest[]
  /** Fallback card when tools were denied and no interactive permission is available */
  permissionDenied: { tools: Array<{ toolName: string; toolUseId: string }> } | null
  attachments: Attachment[]
  messages: Message[]
  title: string
  /** Last run's result data (cost, tokens, duration) */
  lastResult: RunResult | null
  /** Session metadata from init event */
  sessionModel: string | null
  sessionTools: string[]
  sessionMcpServers: Array<{ name: string; status: string }>
  sessionSkills: string[]
  sessionVersion: string | null
  /** Prompts waiting behind the current run (display text only) */
  queuedPrompts: string[]
  /** Working directory for this tab's Claude sessions */
  workingDirectory: string
  /** Whether the user explicitly chose a directory (vs. using default home) */
  hasChosenDirectory: boolean
  /** Extra directories accessible via --add-dir (session-preserving) */
  additionalDirs: string[]
  /** Orchestration mode: 'single' (default) or 'multi' (concurrent agents) */
  orchestrationMode: OrchestrationMode
  /** Agent definitions for this tab (only when orchestrationMode === 'multi') */
  agentDefinitions: AgentDefinition[]
  /** Per-agent runtime state, keyed by agentId */
  agentStates: Record<string, AgentState>
  /** Which agent's messages are currently displayed in ConversationView */
  primaryAgentId: string | null
  /** One-shot flag: next prompt should trigger orchestration analysis */
  orchestrateNext: boolean
  /** True while Haiku analysis is in flight */
  orchAnalyzing: boolean
  /** Prompt held during orchestration analysis (sent after approve/skip) */
  pendingOrchPrompt: string | null
  /** Active orchestration proposal awaiting user decision */
  orchProposal: OrchestrationProposal | null
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolName?: string
  toolInput?: string
  toolStatus?: 'running' | 'completed' | 'error'
  timestamp: number
  /** Agent that produced this message (orchestration mode only) */
  agentId?: string
}

export interface RunResult {
  totalCostUsd: number
  durationMs: number
  numTurns: number
  usage: UsageData
  sessionId: string
  /** Model ID used for this run (populated when auto-mode resolves a model) */
  model?: string
}

export type PanelType = 'terminal' | 'mcp' | 'cost' | 'prompts' | 'notifications' | 'visualizations' | 'memory' | null

// ─── Inline Visualization Widgets ───

export interface Widget {
  id: string
  /** ID of the message that contains this widget */
  messageId: string
  /** Title extracted from the code block or auto-generated */
  title: string
  /** 'html' for full HTML widgets, 'svg' for inline SVG */
  kind: 'html' | 'svg'
  /** Raw source code to render in iframe */
  code: string
  /** Timestamp for ordering in side list */
  timestamp: number
}

// ─── Memory (CLAUDE.md + auto-memory) ───

export interface MemoryEntry {
  /** Filename relative to memory dir (e.g. 'feedback_testing.md') */
  filename: string
  /** Frontmatter name field */
  name: string
  /** Frontmatter description */
  description: string
  /** Frontmatter type */
  memoryType: 'user' | 'feedback' | 'project' | 'reference' | 'unknown'
  /** Full markdown body (after frontmatter) */
  body: string
}

export interface MemoryListResult {
  /** CLAUDE.md files found (project root + global) */
  claudeMdFiles: Array<{ path: string; label: string; content: string }>
  /** Auto-memory entries from memory/ dir */
  memories: MemoryEntry[]
  /** The encoded project path used */
  projectDir: string
}

// ─── Constants ───

/** Cost warning threshold for orchestration (USD) — shared between main and renderer */
export const COST_WARNING_USD = 0.50

// ─── Auto-Orchestration Proposal ───

export interface OrchestrationProposal {
  agents: Array<{
    role: AgentRole
    name: string
    description: string
  }>
  reasoning: string
  complexity: 'low' | 'medium' | 'high'
}

// ─── Canonical Events (normalized from raw stream) ───

export type NormalizedEvent =
  | { type: 'session_init'; sessionId: string; tools: string[]; model: string; mcpServers: Array<{ name: string; status: string }>; skills: string[]; version: string; isWarmup?: boolean }
  | { type: 'text_chunk'; text: string }
  | { type: 'tool_call'; toolName: string; toolId: string; index: number }
  | { type: 'tool_call_update'; toolId: string; partialInput: string }
  | { type: 'tool_call_complete'; index: number }
  | { type: 'task_update'; message: AssistantMessagePayload }
  | { type: 'task_complete'; result: string; costUsd: number; durationMs: number; numTurns: number; usage: UsageData; sessionId: string; permissionDenials?: Array<{ toolName: string; toolUseId: string }> }
  | { type: 'error'; message: string; isError: boolean; sessionId?: string }
  | { type: 'session_dead'; exitCode: number | null; signal: string | null; stderrTail: string[] }
  | { type: 'rate_limit'; status: string; resetsAt: number; rateLimitType: string }
  | { type: 'usage'; usage: UsageData }
  | { type: 'permission_request'; questionId: string; toolName: string; toolDescription?: string; toolInput?: Record<string, unknown>; options: Array<{ id: string; label: string; kind?: string }>; agentId?: string; agentName?: string }
  // Orchestration-specific events
  | { type: 'agent_status_change'; agentId: string; agentName: string; newStatus: AgentStatus; oldStatus: AgentStatus }
  | { type: 'agent_task_complete'; agentId: string; agentName: string; result: string; costUsd: number; durationMs: number; numTurns: number; usage: UsageData; sessionId: string }
  | { type: 'orchestration_complete'; totalCostUsd: number; agentCosts: Record<string, number> }
  | { type: 'orchestration_proposal'; proposal: OrchestrationProposal }

// ─── Run Options ───

export interface RunOptions {
  prompt: string
  projectPath: string
  sessionId?: string
  allowedTools?: string[]
  maxTurns?: number
  maxBudgetUsd?: number
  systemPrompt?: string
  model?: string
  /** Path to CLUI-scoped settings file with hook config (passed via --settings) */
  hookSettingsPath?: string
  /** Extra directories to add via --add-dir (session-preserving) */
  addDirs?: string[]
  /** Base64 image data URLs to include as image content blocks */
  images?: Array<{ mediaType: string; data: string }>
}

// ─── Control Plane Types ───

export interface TabRegistryEntry {
  tabId: string
  claudeSessionId: string | null
  status: TabStatus
  activeRequestId: string | null
  runPid: number | null
  createdAt: number
  lastActivityAt: number
  promptCount: number
  /** Orchestration mode for this tab */
  orchestrationMode: OrchestrationMode
  /** All active agent requestIds (orchestration mode) */
  activeAgentRequests: Map<string, string>  // agentId → requestId
  /** Per-agent session IDs */
  agentSessions: Map<string, string | null>  // agentId → sessionId
  /** Agent definitions (set at orchestration start) */
  agentDefinitions: AgentDefinition[]
}

export interface HealthReport {
  tabs: Array<{
    tabId: string
    status: TabStatus
    activeRequestId: string | null
    claudeSessionId: string | null
    alive: boolean
  }>
  queueDepth: number
}

export interface EnrichedError {
  message: string
  stderrTail: string[]
  stdoutTail?: string[]
  exitCode: number | null
  elapsedMs: number
  toolCallCount: number
  sawPermissionRequest?: boolean
  permissionDenials?: Array<{ tool_name: string; tool_use_id: string }>
}

// ─── Session History ───

export interface SessionMeta {
  sessionId: string
  slug: string | null
  firstMessage: string | null
  lastTimestamp: string
  size: number
}

export interface SessionLoadMessage {
  role: string
  content: string
  toolName?: string
  timestamp: number
}

// ─── Marketplace / Plugin Types ───

export type PluginStatus = 'not_installed' | 'checking' | 'installing' | 'installed' | 'failed'

export interface CatalogPlugin {
  id: string              // unique: `${repo}/${skillPath}` e.g. 'anthropics/skills/skills/xlsx'
  name: string            // from SKILL.md or plugin.json
  description: string     // from SKILL.md or plugin.json
  version: string         // from plugin.json or '0.0.0'
  author: string          // from plugin.json or marketplace entry
  marketplace: string     // marketplace name from marketplace.json
  repo: string            // 'anthropics/skills'
  sourcePath: string      // path within repo, e.g. 'skills/xlsx'
  installName: string     // individual skill name for SKILL.md skills, bundle name for CLI plugins
  category: string        // 'Agent Skills' | 'Knowledge Work' | 'Financial Services'
  tags: string[]          // Semantic use-case tags derived from name/description (e.g. 'Design', 'Finance')
  isSkillMd: boolean      // true = individual SKILL.md (direct install), false = CLI plugin (bundle install)
}

// ─── IPC Channel Names ───

export const IPC = {
  // Request-response (renderer → main)
  START: 'clui:start',
  CREATE_TAB: 'clui:create-tab',
  PROMPT: 'clui:prompt',
  CANCEL: 'clui:cancel',
  STOP_TAB: 'clui:stop-tab',
  RETRY: 'clui:retry',
  STATUS: 'clui:status',
  TAB_HEALTH: 'clui:tab-health',
  CLOSE_TAB: 'clui:close-tab',
  SELECT_DIRECTORY: 'clui:select-directory',
  OPEN_EXTERNAL: 'clui:open-external',
  OPEN_IN_TERMINAL: 'clui:open-in-terminal',
  ATTACH_FILES: 'clui:attach-files',
  TAKE_SCREENSHOT: 'clui:take-screenshot',
  TRANSCRIBE_AUDIO: 'clui:transcribe-audio',
  PASTE_IMAGE: 'clui:paste-image',
  GET_DIAGNOSTICS: 'clui:get-diagnostics',
  RESPOND_PERMISSION: 'clui:respond-permission',
  INIT_SESSION: 'clui:init-session',
  RESET_TAB_SESSION: 'clui:reset-tab-session',
  ANIMATE_HEIGHT: 'clui:animate-height',
  LIST_SESSIONS: 'clui:list-sessions',
  LOAD_SESSION: 'clui:load-session',
  MEMORY_LIST: 'clui:memory-list',
  MEMORY_READ: 'clui:memory-read',
  MEMORY_WRITE: 'clui:memory-write',
  MEMORY_DELETE: 'clui:memory-delete',

  // One-way events (main → renderer)
  TEXT_CHUNK: 'clui:text-chunk',
  TOOL_CALL: 'clui:tool-call',
  TOOL_CALL_UPDATE: 'clui:tool-call-update',
  TOOL_CALL_COMPLETE: 'clui:tool-call-complete',
  TASK_UPDATE: 'clui:task-update',
  TASK_COMPLETE: 'clui:task-complete',
  SESSION_DEAD: 'clui:session-dead',
  SESSION_INIT: 'clui:session-init',
  ERROR: 'clui:error',
  RATE_LIMIT: 'clui:rate-limit',

  // Window management
  RESIZE_HEIGHT: 'clui:resize-height',
  SET_WINDOW_WIDTH: 'clui:set-window-width',
  HIDE_WINDOW: 'clui:hide-window',
  WINDOW_SHOWN: 'clui:window-shown',
  SET_IGNORE_MOUSE_EVENTS: 'clui:set-ignore-mouse-events',
  START_WINDOW_DRAG: 'clui:start-window-drag',
  RESET_WINDOW_POSITION: 'clui:reset-window-position',
  IS_VISIBLE: 'clui:is-visible',

  // Skill provisioning (main → renderer)
  SKILL_STATUS: 'clui:skill-status',

  // Theme
  GET_THEME: 'clui:get-theme',
  THEME_CHANGED: 'clui:theme-changed',

  // Marketplace
  MARKETPLACE_FETCH: 'clui:marketplace-fetch',
  MARKETPLACE_INSTALLED: 'clui:marketplace-installed',
  MARKETPLACE_INSTALL: 'clui:marketplace-install',
  MARKETPLACE_UNINSTALL: 'clui:marketplace-uninstall',

  // Permission mode
  SET_PERMISSION_MODE: 'clui:set-permission-mode',

  // Orchestration mode (multi-agent)
  ORCH_ANALYZE: 'clui:orch-analyze',
  ORCH_DEFINE_AGENTS: 'clui:orch-define-agents',
  ORCH_START: 'clui:orch-start',
  ORCH_CANCEL_AGENT: 'clui:orch-cancel-agent',
  ORCH_CANCEL_ALL: 'clui:orch-cancel-all',
  ORCH_RESPOND_PERMISSION: 'clui:orch-respond-permission',
  // Orchestration events (main → renderer)
  ORCH_AGENT_EVENT: 'clui:orch-agent-event',
  ORCH_AGENT_STATUS: 'clui:orch-agent-status',
  ORCH_AGENT_ERROR: 'clui:orch-agent-error',

  // Prompt improvement (Haiku)
  PROMPT_IMPROVE: 'clui:prompt-improve',
  PROMPT_CLARIFY: 'clui:prompt-clarify',

  // Embedded terminal (PTY)
  PTY_OPEN: 'clui:pty-open',
  PTY_INPUT: 'clui:pty-input',
  PTY_RESIZE: 'clui:pty-resize',
  PTY_CLOSE: 'clui:pty-close',
  PTY_DATA: 'clui:pty-data',
  PTY_EXIT: 'clui:pty-exit',

  // Legacy (kept for backward compat during migration)
  STREAM_EVENT: 'clui:stream-event',
  RUN_COMPLETE: 'clui:run-complete',
  RUN_ERROR: 'clui:run-error',
} as const
