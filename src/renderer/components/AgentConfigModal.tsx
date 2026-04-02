import React, { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Robot, UserCircle, MagnifyingGlass, PencilSimple, Eye, Wrench, CaretDown } from '@phosphor-icons/react'
import { usePopoverLayer } from './PopoverLayer'
import { useColors } from '../theme'
import type { AgentDefinition, AgentRole } from '../../shared/types'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: (agents: AgentDefinition[]) => void
  anchorRect: DOMRect | null
}

const ROLE_OPTIONS: { value: AgentRole; label: string; icon: React.ReactElement; desc: string }[] = [
  { value: 'orchestrator', label: 'Orchestrator', icon: <UserCircle size={13} weight="bold" />, desc: 'Coordinates' },
  { value: 'researcher', label: 'Researcher', icon: <MagnifyingGlass size={13} weight="bold" />, desc: 'Read-only' },
  { value: 'implementer', label: 'Implementer', icon: <PencilSimple size={13} weight="bold" />, desc: 'Writes code' },
  { value: 'reviewer', label: 'Reviewer', icon: <Eye size={13} weight="bold" />, desc: 'Reviews' },
  { value: 'worker', label: 'Worker', icon: <Wrench size={13} weight="bold" />, desc: 'General' },
]

function roleIcon(role: AgentRole): React.ReactElement {
  return ROLE_OPTIONS.find((r) => r.value === role)?.icon ?? <Wrench size={13} />
}

function makeAgent(role: AgentRole = 'worker'): AgentDefinition {
  return {
    id: crypto.randomUUID(),
    role,
    name: role.charAt(0).toUpperCase() + role.slice(1),
  }
}

export function AgentConfigModal({ open, onClose, onConfirm, anchorRect }: Props) {
  const colors = useColors()
  const popoverLayer = usePopoverLayer()
  const panelRef = useRef<HTMLDivElement>(null)
  const [agents, setAgents] = useState<AgentDefinition[]>([
    makeAgent('orchestrator'),
    makeAgent('researcher'),
    makeAgent('implementer'),
  ])
  // Track which agent row has its role picker open
  const [rolePickerFor, setRolePickerFor] = useState<string | null>(null)

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

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid the opening click
    const timer = setTimeout(() => document.addEventListener('mousedown', handle), 10)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handle)
    }
  }, [open, onClose])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [open, onClose])

  const orchestratorCount = agents.filter((a) => a.role === 'orchestrator').length
  const isValid = agents.length >= 2 && orchestratorCount === 1

  if (!popoverLayer || !anchorRect) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          data-clui-ui
          ref={panelRef}
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.15, ease: [0.4, 0, 0.1, 1] }}
          style={{
            position: 'fixed',
            bottom: window.innerHeight - anchorRect.top + 6,
            left: anchorRect.left,
            width: Math.min(400, anchorRect.width),
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              background: colors.popoverBg,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: `1px solid ${colors.popoverBorder}`,
              borderRadius: 14,
              boxShadow: colors.popoverShadow,
              overflow: 'hidden',
            }}
          >
            {/* Header — compact */}
            <div style={{
              padding: '10px 14px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Robot size={14} weight="bold" color={colors.accent} />
                <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary, letterSpacing: '0.01em' }}>
                  Agents
                </span>
                <span style={{ fontSize: 11, color: colors.textTertiary, fontWeight: 400 }}>
                  {agents.length} configured
                </span>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: colors.textTertiary,
                  padding: 2,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={13} />
              </button>
            </div>

            {/* Agent rows */}
            <div style={{ padding: '0 6px 4px', maxHeight: 240, overflowY: 'auto' }}>
              {agents.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  colors={colors}
                  onUpdate={(updates) => updateAgent(agent.id, updates)}
                  onRemove={() => removeAgent(agent.id)}
                  canRemove={agents.length > 2}
                  rolePickerOpen={rolePickerFor === agent.id}
                  onToggleRolePicker={() => setRolePickerFor(rolePickerFor === agent.id ? null : agent.id)}
                  onCloseRolePicker={() => setRolePickerFor(null)}
                />
              ))}

              {/* Add agent */}
              <button
                onClick={addAgent}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  margin: '2px 8px 4px',
                  padding: '5px 10px',
                  background: 'none',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: colors.textTertiary,
                  fontSize: 11,
                  fontFamily: 'inherit',
                  width: 'calc(100% - 16px)',
                  transition: 'color 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = colors.accent }}
                onMouseLeave={(e) => { e.currentTarget.style.color = colors.textTertiary }}
              >
                <Plus size={11} weight="bold" />
                Add agent
              </button>
            </div>

            {/* Validation + action row */}
            <div style={{
              padding: '6px 14px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: `1px solid ${colors.popoverBorder}`,
            }}>
              <div style={{ fontSize: 10, color: colors.statusError, minHeight: 14 }}>
                {!isValid && orchestratorCount === 0 && 'Need one Orchestrator'}
                {!isValid && orchestratorCount > 1 && 'Only one Orchestrator allowed'}
                {!isValid && agents.length < 2 && orchestratorCount === 1 && 'Need at least 2 agents'}
              </div>
              <button
                onClick={handleConfirm}
                disabled={!isValid}
                style={{
                  padding: '5px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: isValid ? colors.accent : colors.surfaceHover,
                  color: isValid ? '#fff' : colors.textTertiary,
                  fontSize: 11,
                  cursor: isValid ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  transition: 'background 0.15s, opacity 0.15s',
                  opacity: isValid ? 1 : 0.5,
                }}
              >
                Start
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    popoverLayer,
  )
}

/* ── Agent Row ─────────────────────────────────────── */

interface AgentRowProps {
  agent: AgentDefinition
  colors: ReturnType<typeof useColors>
  onUpdate: (updates: Partial<AgentDefinition>) => void
  onRemove: () => void
  canRemove: boolean
  rolePickerOpen: boolean
  onToggleRolePicker: () => void
  onCloseRolePicker: () => void
}

function AgentRow({ agent, colors, onUpdate, onRemove, canRemove, rolePickerOpen, onToggleRolePicker, onCloseRolePicker }: AgentRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const [nameEditing, setNameEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on edit
  useEffect(() => {
    if (nameEditing) inputRef.current?.focus()
  }, [nameEditing])

  const roleOpt = ROLE_OPTIONS.find((r) => r.value === agent.role)!

  return (
    <div
      ref={rowRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 8,
        position: 'relative',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = colors.surfaceHover }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Role icon + picker trigger */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={onToggleRolePicker}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '4px 6px',
            background: colors.surfaceHover,
            border: `1px solid ${rolePickerOpen ? colors.accent : 'transparent'}`,
            borderRadius: 6,
            cursor: 'pointer',
            color: colors.accent,
            fontSize: 11,
            fontFamily: 'inherit',
            transition: 'border-color 0.1s',
          }}
          title={`Role: ${roleOpt.label}`}
        >
          {roleIcon(agent.role)}
          <CaretDown size={9} weight="bold" style={{ opacity: 0.5 }} />
        </button>

        {/* Inline role picker dropdown */}
        <AnimatePresence>
          {rolePickerOpen && (
            <motion.div
              data-clui-ui
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.1 }}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 2,
                zIndex: 10,
                background: colors.popoverBg,
                backdropFilter: 'blur(16px)',
                border: `1px solid ${colors.popoverBorder}`,
                borderRadius: 8,
                boxShadow: colors.popoverShadow,
                overflow: 'hidden',
                minWidth: 140,
              }}
            >
              {ROLE_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => {
                    onUpdate({ role: r.value, name: agent.name === roleOpt.label ? r.label : agent.name })
                    onCloseRolePicker()
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '5px 10px',
                    background: r.value === agent.role ? colors.accentLight : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: r.value === agent.role ? colors.accent : colors.textPrimary,
                    fontSize: 11,
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { if (r.value !== agent.role) e.currentTarget.style.background = colors.surfaceHover }}
                  onMouseLeave={(e) => { if (r.value !== agent.role) e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ color: r.value === agent.role ? colors.accent : colors.textTertiary, display: 'flex' }}>
                    {r.icon}
                  </span>
                  <span>{r.label}</span>
                  <span style={{ color: colors.textTertiary, marginLeft: 'auto', fontSize: 10 }}>{r.desc}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Name — inline editable */}
      {nameEditing ? (
        <input
          ref={inputRef}
          value={agent.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          onBlur={() => setNameEditing(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setNameEditing(false) }}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            borderBottom: `1px solid ${colors.accent}`,
            padding: '2px 0',
            fontSize: 12,
            color: colors.textPrimary,
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      ) : (
        <span
          onClick={() => setNameEditing(true)}
          style={{
            flex: 1,
            fontSize: 12,
            color: colors.textPrimary,
            cursor: 'text',
            padding: '2px 0',
            borderBottom: '1px solid transparent',
            transition: 'border-color 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = colors.containerBorder }}
          onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = 'transparent' }}
          title="Click to rename"
        >
          {agent.name}
        </span>
      )}

      {/* Role label (subtle) */}
      <span style={{ fontSize: 10, color: colors.textTertiary, whiteSpace: 'nowrap' }}>
        {roleOpt.label}
      </span>

      {/* Remove */}
      <button
        onClick={onRemove}
        style={{
          background: 'none',
          border: 'none',
          cursor: canRemove ? 'pointer' : 'not-allowed',
          color: colors.textTertiary,
          padding: 2,
          borderRadius: 4,
          opacity: canRemove ? 0.4 : 0.15,
          transition: 'opacity 0.1s',
          display: 'flex',
          alignItems: 'center',
        }}
        disabled={!canRemove}
        onMouseEnter={(e) => { if (canRemove) e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { if (canRemove) e.currentTarget.style.opacity = '0.4' }}
      >
        <X size={12} />
      </button>
    </div>
  )
}
