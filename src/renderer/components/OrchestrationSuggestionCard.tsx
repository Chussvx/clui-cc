import React from 'react'
import { motion } from 'framer-motion'
import { Lightning, UsersFour, ArrowRight, X, PencilSimple, Robot } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'
import type { OrchestrationProposal, AgentRole } from '../../shared/types'

interface Props {
  proposal: OrchestrationProposal
}

const ROLE_COLORS: Record<string, string> = {
  orchestrator: '#d97757',
  researcher: '#7aac8c',
  implementer: '#6b9bd2',
  reviewer: '#c084cf',
  worker: '#e0a458',
}

const COMPLEXITY_COLORS: Record<string, { bg: string; text: string }> = {
  low: { bg: 'rgba(122, 172, 140, 0.15)', text: '#7aac8c' },
  medium: { bg: 'rgba(224, 164, 88, 0.15)', text: '#e0a458' },
  high: { bg: 'rgba(217, 119, 87, 0.15)', text: '#d97757' },
}

export function OrchestrationSuggestionCard({ proposal }: Props) {
  const orchApproveProposal = useSessionStore((s) => s.orchApproveProposal)
  const orchDismissProposal = useSessionStore((s) => s.orchDismissProposal)
  const colors = useColors()
  const [responded, setResponded] = React.useState(false)

  const handleApprove = () => {
    if (responded) return
    setResponded(true)
    orchApproveProposal()
  }

  const handleSkip = () => {
    if (responded) return
    setResponded(true)
    orchDismissProposal()
  }

  const complexityStyle = COMPLEXITY_COLORS[proposal.complexity] || COMPLEXITY_COLORS.medium

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      className="mx-4 mt-2 mb-2"
      data-clui-ui
    >
      <div
        style={{
          background: colors.containerBg,
          border: `1px solid ${colors.accentSoft}`,
          borderRadius: 12,
          boxShadow: `0 2px 12px rgba(0,0,0,0.08)`,
        }}
        className="overflow-hidden"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-1.5"
          style={{
            background: colors.accentLight,
            borderBottom: `1px solid ${colors.accentSoft}`,
          }}
        >
          <div className="flex items-center gap-1.5">
            <Lightning size={12} weight="fill" style={{ color: colors.accent }} />
            <span className="text-[11px] font-semibold" style={{ color: colors.accent }}>
              Orchestration Suggested
            </span>
          </div>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{
              background: complexityStyle.bg,
              color: complexityStyle.text,
            }}
          >
            {proposal.complexity}
          </span>
        </div>

        <div className="px-3 py-2.5">
          {/* Reasoning */}
          <p className="text-[11px] leading-[1.5] mb-2.5" style={{ color: colors.textSecondary }}>
            {proposal.reasoning}
          </p>

          {/* Agent list */}
          <div className="flex flex-col gap-1.5 mb-3">
            {proposal.agents.map((agent, i) => {
              const roleColor = ROLE_COLORS[agent.role] || colors.textTertiary
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-lg"
                  style={{ background: `${roleColor}10` }}
                >
                  <Robot size={13} weight="duotone" style={{ color: roleColor, marginTop: 1, flexShrink: 0 }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold" style={{ color: colors.textPrimary }}>
                        {agent.name}
                      </span>
                      <span
                        className="text-[9px] font-medium px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                        style={{ color: roleColor, background: `${roleColor}18` }}
                      >
                        {agent.role}
                      </span>
                    </div>
                    <p className="text-[10px] leading-[1.4] mt-0.5" style={{ color: colors.textTertiary }}>
                      {agent.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleApprove}
              disabled={responded}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-3.5 py-1.5 rounded-full transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: colors.accent,
                color: '#fff',
                border: 'none',
              }}
              onMouseEnter={(e) => {
                if (!responded) e.currentTarget.style.opacity = '0.85'
              }}
              onMouseLeave={(e) => {
                if (!responded) e.currentTarget.style.opacity = '1'
              }}
            >
              <UsersFour size={12} weight="bold" />
              Launch Agents
              <ArrowRight size={10} weight="bold" />
            </button>

            <button
              onClick={handleSkip}
              disabled={responded}
              className="text-[11px] font-medium px-3 py-1.5 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'transparent',
                color: colors.textTertiary,
                border: `1px solid ${colors.containerBorder}`,
              }}
              onMouseEnter={(e) => {
                if (!responded) {
                  e.currentTarget.style.background = colors.surfaceHover
                  e.currentTarget.style.color = colors.textSecondary
                }
              }}
              onMouseLeave={(e) => {
                if (!responded) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = colors.textTertiary
                }
              }}
            >
              Skip — use single agent
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
