import React, { useState, useEffect, useCallback } from 'react'
import { X, ArrowClockwise, Lightning, Plugs, PlugsConnected, Warning, Circle, CaretDown, CaretRight } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'

type McpServer = { name: string; status: string }

const STATUS_DOT: Record<string, { color: string; label: string }> = {
  connected: { color: '#34d399', label: 'Connected' },
  running: { color: '#34d399', label: 'Running' },
  ready: { color: '#34d399', label: 'Ready' },
  failed: { color: '#ef4444', label: 'Failed' },
  error: { color: '#ef4444', label: 'Error' },
  disconnected: { color: '#6b7280', label: 'Disconnected' },
  disabled: { color: '#6b7280', label: 'Disabled' },
}

function getStatusInfo(status: string) {
  return STATUS_DOT[status] || { color: '#fbbf24', label: status || 'Unknown' }
}

function groupServers(servers: McpServer[]) {
  const active: McpServer[] = []
  const inactive: McpServer[] = []
  for (const s of servers) {
    if (s.status === 'connected' || s.status === 'running' || s.status === 'ready') {
      active.push(s)
    } else {
      inactive.push(s)
    }
  }
  return { active, inactive }
}

export function McpPanel({ onClose }: { onClose: () => void }) {
  const colors = useColors()
  const activeTab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  const servers: McpServer[] = activeTab?.sessionMcpServers || []
  const [expandedServer, setExpandedServer] = useState<string | null>(null)
  const [configServers, setConfigServers] = useState<Array<{ name: string; command: string; args: string[]; enabled: boolean }>>([])
  const [loadingConfig, setLoadingConfig] = useState(true)

  // Load MCP config from disk
  useEffect(() => {
    let cancelled = false
    window.clui.mcpListConfig().then((result) => {
      if (!cancelled) {
        setConfigServers(result.servers || [])
        setLoadingConfig(false)
      }
    }).catch(() => {
      if (!cancelled) setLoadingConfig(false)
    })
    return () => { cancelled = true }
  }, [])

  const handleReconnect = useCallback(async (serverName: string) => {
    await window.clui.mcpReconnect(serverName)
  }, [])

  const handleToggle = useCallback(async (serverName: string, enabled: boolean) => {
    await window.clui.mcpToggle(serverName, enabled)
    // Refresh config
    const result = await window.clui.mcpListConfig()
    setConfigServers(result.servers || [])
  }, [])

  const { active, inactive } = groupServers(servers)
  const hasSession = servers.length > 0

  return (
    <div
      data-clui-ui
      style={{
        height: 470,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 18px 12px',
        borderBottom: `1px solid ${colors.containerBorder}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Lightning size={20} weight="fill" style={{ color: colors.accent }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
              MCP Servers
            </div>
            <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 1 }}>
              {servers.length} server{servers.length !== 1 ? 's' : ''} in session
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: colors.textTertiary, padding: 2, display: 'flex',
            borderRadius: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = colors.textPrimary)}
          onMouseLeave={(e) => (e.currentTarget.style.color = colors.textTertiary)}
        >
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', scrollbarWidth: 'thin' }}>
        {!hasSession ? (
          <NoSessionState colors={colors} />
        ) : (
          <>
            {/* Active servers */}
            {active.length > 0 && (
              <ServerGroup
                label="Connected"
                count={active.length}
                servers={active}
                colors={colors}
                expandedServer={expandedServer}
                onToggleExpand={setExpandedServer}
                onReconnect={handleReconnect}
                configServers={configServers}
                onToggle={handleToggle}
              />
            )}

            {/* Inactive servers */}
            {inactive.length > 0 && (
              <ServerGroup
                label="Issues"
                count={inactive.length}
                servers={inactive}
                colors={colors}
                expandedServer={expandedServer}
                onToggleExpand={setExpandedServer}
                onReconnect={handleReconnect}
                configServers={configServers}
                onToggle={handleToggle}
              />
            )}

            {/* Config-only servers not in session */}
            {configServers.length > 0 && (
              <ConfigOnlyServers
                configServers={configServers}
                sessionServers={servers}
                colors={colors}
                onToggle={handleToggle}
              />
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 18px',
        borderTop: `1px solid ${colors.containerBorder}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, color: colors.textTertiary }}>
          MCP servers are configured in ~/.claude.json
        </span>
      </div>
    </div>
  )
}

// ─── Server Group ───

function ServerGroup({
  label, count, servers, colors, expandedServer, onToggleExpand, onReconnect, configServers, onToggle,
}: {
  label: string
  count: number
  servers: McpServer[]
  colors: ReturnType<typeof useColors>
  expandedServer: string | null
  onToggleExpand: (name: string | null) => void
  onReconnect: (name: string) => void
  configServers: Array<{ name: string; command: string; args: string[]; enabled: boolean }>
  onToggle: (name: string, enabled: boolean) => void
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: colors.textTertiary,
        textTransform: 'uppercase', letterSpacing: '0.05em',
        marginBottom: 8,
      }}>
        {label} ({count})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {servers.map((s) => (
          <ServerRow
            key={s.name}
            server={s}
            colors={colors}
            expanded={expandedServer === s.name}
            onToggleExpand={() => onToggleExpand(expandedServer === s.name ? null : s.name)}
            onReconnect={() => onReconnect(s.name)}
            configServer={configServers.find((c) => c.name === s.name)}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Individual Server Row ───

function ServerRow({
  server, colors, expanded, onToggleExpand, onReconnect, configServer, onToggle,
}: {
  server: McpServer
  colors: ReturnType<typeof useColors>
  expanded: boolean
  onToggleExpand: () => void
  onReconnect: () => void
  configServer?: { name: string; command: string; args: string[]; enabled: boolean }
  onToggle: (name: string, enabled: boolean) => void
}) {
  const info = getStatusInfo(server.status)
  const isActive = server.status === 'connected' || server.status === 'running' || server.status === 'ready'
  const [hovering, setHovering] = useState(false)

  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${expanded ? colors.accentBorderMedium : colors.containerBorder}`,
        background: expanded ? colors.accentLight : (hovering ? `${colors.containerBorder}33` : 'transparent'),
        transition: 'all 0.15s ease',
        overflow: 'hidden',
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Main row */}
      <div
        style={{
          display: 'flex', alignItems: 'center', padding: '10px 12px',
          cursor: 'pointer', gap: 10,
        }}
        onClick={onToggleExpand}
      >
        {/* Status dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: info.color,
          boxShadow: isActive ? `0 0 6px ${info.color}80` : 'none',
          flexShrink: 0,
        }} />

        {/* Name + status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: colors.textPrimary,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {server.name}
          </div>
          <div style={{ fontSize: 10, color: info.color, fontWeight: 500, marginTop: 1 }}>
            {info.label}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {!isActive && (
            <button
              onClick={(e) => { e.stopPropagation(); onReconnect() }}
              title="Reconnect"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: colors.textTertiary, padding: 4, display: 'flex',
                borderRadius: 4, transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = colors.accent)}
              onMouseLeave={(e) => (e.currentTarget.style.color = colors.textTertiary)}
            >
              <ArrowClockwise size={13} />
            </button>
          )}
          {expanded ? <CaretDown size={12} style={{ color: colors.textTertiary }} /> : <CaretRight size={12} style={{ color: colors.textTertiary }} />}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{
          padding: '0 12px 12px',
          borderTop: `1px solid ${colors.containerBorder}`,
          marginTop: -2,
          paddingTop: 10,
        }}>
          <div style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 1.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: colors.textTertiary }}>Status</span>
              <span style={{ color: info.color, fontWeight: 500 }}>{info.label}</span>
            </div>
            {configServer && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: colors.textTertiary }}>Command</span>
                  <span style={{
                    fontFamily: 'monospace', fontSize: 10,
                    maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {configServer.command}
                  </span>
                </div>
                {configServer.args.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: colors.textTertiary }}>Args</span>
                    <span style={{
                      fontFamily: 'monospace', fontSize: 10,
                      maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {configServer.args.join(' ')}
                    </span>
                  </div>
                )}
              </>
            )}
            {server.name.startsWith('claude.ai') && (
              <div style={{
                marginTop: 6, padding: '6px 8px', borderRadius: 6,
                background: `${colors.accent}15`, fontSize: 10, color: colors.accent,
              }}>
                Cloud-managed MCP — configured through Claude.ai
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Config-only servers (not in current session) ───

function ConfigOnlyServers({
  configServers, sessionServers, colors, onToggle,
}: {
  configServers: Array<{ name: string; command: string; args: string[]; enabled: boolean }>
  sessionServers: McpServer[]
  colors: ReturnType<typeof useColors>
  onToggle: (name: string, enabled: boolean) => void
}) {
  const sessionNames = new Set(sessionServers.map((s) => s.name))
  const configOnly = configServers.filter((c) => !sessionNames.has(c.name))
  if (configOnly.length === 0) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 600, color: colors.textTertiary,
        textTransform: 'uppercase', letterSpacing: '0.05em',
        marginBottom: 8,
      }}>
        Configured (not in session)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {configOnly.map((c) => (
          <div
            key={c.name}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10,
              border: `1px solid ${colors.containerBorder}`,
            }}
          >
            <Circle size={8} weight="fill" style={{ color: '#6b7280', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: colors.textPrimary,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {c.name}
              </div>
              <div style={{ fontSize: 10, color: colors.textTertiary, marginTop: 1 }}>
                {c.enabled ? 'Enabled — will connect on next session' : 'Disabled'}
              </div>
            </div>
            <ToggleSwitch
              enabled={c.enabled}
              onChange={(val) => onToggle(c.name, val)}
              colors={colors}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Toggle Switch ───

function ToggleSwitch({
  enabled, onChange, colors,
}: {
  enabled: boolean
  onChange: (val: boolean) => void
  colors: ReturnType<typeof useColors>
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(!enabled) }}
      style={{
        width: 32, height: 18, borderRadius: 9, border: 'none',
        background: enabled ? colors.accent : colors.containerBorder,
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s ease',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        background: '#fff',
        position: 'absolute', top: 2,
        left: enabled ? 16 : 2,
        transition: 'left 0.2s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  )
}

// ─── Empty States ───

function NoSessionState({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 12, padding: 20,
    }}>
      <Plugs size={36} weight="light" style={{ color: colors.textTertiary, opacity: 0.5 }} />
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>
        No active session
      </div>
      <div style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
        MCP servers connect when you start a conversation. Send a message to initialize the session.
      </div>
    </div>
  )
}
