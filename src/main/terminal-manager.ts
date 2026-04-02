import { EventEmitter } from 'events'
import { homedir } from 'os'
import { getCliEnv } from './cli-env'
import { log as _log } from './logger'

let pty: typeof import('node-pty') | null = null
try {
  pty = require('node-pty')
} catch {}

function log(msg: string): void {
  _log('TerminalManager', msg)
}

interface TermEntry {
  pty: import('node-pty').IPty
  pid: number
}

/**
 * Manages embedded terminal (PTY) sessions for the CLUI terminal panel.
 *
 * Events emitted:
 *  - 'data' (termId, data)
 *  - 'exit' (termId, exitCode)
 */
export class TerminalManager extends EventEmitter {
  private terms = new Map<string, TermEntry>()

  isAvailable(): boolean {
    return pty !== null
  }

  open(termId: string, cols: number, rows: number, cwd?: string): boolean {
    if (!pty) return false
    if (this.terms.has(termId)) return true

    const isWin = process.platform === 'win32'
    const shell = isWin
      ? (process.env.COMSPEC || 'cmd.exe')
      : (process.env.SHELL || '/bin/bash')
    const env = getCliEnv()

    try {
      const ptyProc = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: cwd || homedir(),
        env,
      })

      ptyProc.onData((data: string) => {
        this.emit('data', termId, data)
      })

      ptyProc.onExit(({ exitCode }: { exitCode: number }) => {
        this.terms.delete(termId)
        this.emit('exit', termId, exitCode)
      })

      this.terms.set(termId, { pty: ptyProc, pid: ptyProc.pid })
      log(`Opened terminal ${termId} (PID ${ptyProc.pid})`)
      return true
    } catch (err) {
      log(`Failed to open terminal ${termId}: ${err}`)
      return false
    }
  }

  write(termId: string, data: string): void {
    const term = this.terms.get(termId)
    if (term) {
      try { term.pty.write(data) } catch {}
    }
  }

  resize(termId: string, cols: number, rows: number): void {
    const term = this.terms.get(termId)
    if (term) {
      try { term.pty.resize(cols, rows) } catch {}
    }
  }

  close(termId: string): void {
    const term = this.terms.get(termId)
    if (!term) return
    try { term.pty.kill() } catch {}
    this.terms.delete(termId)
    log(`Closed terminal ${termId}`)
  }

  closeAll(): void {
    for (const [termId] of this.terms) {
      this.close(termId)
    }
  }
}
