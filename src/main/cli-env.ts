import { execSync } from 'child_process'

const IS_WIN = process.platform === 'win32'
const PATH_SEP = IS_WIN ? ';' : ':'

let cachedPath: string | null = null

function appendPathEntries(target: string[], seen: Set<string>, rawPath: string | undefined): void {
  if (!rawPath) return
  for (const entry of rawPath.split(PATH_SEP)) {
    const p = entry.trim()
    if (!p || seen.has(p)) continue
    seen.add(p)
    target.push(p)
  }
}

export function getCliPath(): string {
  if (cachedPath) return cachedPath

  const ordered: string[] = []
  const seen = new Set<string>()

  // Start from current process PATH.
  appendPathEntries(ordered, seen, process.env.PATH)

  if (IS_WIN) {
    // On Windows, npm global bin and AppData/Roaming/npm are common locations
    const appData = process.env.APPDATA || ''
    if (appData) {
      appendPathEntries(ordered, seen, `${appData}\\npm`)
    }
    // Also check common Node.js install paths
    appendPathEntries(ordered, seen, 'C:\\Program Files\\nodejs')
  } else {
    // Add common binary locations used on macOS (Homebrew + system).
    appendPathEntries(ordered, seen, '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin')

    // Try interactive login shell first so nvm/asdf/etc. PATH hooks are loaded.
    const pathCommands = [
      '/bin/zsh -ilc "echo $PATH"',
      '/bin/zsh -lc "echo $PATH"',
      '/bin/bash -lc "echo $PATH"',
    ]

    for (const cmd of pathCommands) {
      try {
        const discovered = execSync(cmd, { encoding: 'utf-8', timeout: 3000 }).trim()
        appendPathEntries(ordered, seen, discovered)
      } catch {
        // Keep trying fallbacks.
      }
    }
  }

  cachedPath = ordered.join(PATH_SEP)
  return cachedPath
}

export function getCliEnv(extraEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    PATH: getCliPath(),
  }
  delete env.CLAUDECODE
  return env
}

