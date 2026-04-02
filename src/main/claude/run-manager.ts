import { spawn, execSync, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { homedir } from 'os'
import { join, dirname, delimiter } from 'path'
import { readFile } from 'fs/promises'
import { StreamParser } from '../stream-parser'
import { normalize } from './event-normalizer'
import { log as _log } from '../logger'
import { getCliEnv } from '../cli-env'
import type { ClaudeEvent, NormalizedEvent, RunOptions, EnrichedError } from '../../shared/types'

const IS_WIN = process.platform === 'win32'
const MAX_RING_LINES = 100
const DEBUG = process.env.CLUI_DEBUG === '1'

// Appended to Claude's default system prompt so it knows it's running inside CLUI.
// Uses --append-system-prompt (additive) not --system-prompt (replacement).
const CLUI_SYSTEM_HINT = [
  'IMPORTANT: You are NOT running in a terminal. You are running inside CLUI,',
  'a desktop chat application with a rich UI that renders full markdown.',
  'CLUI is a GUI wrapper around Claude Code — the user sees your output in a',
  'styled conversation view, not a raw terminal.',
  '',
  'Because CLUI renders markdown natively, you MUST use rich formatting when it helps:',
  '- Always use clickable markdown links: [label](https://url) — they render as real buttons.',
  '- When the user asks for images, and public web images are appropriate, proactively find and render them in CLUI.',
  '- Workflow: WebSearch for relevant public pages -> WebFetch those pages -> extract real image URLs -> render with markdown ![alt](url).',
  '- Do not guess, fabricate, or construct image URLs from memory.',
  '- Only embed images when the URL is a real publicly accessible image URL found through tools or explicitly provided by the user.',
  '- If real image URLs cannot be obtained confidently, fall back to clickable links and briefly say so.',
  '- Do not ask whether CLUI can render images; assume it can.',
  '- Use tables, bold, headers, and bullet lists freely — they all render beautifully.',
  '- Use code blocks with language tags for syntax highlighting.',
  '',
  'VISUALIZATION CAPABILITY:',
  'CLUI renders HTML/SVG visualizations INLINE in the chat — like Claude.ai artifacts.',
  'When the user asks to "visualize", "show", "chart", "diagram", "graph", or "bar chart" something:',
  '- ALWAYS create visualizations as a fenced ```html code block directly in your response.',
  '  This is the ONLY reliable method. CLUI detects ```html blocks and renders them inline.',
  '- NEVER use MCP visualization tools (Three.js 3D Viewer, Mermaid Chart, etc.) for charts.',
  '  They render externally and the user cannot see them in CLUI.',
  '- NEVER use Python (matplotlib, plotly, etc.) for visualizations — CLUI cannot display them.',
  '- NEVER tell the user to "open the file" or "run the script". CLUI renders it inline.',
  '- Self-contained: ALL CSS and JS must be inline. No external CDN links or imports.',
  '- Include a <title> tag — CLUI uses it as the widget label.',
  '',
  'FRONTEND CRAFT — write production-quality HTML/CSS/JS:',
  '- Layout: Use CSS Grid and Flexbox properly. No absolute positioning hacks. Use gap, not margin tricks.',
  '- Typography: Use a proper font stack: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif.',
  '  Set line-height (1.4-1.6 for body text), letter-spacing where appropriate. Use rem/em, not fixed px for text.',
  '- Color: Use CSS custom properties (--bg, --fg, --accent). Build from a cohesive palette, not random hex.',
  '  Use HSL for derived shades (e.g. hover states). Ensure WCAG AA contrast (4.5:1 for text).',
  '- Spacing: Use a consistent scale (4/8/12/16/24/32px). Padding and margin should feel rhythmic, not arbitrary.',
  '- Borders & Radius: Subtle borders (1px solid with low-opacity color). Rounded corners 6-12px for cards, 4-6px for buttons.',
  '- Shadows: Layered box-shadows for depth: a tight one for definition + a soft spread for elevation.',
  '  Example: box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08);',
  '- Transitions: ALWAYS animate state changes. Use transition: 0.2-0.4s with proper easing (ease-out for enters, ease-in for exits).',
  '  Animate height, opacity, transform, background-color. Use cubic-bezier(.4,0,.2,1) for smooth motion.',
  '- Hover/Focus states: Every interactive element MUST have visible hover and focus states.',
  '  Buttons: slight translateY(-1px) + shadow lift. Links: underline or color shift. Cards: shadow elevation change.',
  '- Responsive: Use %, vw, min()/max()/clamp() for sizing. Never hardcode widths that break small containers.',
  '- Canvas/SVG: Use <canvas> for data-heavy charts, inline <svg> for icons/simple graphics. Both render beautifully.',
  '',
  'INTERACTIVITY — every visualization must be a MINI APP:',
  '- Add control buttons (Randomize, Sort, Filter, Toggle) styled to match the theme.',
  '  Button recipe: background var(--accent), color #fff, border none, padding 8px 20px,',
  '  border-radius 8px, font-weight 600, cursor pointer, transition transform 0.15s.',
  '  Hover: translateY(-1px) + box-shadow. Active: scale(0.97).',
  '- Animate data changes: transition bar heights, morph shapes, fade in/out elements.',
  '  Use CSS transitions on height/width/opacity/transform. Use requestAnimationFrame for canvas.',
  '- Hover effects on data: tooltips showing exact values, highlight on mouseover, cursor pointer.',
  '- Click interactions: click a bar to highlight it, click a slice to isolate it, click headers to sort.',
  '- State management: use plain JS variables or closures. No frameworks needed.',
  '  Keep state minimal: one data array, one render function, event handlers that update + re-render.',
  '',
  'ANTI-SLOP — write code like a craftsman, not a template engine:',
  '- NO generic placeholder text: "Lorem ipsum", "Your Title Here", "Description goes here". Use real or realistic data.',
  '- NO meaningless comments: "// Initialize variables", "// Create element", "// Set styles". Only comment non-obvious logic.',
  '- NO unnecessary wrapper divs. Use semantic HTML: section, article, header, nav, main, footer.',
  '- NO copy-paste patterns with trivial variations. Use loops, arrays, and functions to generate repetitive structures.',
  '- NO bloated CSS: if you write the same property 3+ times, extract it into a class or CSS variable.',
  '- NO lazy color choices: avoid pure #000/#fff, avoid default blue (#0000ff). Use considered colors from a palette.',
  '- NO "display: block; width: 100%;" on block elements (already default). No redundant resets.',
  '- NO over-engineering: skip data fetching wrappers, error boundaries, or config objects for a single-page widget.',
  '  Write the simplest code that creates the richest experience.',
  '- ALWAYS handle edge cases visually: empty states, zero values (don\'t divide by zero), single data points.',
  '- ALWAYS use consistent naming: camelCase for JS, kebab-case for CSS classes, descriptive but concise.',
  '- Aim for the quality level of a polished CodePen or Dribbble shot — something worth sharing.',
  '',
  'BACKEND & GENERAL CODING:',
  '- Write clean, idiomatic code in whatever language the project uses. Match existing conventions.',
  '- Functions should do one thing. Name them for what they return or accomplish, not how.',
  '- Error handling: validate at boundaries (user input, API calls, file I/O). Don\'t defensively code pure functions.',
  '- No premature abstraction. Three similar lines > one clever helper used once.',
  '- Prefer composition over inheritance. Prefer data transforms over mutation.',
  '- When modifying existing code: read it first, understand the patterns, then extend — don\'t rewrite.',
  '- Git commits: atomic, descriptive, one logical change per commit.',
  '- Tests: test behavior not implementation. One assertion per concept. Use realistic fixtures.',
  '',
  'You are still a software engineering assistant. Keep using your tools (Read, Edit, Bash, etc.)',
  'normally. But when presenting information, links, resources, or explanations to the user,',
  'take full advantage of the rich UI. The user expects a polished chat experience, not raw terminal text.',
].join('\n')

// Tools auto-approved via --allowedTools (never trigger the permission card).
// Includes routine internal agent mechanics (Agent, Task, TaskOutput, TodoWrite,
// Notebook) — prompting for these would make UX terrible without adding meaningful
// safety. This is a deliberate CLUI policy choice, not native Claude parity.
// If runtime evidence shows any of these create real user-facing approval moments,
// they should be moved to the hook matcher in permission-server.ts instead.
const SAFE_TOOLS = [
  'Read', 'Glob', 'Grep', 'LS',
  'TodoRead', 'TodoWrite',
  'Agent', 'Task', 'TaskOutput',
  'Notebook',
  'WebSearch', 'WebFetch',
]

// All tools to pre-approve when NO hook server is available (fallback path).
// Includes safe + dangerous tools so nothing is silently denied.
const DEFAULT_ALLOWED_TOOLS = [
  'Bash', 'Edit', 'Write', 'MultiEdit',
  ...SAFE_TOOLS,
]

function log(msg: string): void {
  _log('RunManager', msg)
}

export interface RunHandle {
  runId: string
  sessionId: string | null
  process: ChildProcess
  pid: number | null
  startedAt: number
  /** Ring buffer of last N stderr lines */
  stderrTail: string[]
  /** Ring buffer of last N stdout lines */
  stdoutTail: string[]
  /** Count of tool calls seen during this run */
  toolCallCount: number
  /** Whether any permission_request event was seen during this run */
  sawPermissionRequest: boolean
  /** Permission denials from result event */
  permissionDenials: Array<{ tool_name: string; tool_use_id: string }>
}

/**
 * RunManager: spawns one `claude -p` process per run, parses NDJSON,
 * emits normalized events, handles cancel, and keeps diagnostic ring buffers.
 *
 * Events emitted:
 *  - 'normalized' (runId, NormalizedEvent)
 *  - 'raw' (runId, ClaudeEvent)  — for logging/debugging
 *  - 'exit' (runId, code, signal, sessionId)
 *  - 'error' (runId, Error)
 */
export class RunManager extends EventEmitter {
  private activeRuns = new Map<string, RunHandle>()
  /** Holds recently-finished runs so diagnostics survive past process exit */
  private _finishedRuns = new Map<string, RunHandle>()
  private claudeBinary: string

  constructor() {
    super()
    this.claudeBinary = this._findClaudeBinary()
    log(`Claude binary: ${this.claudeBinary}`)
  }

  private _findClaudeBinary(): string {
    if (IS_WIN) {
      // Windows: check common locations for claude.cmd / claude.exe
      const appData = process.env.APPDATA || ''
      const winCandidates = [
        join(homedir(), '.local', 'bin', 'claude.exe'),
        ...(appData ? [join(appData, 'npm', 'claude.cmd')] : []),
        join(homedir(), '.npm-global', 'claude.cmd'),
        'C:\\Program Files\\nodejs\\claude.cmd',
      ]

      for (const c of winCandidates) {
        try {
          execSync(`if exist "${c}" exit 0`, { stdio: 'ignore', shell: 'cmd.exe' })
          return c
        } catch {}
      }

      // Try `where claude` to find it on PATH
      try {
        const found = execSync('where claude.cmd', { encoding: 'utf-8', env: getCliEnv() }).trim()
        if (found) return found.split('\n')[0].trim()
      } catch {}

      try {
        const found = execSync('where claude', { encoding: 'utf-8', env: getCliEnv() }).trim()
        if (found) return found.split('\n')[0].trim()
      } catch {}

      return 'claude'
    }

    // Unix: check well-known paths then shell lookup
    const candidates = [
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
      join(homedir(), '.npm-global/bin/claude'),
    ]

    for (const c of candidates) {
      try {
        execSync(`test -x "${c}"`, { stdio: 'ignore' })
        return c
      } catch {}
    }

    try {
      return execSync('/bin/zsh -ilc "whence -p claude"', { encoding: 'utf-8', env: getCliEnv() }).trim()
    } catch {}

    try {
      return execSync('/bin/bash -lc "which claude"', { encoding: 'utf-8', env: getCliEnv() }).trim()
    } catch {}

    return 'claude'
  }

  private _getEnv(): NodeJS.ProcessEnv {
    const env = getCliEnv()
    const binDir = dirname(this.claudeBinary)
    if (binDir && binDir !== '.' && env.PATH && !env.PATH.includes(binDir)) {
      env.PATH = `${binDir}${delimiter}${env.PATH}`
    }

    return env
  }

  startRun(requestId: string, options: RunOptions): RunHandle {
    const cwd = options.projectPath === '~' ? homedir() : options.projectPath

    const args: string[] = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode', 'default',
    ]

    if (options.sessionId) {
      args.push('--resume', options.sessionId)
    }
    if (options.model) {
      args.push('--model', options.model)
    }
    if (options.addDirs && options.addDirs.length > 0) {
      for (const dir of options.addDirs) {
        args.push('--add-dir', dir)
      }
    }

    if (options.hookSettingsPath) {
      // CLUI-scoped hook settings: the PreToolUse HTTP hook handles permissions
      // for dangerous tools (Bash, Edit, Write, MultiEdit).
      // Auto-approve safe tools so they don't trigger the permission card.
      args.push('--settings', options.hookSettingsPath)
      const safeAllowed = [
        ...SAFE_TOOLS,
        ...(options.allowedTools || []),
      ]
      args.push('--allowedTools', safeAllowed.join(','))
    } else {
      // Fallback: no hook server available.
      // Pre-approve common tools so they run without being silently denied.
      const allAllowed = [
        ...DEFAULT_ALLOWED_TOOLS,
        ...(options.allowedTools || []),
      ]
      args.push('--allowedTools', allAllowed.join(','))
    }
    if (options.maxTurns) {
      args.push('--max-turns', String(options.maxTurns))
    }
    if (options.maxBudgetUsd) {
      args.push('--max-budget-usd', String(options.maxBudgetUsd))
    }
    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt)
    }
    // Always tell Claude it's inside CLUI (additive, doesn't replace base prompt)
    args.push('--append-system-prompt', CLUI_SYSTEM_HINT)

    if (DEBUG) {
      log(`Starting run ${requestId}: ${this.claudeBinary} ${args.join(' ')}`)
      log(`Prompt: ${options.prompt.substring(0, 200)}`)
    } else {
      log(`Starting run ${requestId}`)
    }

    const child = spawn(this.claudeBinary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      env: this._getEnv(),
      shell: IS_WIN,
    })

    log(`Spawned PID: ${child.pid}`)

    const handle: RunHandle = {
      runId: requestId,
      sessionId: options.sessionId || null,
      process: child,
      pid: child.pid || null,
      startedAt: Date.now(),
      stderrTail: [],
      stdoutTail: [],
      toolCallCount: 0,
      sawPermissionRequest: false,
      permissionDenials: [],
    }

    // ─── stdout → NDJSON parser → normalizer → events ───
    const parser = StreamParser.fromStream(child.stdout!)

    // ─── Widget intercept: capture Write tool calls for .html/.svg files ───
    // When Claude uses Write to create an HTML/SVG file, we inject a synthetic
    // text_chunk with the content as a fenced code block so the renderer's
    // widget detection picks it up and shows an inline preview.
    //
    // Three interception paths (ordered by reliability):
    //  Path A: permission_request — has full tool.input, fires for hook-based perms
    //  Path B: assistant event — has complete tool inputs, fires after response
    //  Path C: filesystem fallback — reads file from disk after result event
    //
    // All paths dedup via injectedWidgets set keyed by file path.
    const injectedWidgets = new Set<string>()
    /** Tracks .html/.svg file paths from Write calls for filesystem fallback */
    const pendingWritePaths: string[] = []

    parser.on('event', (raw: ClaudeEvent) => {
      // Track session ID
      if (raw.type === 'system' && 'subtype' in raw && raw.subtype === 'init') {
        handle.sessionId = (raw as any).session_id
      }

      // Track permission_request events
      if (raw.type === 'permission_request' || (raw.type === 'system' && 'subtype' in raw && (raw as any).subtype === 'permission_request')) {
        handle.sawPermissionRequest = true
        log(`Permission request seen [${requestId}]`)
      }

      // Extract permission_denials from result event
      if (raw.type === 'result') {
        const denials = (raw as any).permission_denials
        if (Array.isArray(denials) && denials.length > 0) {
          handle.permissionDenials = denials.map((d: any) => ({
            tool_name: d.tool_name || '',
            tool_use_id: d.tool_use_id || '',
          }))
          log(`Permission denials [${requestId}]: ${JSON.stringify(handle.permissionDenials)}`)
        }
      }

      // Ring buffer stdout lines (raw JSON for diagnostics)
      this._ringPush(handle.stdoutTail, JSON.stringify(raw).substring(0, 300))

      // Emit raw event for debugging
      this.emit('raw', requestId, raw)

      // ─── Path A: permission_request interception ───
      // Most reliable: the CLI always sends the full tool input in permission_request
      // so the user can review what's being written. We intercept it here.
      if (raw.type === 'permission_request') {
        const tool = (raw as any).tool
        if (tool?.name && tool?.input) {
          const name = String(tool.name)
          if (/^(Write|Edit|write_to_file|create_file)$/i.test(name)) {
            log(`Widget Path A: permission_request for "${name}"`)
            this._tryInjectWidget(requestId, JSON.stringify(tool.input), injectedWidgets, pendingWritePaths)
          }
        }
      }

      // ─── Path B: complete assistant event ───
      // Backup: the assembled assistant event has full tool_use blocks with input.
      // Fires for auto-approved tools that skip the permission_request flow.
      if (raw.type === 'assistant') {
        const msg = (raw as any).message
        if (msg?.content && Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (block.type === 'tool_use' && block.input) {
              const name = block.name || ''
              if (/^(Write|Edit|write_to_file|create_file)$/i.test(name)) {
                log(`Widget Path B: assistant tool_use "${name}"`)
                this._tryInjectWidget(requestId, JSON.stringify(block.input), injectedWidgets, pendingWritePaths)
              }
            }
          }
        }
      }

      // Normalize and emit canonical events
      const normalized = normalize(raw)
      for (const evt of normalized) {
        if (evt.type === 'tool_call') handle.toolCallCount++
        this.emit('normalized', requestId, evt)
      }

      // ─── Path C: filesystem fallback on result event ───
      // Ultimate fallback: after the run completes, check if any tracked .html/.svg
      // files exist on disk and read their content. This catches cases where neither
      // Path A nor Path B had the content (e.g., permission auto-approved, no assistant event input).
      if (raw.type === 'result') {
        log(`Run complete [${requestId}]: sawPermissionRequest=${handle.sawPermissionRequest}, denials=${handle.permissionDenials.length}`)

        // Check filesystem for any .html/.svg files that weren't injected yet
        if (pendingWritePaths.length > 0) {
          const pathsToCheck = pendingWritePaths.filter((p) => !injectedWidgets.has(p))
          if (pathsToCheck.length > 0) {
            log(`Widget Path C: checking ${pathsToCheck.length} files on disk`)
            for (const filePath of pathsToCheck) {
              this._tryReadAndInjectWidget(requestId, filePath, injectedWidgets)
            }
          }
        }

        try { child.stdin?.end() } catch {}
      }
    })

    parser.on('parse-error', (line: string) => {
      log(`Parse error [${requestId}]: ${line.substring(0, 200)}`)
      this._ringPush(handle.stderrTail, `[parse-error] ${line.substring(0, 200)}`)
    })

    // ─── stderr ring buffer ───
    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (data: string) => {
      const lines = data.split('\n').filter((l: string) => l.trim())
      for (const line of lines) {
        this._ringPush(handle.stderrTail, line)
      }
      log(`Stderr [${requestId}]: ${data.trim().substring(0, 500)}`)
    })

    // ─── Process lifecycle ───
    // Snapshot diagnostics BEFORE deleting the handle so callers can still read them.
    child.on('close', (code, signal) => {
      log(`Process closed [${requestId}]: code=${code} signal=${signal}`)
      // Move handle to finished map so getEnrichedError still works after exit
      this._finishedRuns.set(requestId, handle)
      this.activeRuns.delete(requestId)
      this.emit('exit', requestId, code, signal, handle.sessionId)
      // Clean up finished run after a short delay (gives callers time to read diagnostics)
      setTimeout(() => this._finishedRuns.delete(requestId), 5000)
    })

    child.on('error', (err) => {
      log(`Process error [${requestId}]: ${err.message}`)
      this._finishedRuns.set(requestId, handle)
      this.activeRuns.delete(requestId)
      this.emit('error', requestId, err)
      setTimeout(() => this._finishedRuns.delete(requestId), 5000)
    })

    // ─── Write prompt to stdin (stream-json format, keep open) ───
    // Using --input-format stream-json for bidirectional communication.
    // Stdin stays open so follow-up messages can be sent.
    const contentBlocks: Array<Record<string, unknown>> = []

    // Add image content blocks (base64) before text
    if (options.images && options.images.length > 0) {
      for (const img of options.images) {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: img.mediaType, data: img.data },
        })
      }
    }

    contentBlocks.push({ type: 'text', text: options.prompt })

    const userMessage = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: contentBlocks,
      },
    })
    child.stdin!.write(userMessage + '\n')

    this.activeRuns.set(requestId, handle)
    return handle
  }

  /**
   * Write a message to a running process's stdin (for follow-up prompts, etc.)
   */
  writeToStdin(requestId: string, message: object): boolean {
    const handle = this.activeRuns.get(requestId)
    if (!handle) return false
    if (!handle.process.stdin || handle.process.stdin.destroyed) return false

    const json = JSON.stringify(message)
    log(`Writing to stdin [${requestId}]: ${json.substring(0, 200)}`)
    handle.process.stdin.write(json + '\n')
    return true
  }

  /**
   * Cancel a running process.
   * Windows: taskkill /F /T to kill the entire process tree immediately
   *   (SIGINT doesn't propagate through cmd.exe shell wrappers on Windows).
   * Unix: SIGINT first, SIGKILL fallback after 3s.
   */
  cancel(requestId: string): boolean {
    const handle = this.activeRuns.get(requestId)
    if (!handle) return false

    const pid = handle.process.pid
    log(`Cancelling run ${requestId} (pid=${pid})`)

    if (IS_WIN && pid) {
      // Kill the entire process tree — works reliably on Windows
      try {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
      } catch {
        // Process may have already exited
        handle.process.kill('SIGKILL')
      }
    } else {
      handle.process.kill('SIGINT')

      // Fallback: SIGKILL if process hasn't exited after 3s.
      setTimeout(() => {
        if (handle.process.exitCode === null) {
          log(`Force killing run ${requestId} (SIGINT did not terminate)`)
          handle.process.kill('SIGKILL')
        }
      }, 3000)
    }

    return true
  }

  /**
   * Get an enriched error object for a failed run.
   */
  getEnrichedError(requestId: string, exitCode: number | null): EnrichedError {
    const handle = this.activeRuns.get(requestId) || this._finishedRuns.get(requestId)
    return {
      message: `Run failed with exit code ${exitCode}`,
      stderrTail: handle?.stderrTail.slice(-20) || [],
      stdoutTail: handle?.stdoutTail.slice(-20) || [],
      exitCode,
      elapsedMs: handle ? Date.now() - handle.startedAt : 0,
      toolCallCount: handle?.toolCallCount || 0,
      sawPermissionRequest: handle?.sawPermissionRequest || false,
      permissionDenials: handle?.permissionDenials || [],
    }
  }

  isRunning(requestId: string): boolean {
    return this.activeRuns.has(requestId)
  }

  getHandle(requestId: string): RunHandle | undefined {
    return this.activeRuns.get(requestId)
  }

  getActiveRunIds(): string[] {
    return Array.from(this.activeRuns.keys())
  }

  /**
   * Widget intercept: if a Write/Edit tool call targeted an .html/.svg file,
   * inject a synthetic text_chunk with the content as a fenced code block.
   * Deduplicates by file path so the same widget isn't injected twice.
   */
  private _tryInjectWidget(
    requestId: string,
    jsonStr: string,
    injectedWidgets: Set<string>,
    pendingWritePaths: string[],
  ): void {
    try {
      const input = JSON.parse(jsonStr)

      // Handle various field naming conventions across Claude tool schemas
      const filePath: string = input.file_path || input.filePath || input.path || ''
      const content: string = input.content || input.new_string || input.text || ''

      log(`Widget intercept [${requestId}]: parsed input — file="${filePath}", contentLen=${content.length}, keys=${Object.keys(input).join(',')}`)

      if (!filePath) return

      const lower = filePath.toLowerCase()
      let kind: 'html' | 'svg' | null = null
      if (lower.endsWith('.html') || lower.endsWith('.htm')) kind = 'html'
      else if (lower.endsWith('.svg')) kind = 'svg'

      if (!kind) return

      // Track file path for filesystem fallback (even if content is missing now)
      if (!pendingWritePaths.includes(filePath)) {
        pendingWritePaths.push(filePath)
      }

      if (!content || content.length < 80) {
        log(`Widget intercept [${requestId}]: no content or too short — deferring to Path C (filesystem)`)
        return
      }

      // Dedup: skip if already injected for this file path
      if (injectedWidgets.has(filePath)) {
        log(`Widget intercept [${requestId}]: already injected for ${filePath}, skipping`)
        return
      }
      injectedWidgets.add(filePath)

      log(`Widget intercept [${requestId}]: injecting ${kind} widget from ${filePath} (${content.length} chars)`)

      // Emit a synthetic text_chunk with the content as a fenced code block
      const syntheticText = `\n\n\`\`\`${kind}\n${content}\n\`\`\`\n`
      this.emit('normalized', requestId, { type: 'text_chunk', text: syntheticText })
    } catch (err) {
      log(`Widget intercept [${requestId}]: JSON parse failed — ${(err as Error).message?.substring(0, 100)}`)
    }
  }

  /**
   * Filesystem fallback (Path C): read an .html/.svg file from disk and inject it.
   * Called after the run completes for any files that weren't caught by Path A/B.
   */
  private async _tryReadAndInjectWidget(
    requestId: string,
    filePath: string,
    injectedWidgets: Set<string>,
  ): Promise<void> {
    if (injectedWidgets.has(filePath)) return

    const lower = filePath.toLowerCase()
    let kind: 'html' | 'svg' | null = null
    if (lower.endsWith('.html') || lower.endsWith('.htm')) kind = 'html'
    else if (lower.endsWith('.svg')) kind = 'svg'
    if (!kind) return

    try {
      const content = await readFile(filePath, 'utf-8')
      if (content.length < 80) return

      injectedWidgets.add(filePath)
      log(`Widget Path C [${requestId}]: read ${kind} from disk: ${filePath} (${content.length} chars)`)

      const syntheticText = `\n\n\`\`\`${kind}\n${content}\n\`\`\`\n`
      this.emit('normalized', requestId, { type: 'text_chunk', text: syntheticText })
    } catch (err) {
      log(`Widget Path C [${requestId}]: failed to read ${filePath} — ${(err as Error).message?.substring(0, 80)}`)
    }
  }

  private _ringPush(buffer: string[], line: string): void {
    buffer.push(line)
    if (buffer.length > MAX_RING_LINES) {
      buffer.shift()
    }
  }
}
