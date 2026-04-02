import React, { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Robot, UserCircle, MagnifyingGlass, PencilSimple, Eye, Wrench } from '@phosphor-icons/react'
import { useColors } from '../theme'
import type { AgentDefinition, AgentRole } from '../../shared/types'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (agents: AgentDefinition[]) => void
}

const ROLE_OPTIONS: { value: AgentRole; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'orchestrator', label: 'Orchestrator', icon: <UserCircle size={16} />, description: 'Coordinates other agents' },
  { value: 'researcher', label: 'Researcher', icon: <MagnifyingGlass size={16} />, description: 'Read-only analysis' },
  { value: 'implementer', label: 'Implementer', icon: <PencilSimple size={16} />, description: 'Writes code changes' },
  { value: 'reviewer', label: 'Reviewer', icon: <Eye size={16} />, description: 'Read-only code review' },
  { value: 'worker', label: 'Worker', icon: <Wrench size={16} />, description: 'General-purpose agent' },
]

function makeAgent(role: AgentRole = 'worker'): AgentDefinition {
  return {
    id: crypto.randomUUID(),
    role,
    name: role.charAt(0).toUpperCase() + role.slice(1),
  }
}

export function AgentConfigModal({ open, onClose, onConfirm }: Props) {
  const colors = useColors()
  const [agents, setAgents] = useState<AgentDefinition[]>([
    makeAgent('orchestrator'),
    makeAgent('researcher'),
    makeAgent('implementer'),
  ])

  const addAgent = useCallback(() => {
    setAgents((prev) => [...prev, makeAgent('worker')])
  }, [])

  const removeAgent = useCallback((id: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const updateAgent = useCallback((id: string, updates: Partial<AgentDefinition>) => {
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)))
  }, [])

  const handleConfirm = () => {
    if (agents.length === 0) return
    onConfirm(agents)
  }

  const orchestratorCount = agents.filter((a) => a.role === 'orchestrator').length
  const isValid = agents.length >= 2 && orchestratorCount === 1

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520,
              maxHeight: '80vh',
              background: colors.surfacePrimary,
              border: `1px solid ${colors.containerBorder}`,
              borderRadius: 12,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: `1px solid ${colors.containerBorder}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Robot size={18} weight="bold" color={colors.accent} />
                <span style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>
                  Configure Agents
                </span>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: colors.textTertiary,
                  padding: 4,
                  borderRadius: 4,
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Agent List */}
            <div style={{ padding: '12px 20px', overflowY: 'auto', flex: 1 }}>
              {agents.map((agent, idx) => (
                <div
                  key={agent.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 0',
                    borderBottom: idx < agents.length - 1 ? `1px solid ${colors.containerBorder}` : undefined,
                  }}
                >
                  {/* Name */}
                  <input
                    value={agent.name}
                    onChange={(e) => updateAgent(agent.id, { name: e.target.value })}
                    style={{
                      flex: 1,
                      background: colors.inputBg,
                      border: `1px solid ${colors.containerBorder}`,
                      borderRadius: 6,
                      padding: '6px 10px',
                      fontSize: 13,
                      color: colors.textPrimary,
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                    placeholder="Agent name"
                  />

                  {/* Role select */}
                  <select
                    value={agent.role}
                    onChange={(e) => updateAgent(agent.id, { role: e.target.value as AgentRole })}
                    style={{
                      background: colors.inputBg,
                      border: `1px solid ${colors.containerBorder}`,
                      borderRadius: 6,
                      padding: '6px 8px',
                      fontSize: 12,
                      color: colors.textPrimary,
                      outline: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>

                  {/* Remove */}
                  <button
                    onClick={() => removeAgent(agent.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: colors.textTertiary,
                      padding: 4,
                      borderRadius: 4,
                      opacity: agents.length <= 2 ? 0.3 : 1,
                    }}
                    disabled={agents.length <= 2}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}

              {/* Add agent button */}
              <button
                onClick={addAgent}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  padding: '6px 12px',
                  background: 'none',
                  border: `1px dashed ${colors.containerBorder}`,
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: colors.textTertiary,
                  fontSize: 12,
                  fontFamily: 'inherit',
                  width: '100%',
                  justifyContent: 'center',
                }}
              >
                <Plus size={12} />
                Add Agent
              </button>

              {/* Validation message */}
              {!isValid && agents.length > 0 && (
                <div style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: colors.statusError,
                }}>
                  {orchestratorCount === 0 && 'One agent must have the Orchestrator role.'}
                  {orchestratorCount > 1 && 'Only one Orchestrator is allowed.'}
                  {agents.length < 2 && 'At least 2 agents are required.'}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              borderTop: `1px solid ${colors.containerBorder}`,
            }}>
              <button
                onClick={onClose}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  border: `1px solid ${colors.containerBorder}`,
                  background: 'none',
                  color: colors.textPrimary,
                  fontSize: 12,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!isValid}
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: isValid ? colors.accent : colors.containerBorder,
                  color: isValid ? '#fff' : colors.textTertiary,
                  fontSize: 12,
                  cursor: isValid ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                }}
              >
                Start Orchestration
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
