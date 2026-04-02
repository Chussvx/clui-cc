import { create } from 'zustand'
import type { Widget } from '../../shared/types'

interface VisualizationState {
  /** All widgets extracted from the current conversation */
  widgets: Widget[]
  /** Currently selected widget ID (shown in popup) */
  activeWidgetId: string | null

  addWidget: (widget: Widget) => void
  removeWidget: (id: string) => void
  setActiveWidget: (id: string | null) => void
  clearWidgets: () => void
}

export const useVisualizationStore = create<VisualizationState>((set) => ({
  widgets: [],
  activeWidgetId: null,

  addWidget: (widget) =>
    set((s) => {
      // Deduplicate by messageId + code hash
      if (s.widgets.some((w) => w.messageId === widget.messageId && w.code === widget.code)) {
        return s
      }
      return { widgets: [...s.widgets, widget] }
    }),

  removeWidget: (id) =>
    set((s) => ({
      widgets: s.widgets.filter((w) => w.id !== id),
      activeWidgetId: s.activeWidgetId === id ? null : s.activeWidgetId,
    })),

  setActiveWidget: (id) => set({ activeWidgetId: id }),

  clearWidgets: () => set({ widgets: [], activeWidgetId: null }),
}))
