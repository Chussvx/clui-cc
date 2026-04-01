import { create } from 'zustand'

export interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info' | 'model-selected'
  message: string
  timestamp: number
  duration?: number
}

interface NotificationState {
  notifications: Notification[]
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  addNotification: (notification) => {
    const entry: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }
    set((s) => ({ notifications: [entry, ...s.notifications] }))

    // Auto-dismiss after duration
    if (notification.duration) {
      setTimeout(() => {
        set((s) => ({ notifications: s.notifications.filter((n) => n.id !== entry.id) }))
      }, notification.duration)
    }
  },

  removeNotification: (id) => {
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }))
  },

  clearNotifications: () => {
    set({ notifications: [] })
  },
}))

// ─── HMR state persistence ───
if (import.meta.hot) {
  const prev = import.meta.hot.data?.notificationStoreState as NotificationState | undefined
  if (prev) {
    useNotificationStore.setState({ notifications: prev.notifications })
  }
  import.meta.hot.dispose(() => {
    import.meta.hot!.data.notificationStoreState = useNotificationStore.getState()
  })
  import.meta.hot.accept()
}
