import React from 'react'
import { motion } from 'framer-motion'
import { X, CurrencyDollar } from '@phosphor-icons/react'
import { useSessionStore, getModelDisplayLabel } from '../stores/sessionStore'
import { useColors } from '../theme'
import type { RunResult } from '../../shared/types'

const SPRING = { damping: 25, mass: 1, stiffness: 300 }

function getModelBadgeColor(modelId: string): string {
  if (modelId.includes('opus')) return '#8b5cf6'
  if (modelId.includes('sonnet')) return '#f59e0b'
  if (modelId.includes('haiku')) return '#10b981'
  return '#6b7280'
}

function RunRow({ run, index, colors }: { run: RunResult; index: number; colors: ReturnType<typeof useColors> }) {
  const cost = `$${run.totalCostUsd.toFixed(4)}`
  const duration = `${(run.durationMs / 1000).toFixed(1)}s`
  const turns = `${run.numTurns} turn${run.numTurns !== 1 ? 's' : ''}`
  const modelLabel = run.model ? getModelDisplayLabel(run.model) : null
  const badgeColor = run.model ? getModelBadgeColor(run.model) : null

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03, type: 'spring', damping: 30, stiffness: 150 }}
      className="flex items-center gap-2 px-4 py-2 text-[11px]"
      style={{ borderBottom: `1px solid ${colors.containerBorder}22` }}
    >
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
        style={{ background: colors.surfaceHover, color: colors.textSecondary }}
      >
        {index + 1}
      </span>
      <span style={{ color: colors.textPrimary, fontWeight: 500, minWidth: 52 }}>{cost}</span>
      <span style={{ color: colors.textTertiary, minWidth: 36 }}>{duration}</span>
      {modelLabel && badgeColor && (
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
          style={{ background: `${badgeColor}20`, color: badgeColor }}
        >
          {modelLabel}
        </span>
      )}
      <span className="ml-auto" style={{ color: colors.textTertiary }}>{turns}</span>
    </motion.div>
  )
}

export function CostDashboardPanel({ onClose }: { onClose: () => void }) {
  const costHistory = useSessionStore((s) => s.costHistory)
  const clearCostHistory = useSessionStore((s) => s.clearCostHistory)
  const colors = useColors()

  const totalCost = costHistory.reduce((sum, r) => sum + r.totalCostUsd, 0)
  const totalInputTokens = costHistory.reduce((sum, r) => sum + (r.usage.input_tokens || 0), 0)
  const totalOutputTokens = costHistory.reduce((sum, r) => sum + (r.usage.output_tokens || 0), 0)
  const avgDuration = costHistory.length > 0
    ? costHistory.reduce((sum, r) => sum + r.durationMs, 0) / costHistory.length / 1000
    : 0

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
        <div className="flex items-center gap-2">
          <CurrencyDollar size={16} style={{ color: colors.accent }} />
          <span className="text-[13px] font-semibold" style={{ color: colors.textPrimary }}>Cost & Usage</span>
        </div>
        <div className="flex items-center gap-2">
          {costHistory.length > 0 && (
            <button
              onClick={clearCostHistory}
              className="text-[11px] px-2 py-0.5 rounded-full transition-colors"
              style={{ color: colors.textTertiary, background: colors.surfaceHover }}
            >
              Clear
            </button>
          )}
          <button onClick={onClose} className="p-0.5 rounded transition-colors" style={{ color: colors.textTertiary }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {costHistory.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-2 text-[11px]" style={{ borderBottom: `1px solid ${colors.containerBorder}44`, background: `${colors.surfaceHover}44` }}>
          <span style={{ color: colors.textPrimary }}>
            <span style={{ fontWeight: 600 }}>${totalCost.toFixed(4)}</span> total
          </span>
          <span style={{ color: colors.textTertiary }}>
            {totalInputTokens.toLocaleString()} in / {totalOutputTokens.toLocaleString()} out
          </span>
          <span style={{ color: colors.textTertiary }}>
            avg {avgDuration.toFixed(1)}s
          </span>
          <span className="ml-auto" style={{ color: colors.textTertiary }}>
            {costHistory.length} run{costHistory.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Run list */}
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 380 }}>
        {costHistory.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-[12px]" style={{ color: colors.textTertiary }}>
            No usage data yet — send a message first
          </div>
        ) : (
          costHistory.map((run, i) => (
            <RunRow key={`${run.sessionId}-${i}`} run={run} index={i} colors={colors} />
          ))
        )}
      </div>
    </motion.div>
  )
}
