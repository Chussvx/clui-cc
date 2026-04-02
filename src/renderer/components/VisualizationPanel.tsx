import React from 'react'
import { X, Play, Image, Trash } from '@phosphor-icons/react'
import { useVisualizationStore } from '../stores/visualizationStore'
import { useColors } from '../theme'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  return `${Math.floor(diff / 3_600_000)}h ago`
}

export function VisualizationPanel({ onClose }: { onClose: () => void }) {
  const widgets = useVisualizationStore((s) => s.widgets)
  const setActiveWidget = useVisualizationStore((s) => s.setActiveWidget)
  const removeWidget = useVisualizationStore((s) => s.removeWidget)
  const clearWidgets = useVisualizationStore((s) => s.clearWidgets)
  const colors = useColors()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 470 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px 10px',
          borderBottom: `1px solid ${colors.containerBorder}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Image size={16} weight="duotone" style={{ color: colors.accent }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
            Visualizations
          </span>
          {widgets.length > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.accent,
                background: colors.accentLight,
                padding: '1px 7px',
                borderRadius: 8,
              }}
            >
              {widgets.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {widgets.length > 0 && (
            <button
              type="button"
              onClick={clearWidgets}
              className="no-drag"
              style={{
                background: 'none',
                border: 'none',
                color: colors.textSecondary,
                cursor: 'pointer',
                fontSize: 11,
                padding: '2px 6px',
              }}
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="no-drag"
            style={{
              background: 'none',
              border: 'none',
              color: colors.textSecondary,
              cursor: 'pointer',
              padding: 2,
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {widgets.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 16px',
              color: colors.textSecondary,
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            <Image size={28} weight="duotone" style={{ opacity: 0.4, marginBottom: 8 }} />
            <div>No visualizations yet</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
              Ask Claude to create an HTML or SVG visualization — it will appear here
            </div>
          </div>
        ) : (
          widgets.map((w) => (
            <div
              key={w.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 10,
                marginBottom: 4,
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onClick={() => setActiveWidget(w.id)}
              onMouseOver={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.background = colors.accentLight
              }}
              onMouseOut={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: colors.accent + '18',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Play size={14} weight="fill" style={{ color: colors.accent }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: colors.textPrimary,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {w.title}
                </div>
                <div style={{ fontSize: 11, color: colors.textSecondary }}>
                  {w.kind.toUpperCase()} · {timeAgo(w.timestamp)}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeWidget(w.id)
                }}
                className="no-drag"
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.textSecondary,
                  cursor: 'pointer',
                  padding: 4,
                  opacity: 0.5,
                }}
              >
                <Trash size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
