import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, WarningCircle, Info, XCircle, Robot } from '@phosphor-icons/react'
import { useNotificationStore, type Notification } from '../stores/notificationStore'
import { useColors } from '../theme'

function getIcon(type: Notification['type']) {
  switch (type) {
    case 'success': return <CheckCircle size={14} weight="fill" />
    case 'error': return <XCircle size={14} weight="fill" />
    case 'warning': return <WarningCircle size={14} weight="fill" />
    case 'model-selected': return <Robot size={14} weight="fill" />
    default: return <Info size={14} weight="fill" />
  }
}

function getColor(type: Notification['type']): string {
  switch (type) {
    case 'success': return '#34d399'
    case 'error': return '#ef4444'
    case 'warning': return '#fbbf24'
    case 'model-selected': return '#6366f1'
    default: return '#94a3b8'
  }
}

const TOAST_DURATION = 4000

export function ToastLayer() {
  const notifications = useNotificationStore((s) => s.notifications)
  const colors = useColors()
  const shownRef = useRef<Set<string>>(new Set())

  // Only show toasts for notifications added *after* mount
  // Track which IDs we've already seen so we only animate new ones
  const toasts = notifications.filter((n) => {
    if (shownRef.current.has(n.id)) return true
    // New notification — check if it's recent (within 500ms)
    if (Date.now() - n.timestamp < 500) {
      shownRef.current.add(n.id)
      return true
    }
    return false
  })

  // Auto-remove from shown set after toast duration
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const n of toasts) {
      const age = Date.now() - n.timestamp
      const remaining = TOAST_DURATION - age
      if (remaining > 0) {
        timers.push(setTimeout(() => {
          shownRef.current.delete(n.id)
        }, remaining))
      } else {
        shownRef.current.delete(n.id)
      }
    }
    return () => timers.forEach(clearTimeout)
  }, [toasts])

  // Only show the 3 most recent toasts
  const visible = toasts
    .filter((n) => Date.now() - n.timestamp < TOAST_DURATION)
    .slice(0, 3)

  if (visible.length === 0) return null

  return (
    <div
      data-clui-ui
      style={{
        position: 'fixed',
        top: 52,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9998,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <AnimatePresence>
        {visible.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px]"
            style={{
              pointerEvents: 'auto',
              background: colors.popoverBg,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow: colors.popoverShadow,
              border: `1px solid ${colors.popoverBorder}`,
              maxWidth: 360,
            }}
          >
            <span style={{ color: getColor(n.type), flexShrink: 0 }}>
              {getIcon(n.type)}
            </span>
            <span style={{ color: colors.textPrimary }}>{n.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
