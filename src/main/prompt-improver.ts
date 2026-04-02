import { spawn, execSync } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { log as _log } from './logger'
import { getCliEnv } from './cli-env'

function log(msg: string): void {
  _log('prompt-improver', msg)
}

// Reuse RunManager's binary discovery logic by instantiating a lightweight instance.
// This is cached after the first call.
let claudeBinary: string | null = null

function getClaudeBinary(): string {
  if (claudeBinary) return claudeBinary
  claudeBinary = findClaudeBinary()
  return claudeBinary
}

function findClaudeBinary(): string {
  const IS_WIN = process.platform === 'win32'

  if (IS_WIN) {
    const appData = process.env.APPDATA || ''
    const candidates = [
      join(homedir(), '.local', 'bin', 'claude.exe'),
      ...(appData ? [join(appData, 'npm', 'claude.cmd')] : []),
      join(homedir(), '.npm-global', 'claude.cmd'),
    ]
    for (const c of candidates) {
      try {
        execSync(`if exist "${c}" exit 0`, { stdio: 'ignore', shell: 'cmd.exe' })
        return c
      } catch {}
    }
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

  // Unix
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
    return execSync('/bin/bash -lc "which claude"', { encoding: 'utf-8', env: getCliEnv() }).trim()
  } catch {}
  return 'claude'
}

/**
 * Run a one-shot Claude CLI call with a system prompt and user message.
 * Uses `claude -p --output-format text --model haiku` for fast, lightweight responses.
 * No API key needed — uses the same auth as the running Claude Code instance.
 */
function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const binary = getClaudeBinary()
    const args = [
      '-p', userMessage,
      '--output-format', 'text',
      '--model', 'haiku',
      '--system-prompt', systemPrompt,
      '--no-session-persistence',
    ]

    log(`Spawning: ${binary} (prompt length: ${userMessage.length})`)

    // Only use shell: true for .cmd files (required on Windows); .exe works directly
    const needsShell = process.platform === 'win32' && binary.endsWith('.cmd')

    const child = spawn(binary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: getCliEnv(),
      shell: needsShell,
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.setEncoding('utf-8')
    child.stdout?.on('data', (data: string) => { stdout += data })

    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (data: string) => { stderr += data })

    // Safety timeout — reject if CLI hangs for over 30s
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error('Claude CLI timed out after 30s'))
    }, 30000)

    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0 && stdout.trim()) {
        log(`Success (${stdout.length} chars)`)
        resolve(stdout.trim())
      } else {
        const errMsg = stderr.trim() || `Claude CLI exited with code ${code}`
        log(`Error: ${errMsg}`)
        reject(new Error(errMsg))
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      log(`Spawn error: ${err.message}`)
      reject(err)
    })

    // Close stdin immediately — prompt is passed via -p argument
    child.stdin?.end()
  })
}

export async function improvePrompt(prompt: string): Promise<{ improved: string; error: string | null }> {
  try {
    const systemPrompt = `You are a prompt engineering expert. Your job is to improve user prompts to be clearer, more specific, and more effective when sent to an AI coding assistant (Claude Code).

Rules:
- Keep the original intent intact
- Make the prompt more specific and actionable
- Add relevant context clues if missing
- Structure multi-part requests clearly
- Keep it concise — don't add unnecessary verbosity
- Return ONLY the improved prompt text, no explanations or meta-commentary`

    const improved = await callClaude(systemPrompt, `Improve this prompt:\n\n${prompt}`)
    return { improved: improved.trim(), error: null }
  } catch (e: any) {
    return { improved: '', error: e.message }
  }
}

export interface ClarificationQuestion {
  id: string
  question: string
  options: string[]  // last option is always "Other (specify)"
}

export async function generateClarifications(prompt: string): Promise<{ questions: ClarificationQuestion[]; error: string | null }> {
  try {
    const systemPrompt = `You are a prompt engineering expert. Given a user's draft prompt for an AI coding assistant, generate 3-5 clarifying questions that would help make the prompt more specific and effective.

Return a JSON array of objects with this exact structure:
[
  {
    "id": "q1",
    "question": "What framework are you using?",
    "options": ["React", "Vue", "Angular", "Svelte", "Other (specify)"]
  }
]

Rules:
- Each question should have 3-5 options including "Other (specify)" as the last option
- Questions should address ambiguities or missing context in the prompt
- Keep questions concise and relevant
- Return ONLY the JSON array, no other text`

    const raw = await callClaude(systemPrompt, `Draft prompt:\n\n${prompt}`)
    log(`Clarify raw response (${raw.length} chars): ${raw.substring(0, 200)}`)
    // Extract JSON from response (may have markdown fences)
    // Strip markdown code fences first, then find the JSON array
    const stripped = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim()
    const jsonMatch = stripped.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      log(`Failed to find JSON array in: ${stripped.substring(0, 300)}`)
      return { questions: [], error: 'Failed to parse clarification questions' }
    }
    const questions: ClarificationQuestion[] = JSON.parse(jsonMatch[0])
    return { questions, error: null }
  } catch (e: any) {
    return { questions: [], error: e.message }
  }
}

export async function buildClarifiedPrompt(
  originalPrompt: string,
  answers: Array<{ question: string; answer: string }>,
): Promise<{ improved: string; error: string | null }> {
  try {
    const systemPrompt = `You are a prompt engineering expert. Given a user's original prompt and their answers to clarifying questions, synthesize a clear, comprehensive, well-structured prompt for an AI coding assistant.

Rules:
- Incorporate all the clarification answers naturally into the prompt
- Make it specific and actionable
- Structure multi-part requests with clear steps
- Keep it concise but complete
- Return ONLY the final prompt text, no explanations`

    const answersText = answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')
    const userMessage = `Original prompt:\n${originalPrompt}\n\nClarification answers:\n${answersText}`

    const improved = await callClaude(systemPrompt, userMessage)
    return { improved: improved.trim(), error: null }
  } catch (e: any) {
    return { improved: '', error: e.message }
  }
}
