import { useRef, useEffect, useCallback } from 'react'
import { Terminal } from 'xterm'
import 'xterm/css/xterm.css'
import { useColors } from '../theme'

const TERM_ID = 'clui-embedded-terminal'

// Minimal FitAddon (inline to avoid @xterm/addon-fit dependency)
class FitAddon {
  private _terminal: any = null

  activate(terminal: any): void {
    this._terminal = terminal
  }

  dispose(): void {}

  fit(): void {
    const dims = this.proposeDimensions()
    if (!dims || !this._terminal || isNaN(dims.cols) || isNaN(dims.rows)) return
    const core = this._terminal._core
    if (this._terminal.rows !== dims.rows || this._terminal.cols !== dims.cols) {
      core._renderService.clear()
      this._terminal.resize(dims.cols, dims.rows)
    }
  }

  proposeDimensions(): { cols: number; rows: number } | undefined {
    if (!this._terminal?.element?.parentElement) return undefined
    const renderDims = this._terminal._core._renderService.dimensions
    if (renderDims.css.cell.width === 0 || renderDims.css.cell.height === 0) return undefined

    const scrollbarWidth = this._terminal.options.scrollback === 0
      ? 0
      : (this._terminal.options.overviewRuler?.width || 14)

    const parentStyle = window.getComputedStyle(this._terminal.element.parentElement)
    const parentH = parseInt(parentStyle.getPropertyValue('height'))
    const parentW = Math.max(0, parseInt(parentStyle.getPropertyValue('width')))

    const termStyle = window.getComputedStyle(this._terminal.element)
    const pad = {
      top: parseInt(termStyle.getPropertyValue('padding-top')),
      bottom: parseInt(termStyle.getPropertyValue('padding-bottom')),
      right: parseInt(termStyle.getPropertyValue('padding-right')),
      left: parseInt(termStyle.getPropertyValue('padding-left')),
    }

    const availH = parentH - pad.top - pad.bottom
    const availW = parentW - pad.left - pad.right - scrollbarWidth

    return {
      cols: Math.max(2, Math.floor(availW / renderDims.css.cell.width)),
      rows: Math.max(1, Math.floor(availH / renderDims.css.cell.height)),
    }
  }
}

interface TerminalPanelProps {
  cwd?: string
  isDark: boolean
}

export function TerminalPanel({ cwd, isDark }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const openedRef = useRef(false)
  const colors = useColors()

  const fit = useCallback(() => {
    if (!fitRef.current || !termRef.current) return
    try {
      fitRef.current.fit()
      const { cols, rows } = termRef.current
      window.clui.resizeTerminal(TERM_ID, cols, rows)
    } catch {}
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontFamily: '"Cascadia Code", "Consolas", "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      theme: isDark
        ? { background: '#1a1a1a', foreground: '#d4d4d4', cursor: '#d4d4d4', selectionBackground: 'rgba(255,255,255,0.2)' }
        : { background: '#f5f5f5', foreground: '#1a1a1a', cursor: '#1a1a1a', selectionBackground: 'rgba(0,0,0,0.15)' },
      scrollback: 1000,
      allowTransparency: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    termRef.current = term
    fitRef.current = fitAddon

    requestAnimationFrame(() => {
      fitAddon.fit()
      const { cols, rows } = term
      if (!openedRef.current) {
        openedRef.current = true
        window.clui.openTerminal(TERM_ID, cols, rows, cwd)
          .then(({ ok, available }) => {
            if (!available) {
              term.writeln('\r\n\x1b[31mnode-pty is not available.\x1b[0m')
              term.writeln('Run: npm install node-pty && npx @electron/rebuild -f -w node-pty')
              return
            }
            if (!ok) {
              term.writeln('\r\n\x1b[31mFailed to open terminal.\x1b[0m')
            }
          })
          .catch(() => {
            term.writeln('\r\n\x1b[31mFailed to connect to terminal backend.\x1b[0m')
          })
      }
    })

    term.onData((data) => {
      window.clui.writeTerminal(TERM_ID, data)
    })

    const unsubData = window.clui.onTerminalData((termId, data) => {
      if (termId === TERM_ID) term.write(data)
    })

    const unsubExit = window.clui.onTerminalExit((termId) => {
      if (termId === TERM_ID) {
        term.writeln('\r\n\x1b[90m[process exited]\x1b[0m')
        openedRef.current = false
      }
    })

    const ro = new ResizeObserver(() => fit())
    if (containerRef.current) ro.observe(containerRef.current)

    return () => {
      unsubData()
      unsubExit()
      ro.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.theme = isDark
      ? { background: '#1a1a1a', foreground: '#d4d4d4', cursor: '#d4d4d4', selectionBackground: 'rgba(255,255,255,0.2)' }
      : { background: '#f5f5f5', foreground: '#1a1a1a', cursor: '#1a1a1a', selectionBackground: 'rgba(0,0,0,0.15)' }
  }, [isDark])

  return (
    <div
      style={{
        background: isDark ? '#1a1a1a' : '#f5f5f5',
        borderRadius: 18,
        overflow: 'hidden',
        padding: '10px 12px',
        height: 320,
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${colors.containerBorder}`,
        boxShadow: colors.cardShadow,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28ca41' }} />
        </div>
        <span style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', marginLeft: 4 }}>
          terminal
        </span>
      </div>
      <div
        ref={containerRef}
        className="no-drag"
        style={{ flex: 1, minHeight: 0 }}
        onClick={() => termRef.current?.focus()}
      />
    </div>
  )
}
