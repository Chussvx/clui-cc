import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MagnifyingGlass, Trash, ArrowCounterClockwise, Gear, Moon, Sun,
  FolderOpen, ClockCounterClockwise, Robot,
} from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors, useThemeStore, motion as motionPresets } from '../theme'

interface CommandAction {
  id: string
  label: string
  shortcut?: string
  icon: React.ReactNode
  action: () => void
  keywords: string[]
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const colors = useColors()

  const clearTab = useSessionStore((s) => s.clearTab)
  const togglePlanMode = useSessionStore((s) => s.togglePlanMode)
  const planMode = useSessionStore((s) => s.planMode)
  const togglePanel = useSessionStore((s) => s.togglePanel)
  const isDark = useThemeStore((s) => s.isDark)
  const setThemeMode = useThemeStore((s) => s.setThemeMode)
  const toggleMarketplace = useSessionStore((s) => s.toggleMarketplace)

  const actions: CommandAction[] = useMemo(() => [
    {
      id: 'clear',
      label: 'Clear conversation',
      icon: <Trash size={16} />,
      action: () => { clearTab(); onClose() },
      keywords: ['clear', 'reset', 'clean', 'new'],
    },
    {
      id: 'plan-mode',
      label: planMode ? 'Disable plan mode' : 'Enable plan mode',
      icon: <Robot size={16} />,
      action: () => { togglePlanMode(); onClose() },
      keywords: ['plan', 'mode', 'think', 'architect'],
    },
    {
      id: 'toggle-theme',
      label: isDark ? 'Switch to light theme' : 'Switch to dark theme',
      icon: isDark ? <Sun size={16} /> : <Moon size={16} />,
      action: () => { setThemeMode(isDark ? 'light' : 'dark'); onClose() },
      keywords: ['theme', 'dark', 'light', 'mode', 'appearance'],
    },
    {
      id: 'cost',
      label: 'Show cost dashboard',
      shortcut: '$',
      icon: <Gear size={16} />,
      action: () => { togglePanel('cost'); onClose() },
      keywords: ['cost', 'usage', 'tokens', 'money', 'billing'],
    },
    {
      id: 'history',
      label: 'Browse session history',
      icon: <ClockCounterClockwise size={16} />,
      action: () => { togglePanel('prompts'); onClose() },
      keywords: ['history', 'sessions', 'previous', 'past', 'resume'],
    },
    {
      id: 'marketplace',
      label: 'Open marketplace',
      icon: <FolderOpen size={16} />,
      action: () => { toggleMarketplace(); onClose() },
      keywords: ['marketplace', 'plugins', 'skills', 'extensions', 'install'],
    },
    {
      id: 'notifications',
      label: 'Show notifications',
      icon: <ArrowCounterClockwise size={16} />,
      action: () => { togglePanel('notifications'); onClose() },
      keywords: ['notifications', 'alerts', 'bell'],
    },
  ], [clearTab, onClose, planMode, togglePlanMode, isDark, setThemeMode, togglePanel, toggleMarketplace])

  const filtered = useMemo(() => {
    if (!query.trim()) return actions
    const q = query.toLowerCase()
    return actions.filter((a) =>
      a.label.toLowerCase().includes(q) ||
      a.keywords.some((k) => k.includes(q))
    )
  }, [query, actions])

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Clamp selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      filtered[selectedIndex].action()
    }
  }, [filtered, selectedIndex, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={motionPresets.panelSpring}
            className="fixed z-50 left-1/2 top-[80px] -translate-x-1/2 w-[400px] rounded-xl overflow-hidden shadow-2xl"
            style={{
              background: colors.containerBg,
              border: `1px solid ${colors.containerBorder}`,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
            onKeyDown={handleKeyDown}
          >
            {/* Search input */}
            <div
              className="flex items-center gap-2 px-3 py-2.5"
              style={{ borderBottom: `1px solid ${colors.containerBorder}` }}
            >
              <MagnifyingGlass size={14} style={{ color: colors.textTertiary, flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command..."
                className="flex-1 bg-transparent outline-none text-[13px]"
                style={{ color: colors.textPrimary }}
              />
              <kbd
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: colors.containerBorder, color: colors.textTertiary }}
              >
                ESC
              </kbd>
            </div>

            {/* Action list */}
            <div className="py-1 max-h-[300px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-[12px]" style={{ color: colors.textTertiary }}>
                  No matching commands
                </div>
              ) : (
                filtered.map((action, i) => (
                  <button
                    key={action.id}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
                    style={{
                      background: i === selectedIndex ? `${colors.accent}15` : 'transparent',
                      color: i === selectedIndex ? colors.accent : colors.textSecondary,
                    }}
                    onClick={action.action}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <span className="shrink-0" style={{ opacity: 0.7 }}>{action.icon}</span>
                    <span className="text-[13px] flex-1">{action.label}</span>
                    {action.shortcut && (
                      <kbd
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: colors.containerBorder, color: colors.textTertiary }}
                      >
                        {action.shortcut}
                      </kbd>
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
