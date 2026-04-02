import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Robot, UserCircle, MagnifyingGlass, PencilSimple, Eye, Wrench,
  SpinnerGap, CheckCircle, XCircle, Stop, CaretRight, CaretDown,
} from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'
import type { AgentState, AgentStatus, AgentRole, PermissionRequest } from '../../shared/types'

// ─── Role icons ───

const ROLE_ICONS: Record<AgentRole, React.ReactNode> = {
  orchestrator: <UserCircle size={14} weight="bold" />,
  researcher: <MagnifyingGlass size={14} />,
  implementer: <PencilSimple size={14} />,
  reviewer: <Eye size={14} />,
  worker: <Wrench size={14} />,
  custom: <Robot size={14} />,
}

// ─── Status indicators ───

function StatusBadge({ status }: { status: AgentStatus }) {
  const colors = useColors()

  const config: Record<AgentStatus, { color: string; icon: React.ReactNode; label: string }> = {
    idle: { color: colors.textTertiary, icon: null, label: 'Idle' },
    running: { color: colors.accent, icon: <SpinnerGap size={10} className="animate-spin" />, label: 'Running' },
    completed: { color: colors.statusComplete, icon: <CheckCircle size={10} weight="fill" />, label: 'Done' },
    failed: { color: colors.statusError, icon: <XCircle size={10} weight="fill" />, label: 'Failed' },
    cancelled: { color: colors.textTertiary, icon: <Stop size={10} weight="fill" />, label: 'Cancelled' },
  }

  const c = config[status]

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontSize: 10,
      fontWeight: 500,
      color: c.color,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {c.icon}
      {c.label}
    </span>
  )
}

// ─── Single agent row ───

function AgentRow({ agent, tabId }: { agent: AgentState; tabId: string }) {
  const colors = useColors()
  const orchCancelAgent = useSessionStore((s) => s.orchCancelAgent)
  const orchRespondPermission = useSessionStore((s) => s.orchRespondPermission)
  const [expanded, setExpanded] = useState(false)

  const hasPermissions = agent.permissionQueue.length > 0
  const messageCount = agent.messages.length
  const lastMessage = agent.messages[agent.messages.length - 1]

  return (
    <div style={{
      borderBottom: `1px solid ${colors.containerBorder}`,
    }}>
      {/* Agent header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: colors.textPrimary,
          fontFamily: 'inherit',
          fontSize: 12,
        }}
      >
        {expanded ? <CaretDown size={10} /> : <CaretRight size={10} />}
        <span style={{ color: colors.accent, display: 'flex' }}>
          {ROLE_ICONS[agent.role]}
        </span>
        <span style={{ fontWeight: 600, flex: 1, textAlign: 'left' }}>
          {agent.name}
        </span>
        <StatusBadge status={agent.status} />
        {hasPermissions && (
          <span style={{
            background: '#f59e0b',
            color: '#000',
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 8,
          }}>
            PERM
          </span>
        )}
        {agent.status === 'running' && (
          <button
            onClick={(e) => { e.stopPropagation(); orchCancelAgent(agent.id) }}
            style={{
              background: 'none',
              border: `1px solid ${colors.containerBorder}`,
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 10,
              color: colors.textTertiary,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Stop
          </button>
        )}
      </button>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '4px 12px 10px 32px' }}>
              {/* Activity */}
              {agent.currentActivity && (
                <div style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 4 }}>
                  {agent.currentActivity}
                </div>
              )}

              {/* Cost */}
              {agent.costUsd > 0 && (
                <div style={{ fontSize: 11, color: colors.textTertiary, marginBottom: 4 }}>
                  Cost: ${agent.costUsd.toFixed(4)}
                </div>
              )}

              {/* Permission cards */}
              {agent.permissionQueue.map((perm) => (
                <AgentPermissionCard
                  key={perm.questionId}
                  permission={perm}
                  agentId={agent.id}
                  onRespond={orchRespondPermission}
                />
              ))}

              {/* Recent messages (last 3) */}
              {messageCount > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 10, color: colors.textTertiary, marginBottom: 2 }}>
                    {messageCount} message{messageCount !== 1 ? 's' : ''}
                  </div>
                  {agent.messages.slice(-3).map((msg) => (
                    <div key={msg.id} style={{
                      fontSize: 11,
                      color: msg.role === 'system' ? colors.statusError : colors.textPrimary,
                      padding: '2px 0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}>
                      {msg.role === 'tool' ? `[${msg.toolName}]` : ''}
                      {msg.content.substring(0, 120)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Inline permission card for agents ───

function AgentPermissionCard({
  permission,
  agentId,
  onRespond,
}: {
  permission: PermissionRequest
  agentId: string
  onRespond: (agentId: string, questionId: string, optionId: string) => void
}) {
  const colors = useColors()
  const [responded, setResponded] = useState(false)

  const handleClick = (optionId: string) => {
    if (responded) return
    setResponded(true)
    onRespond(agentId, permission.questionId, optionId)
  }

  return (
    <div style={{
      background: colors.inputBg,
      border: `1px solid ${colors.containerBorder}`,
      borderRadius: 6,
      padding: '6px 10px',
      marginBottom: 4,
      fontSize: 11,
    }}>
      <div style={{ fontWeight: 600, color: colors.textPrimary, marginBottom: 4 }}>
        {permission.toolTitle}
      </div>
      {permission.toolInput && (
        <pre style={{
          fontSize: 10,
          color: colors.textTertiary,
          margin: '0 0 4px 0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: 60,
          overflow: 'hidden',
        }}>
          {typeof permission.toolInput === 'string'
            ? permission.toolInput
            : JSON.stringify(permission.toolInput, null, 2).substring(0, 200)}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 4 }}>
        {permission.options.map((opt) => (
          <button
            key={opt.optionId}
            onClick={() => handleClick(opt.optionId)}
            disabled={responded}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              border: `1px solid ${colors.containerBorder}`,
              background: opt.kind === 'allow' ? colors.accent : 'none',
              color: opt.kind === 'allow' ? '#fff' : colors.textPrimary,
              fontSize: 10,
              cursor: responded ? 'not-allowed' : 'pointer',
              opacity: responded ? 0.5 : 1,
              fontFamily: 'inherit',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Main Panel ───

interface AgentStatusPanelProps {
  tabId: string
  agentStates: Record<string, AgentState>
}

export function AgentStatusPanel({ tabId, agentStates }: AgentStatusPanelProps) {
  const colors = useColors()
  const orchCancelAll = useSessionStore((s) => s.orchCancelAll)
  const agents = Object.values(agentStates)

  if (agents.length === 0) return null

  const runningCount = agents.filter((a) => a.status === 'running').length
  const completedCount = agents.filter((a) => a.status === 'completed').length
  const totalPermissions = agents.reduce((sum, a) => sum + a.permissionQueue.length, 0)

  return (
    <div style={{
      borderBottom: `1px solid ${colors.containerBorder}`,
      background: colors.surfacePrimary,
    }}>
      {/* Panel header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        borderBottom: `1px solid ${colors.containerBorder}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Robot size={14} color={colors.accent} />
          <span style={{ fontSize: 11, fontWeight: 600, color: colors.textPrimary }}>
            Agents
          </span>
          <span style={{ fontSize: 10, color: colors.textTertiary }}>
            {runningCount} running · {completedCount}/{agents.length} done
          </span>
          {totalPermissions > 0 && (
            <span style={{
              background: '#f59e0b',
              color: '#000',
              fontSize: 9,
              fontWeight: 700,
              padding: '1px 5px',
              borderRadius: 8,
            }}>
              {totalPermissions} pending
            </span>
          )}
        </div>
        {runningCount > 0 && (
          <button
            onClick={orchCancelAll}
            style={{
              background: 'none',
              border: `1px solid ${colors.containerBorder}`,
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 10,
              color: colors.textTertiary,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Stop All
          </button>
        )}
      </div>

      {/* Agent rows */}
      {agents.map((agent) => (
        <AgentRow key={agent.id} agent={agent} tabId={tabId} />
      ))}
    </div>
  )
}
