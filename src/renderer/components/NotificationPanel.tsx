import React from 'react'
import { motion } from 'framer-motion'
import { X, CheckCircle, WarningCircle, Info, XCircle, Robot, Bell } from '@phosphor-icons/react'
import { useNotificationStore, type Notification } from '../stores/notificationStore'
import { useColors } from '../theme'

const SPRING = { damping: 25, mass: 1, stiffness: 300 }

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

function getIcon(type: Notification['type']) {
  switch (type) {
    case 'success': return <CheckCircle size={16} weight="fill" />
    case 'error': return <XCircle size={16} weight="fill" />
    case 'warning': return <WarningCircle size={16} weight="fill" />
    case 'model-selected': return <Robot size={16} weight="fill" />
    default: return <Info size={16} weight="fill" />
  }
}

function getColor(type: Notification['type'], colors: ReturnType<typeof useColors>) {
  switch (type) {
    case 'success': return '#34d399'
    case 'error': return colors.statusError
    case 'warning': return '#fbbf24'
    case 'model-selected': return colors.accent
    default: return colors.textSecondary
  }
}

interface GroupedNotification {
  /** Representative notification (most recent in group) */
  notification: Notification
  /** All IDs in this group (for bulk dismiss) */
  ids: string[]
  count: number
}

/** Group consecutive notifications with the same type + message */
function groupNotifications(notifications: Notification[]): GroupedNotification[] {
  const groups: GroupedNotification[] = []
  for (const n of notifications) {
    const last = groups[groups.length - 1]
    if (last && last.notification.type === n.type && last.notification.message === n.message) {
      last.ids.push(n.id)
      last.count++
    } else {
      groups.push({ notification: n, ids: [n.id], count: 1 })
    }
  }
  return groups
}

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const notifications = useNotificationStore((s) => s.notifications)
  const removeNotification = useNotificationStore((s) => s.removeNotification)
  const clearNotifications = useNotificationStore((s) => s.clearNotifications)
  const colors = useColors()

  const groups = groupNotifications(notifications)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 10 }}
      transition={{ type: 'spring', ...SPRING }}
      className="flex flex-col overflow-hidden"
      style={{
        maxHeight: 470,
        background: colors.containerBg,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${colors.containerBorder}` }}>
        <span className="text-[13px] font-semibold" style={{ color: colors.textPrimary }}>Notifications</span>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <button
              onClick={clearNotifications}
              className="text-[11px] px-2 py-0.5 rounded-full transition-colors"
              style={{ color: colors.textTertiary, background: colors.surfaceHover }}
            >
              Clear all
            </button>
          )}
          <button onClick={onClose} className="p-0.5 rounded transition-colors" style={{ color: colors.textTertiary }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 420 }}>
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 py-5 text-center">
            <Bell size={20} style={{ color: colors.textMuted, opacity: 0.5 }} />
            <span className="text-[11px]" style={{ color: colors.textTertiary }}>
              No notifications — alerts and events show here
            </span>
          </div>
        ) : (
          groups.map((group, i) => {
            const n = group.notification
            return (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03, type: 'spring', damping: 30, stiffness: 150 }}
                className="flex items-start gap-2.5 px-4 py-2.5 transition-colors"
                style={{ borderBottom: `1px solid ${colors.containerBorder}22` }}
              >
                <span style={{ color: getColor(n.type, colors), marginTop: 1, flexShrink: 0 }}>
                  {getIcon(n.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] leading-[16px]" style={{ color: colors.textPrimary }}>{n.message}</span>
                    {group.count > 1 && (
                      <span
                        className="px-1.5 py-0 rounded-full text-[9px] font-bold shrink-0"
                        style={{ background: `${getColor(n.type, colors)}22`, color: getColor(n.type, colors) }}
                      >
                        ×{group.count}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>{timeAgo(n.timestamp)}</div>
                </div>
                <button
                  onClick={() => group.ids.forEach((id) => removeNotification(id))}
                  className="p-0.5 rounded transition-colors shrink-0"
                  style={{ color: colors.textTertiary, marginTop: 1 }}
                  title={group.count > 1 ? `Dismiss all ${group.count}` : 'Dismiss'}
                >
                  <X size={12} />
                </button>
              </motion.div>
            )
          })
        )}
      </div>
    </motion.div>
  )
}
