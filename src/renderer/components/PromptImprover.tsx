import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkle, ListChecks, ArrowClockwise, ArrowRight, X, SpinnerGap, PencilSimple } from '@phosphor-icons/react'
import { usePopoverLayer } from './PopoverLayer'
import { useColors } from '../theme'

type Mode = 'idle' | 'improving' | 'improved' | 'clarifying-loading' | 'clarifying' | 'building' | 'clarified'

interface ClarificationQuestion {
  id: string
  question: string
  options: string[]
}

interface Props {
  prompt: string
  onReprompt: (improved: string) => void
  anchorRect: DOMRect | null
  visible: boolean
}

export function PromptImprover({ prompt, onReprompt, anchorRect, visible }: Props) {
  const [mode, setMode] = useState<Mode>('idle')
  const [improved, setImproved] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<ClarificationQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({})
  const colors = useColors()
  const portalTarget = usePopoverLayer()
  const panelRef = useRef<HTMLDivElement>(null)

  // Reset when prompt changes or panel hides
  useEffect(() => {
    if (!visible) {
      setMode('idle')
      setImproved('')
      setError(null)
      setQuestions([])
      setAnswers({})
      setCustomInputs({})
    }
  }, [visible])

  const handleImprove = useCallback(async () => {
    setMode('improving')
    setError(null)
    try {
      const result = await window.clui.improvePrompt(prompt)
      if (result.error) {
        setError(result.error)
        setMode('idle')
      } else {
        setImproved(result.improved)
        setMode('improved')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to improve prompt')
      setMode('idle')
    }
  }, [prompt])

  const handleRegenerate = useCallback(async () => {
    setMode('improving')
    setError(null)
    try {
      const result = await window.clui.improvePrompt(prompt)
      if (result.error) {
        setError(result.error)
        setMode('improved')
      } else {
        setImproved(result.improved)
        setMode('improved')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to improve prompt')
      setMode('improved')
    }
  }, [prompt])

  const handleClarify = useCallback(async () => {
    setMode('clarifying-loading')
    setError(null)
    try {
      const result = await window.clui.clarifyPrompt({ action: 'generate', prompt })
      if (result.error) {
        setError(result.error)
        setMode('idle')
      } else {
        setQuestions(result.questions || [])
        setAnswers({})
        setCustomInputs({})
        setMode('clarifying')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to generate questions')
      setMode('idle')
    }
  }, [prompt])

  const handleBuildClarified = useCallback(async () => {
    setMode('building')
    setError(null)
    try {
      const answersList = questions.map((q) => ({
        question: q.question,
        answer: answers[q.id] === '__custom__' ? (customInputs[q.id] || '') : (answers[q.id] || ''),
      }))
      const result = await window.clui.clarifyPrompt({ action: 'build', prompt, answers: answersList })
      if (result.error) {
        setError(result.error)
        setMode('clarifying')
      } else {
        setImproved(result.improved || '')
        setMode('clarified')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to build prompt')
      setMode('clarifying')
    }
  }, [prompt, questions, answers, customInputs])

  const handleRegenerateClarified = useCallback(async () => {
    setMode('building')
    setError(null)
    try {
      const answersList = questions.map((q) => ({
        question: q.question,
        answer: answers[q.id] === '__custom__' ? (customInputs[q.id] || '') : (answers[q.id] || ''),
      }))
      const result = await window.clui.clarifyPrompt({ action: 'build', prompt, answers: answersList })
      if (result.error) {
        setError(result.error)
        setMode('clarified')
      } else {
        setImproved(result.improved || '')
        setMode('clarified')
      }
    } catch (e: any) {
      setError(e.message || 'Failed to rebuild prompt')
      setMode('clarified')
    }
  }, [prompt, questions, answers, customInputs])

  const allAnswered = questions.length > 0 && questions.every((q) => {
    const ans = answers[q.id]
    if (!ans) return false
    if (ans === '__custom__') return (customInputs[q.id] || '').trim().length > 0
    return true
  })

  if (!visible || !portalTarget || !anchorRect) return null

  // Position: float above the input bar, aligned to left edge
  const panelLeft = anchorRect.left
  const panelBottom = window.innerHeight - anchorRect.top + 8
  const panelMaxWidth = anchorRect.width

  // Trigger buttons (idle state)
  if (mode === 'idle') {
    return createPortal(
      <div
        data-clui-ui
        style={{
          position: 'fixed',
          left: panelLeft,
          bottom: panelBottom,
          display: 'flex',
          flexDirection: 'row',
          gap: 6,
          pointerEvents: 'auto',
        }}
      >
        <motion.button
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleImprove}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors"
          style={{
            background: colors.containerBg,
            border: `1px solid ${colors.containerBorder}`,
            color: colors.accent,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}
          title="Improve prompt with AI"
        >
          <Sparkle size={12} weight="fill" />
          Improve
        </motion.button>
        <motion.button
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, delay: 0.05 }}
          onClick={handleClarify}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors"
          style={{
            background: colors.containerBg,
            border: `1px solid ${colors.containerBorder}`,
            color: colors.textSecondary,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}
          title="Clarify prompt with guided questions"
        >
          <ListChecks size={12} />
          Clarify
        </motion.button>
        {error && (
          <div className="text-[10px] px-2 max-w-[200px]" style={{ color: colors.statusError }}>
            {error}
          </div>
        )}
      </div>,
      portalTarget,
    )
  }

  // Loading states
  if (mode === 'improving' || mode === 'clarifying-loading' || mode === 'building') {
    return createPortal(
      <div
        data-clui-ui
        style={{
          position: 'fixed',
          left: panelLeft,
          bottom: panelBottom,
          pointerEvents: 'auto',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="flex items-center gap-2 px-4 py-3 rounded-2xl"
          style={{
            background: colors.containerBg,
            border: `1px solid ${colors.containerBorder}`,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          <SpinnerGap size={14} className="animate-spin" style={{ color: colors.accent }} />
          <span className="text-[11px]" style={{ color: colors.textSecondary }}>
            {mode === 'improving' ? 'Improving prompt...' : mode === 'building' ? 'Building prompt...' : 'Generating questions...'}
          </span>
        </motion.div>
      </div>,
      portalTarget,
    )
  }

  // Result panel (improved / clarified)
  if (mode === 'improved' || mode === 'clarified') {
    return createPortal(
      <div
        ref={panelRef}
        data-clui-ui
        style={{
          position: 'fixed',
          left: panelLeft,
          bottom: panelBottom,
          width: Math.min(panelMaxWidth, 400),
          maxHeight: anchorRect.top - 16,
          pointerEvents: 'auto',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.1, 1] }}
          className="rounded-2xl overflow-hidden"
          style={{
            background: colors.containerBg,
            border: `1px solid ${colors.containerBorder}`,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{ borderBottom: `1px solid ${colors.containerBorder}` }}
          >
            <div className="flex items-center gap-1.5">
              <Sparkle size={12} weight="fill" style={{ color: colors.accent }} />
              <span className="text-[11px] font-semibold" style={{ color: colors.textPrimary }}>
                {mode === 'improved' ? 'Improved Prompt' : 'Generated Prompt'}
              </span>
            </div>
            <button
              onClick={() => setMode('idle')}
              className="p-0.5 rounded transition-colors"
              style={{ color: colors.textTertiary }}
            >
              <X size={12} />
            </button>
          </div>

          {/* Improved text */}
          <div
            className="px-3 py-2 text-[12px] leading-relaxed overflow-y-auto conversation-selectable"
            style={{ color: colors.textPrimary, maxHeight: 280 }}
          >
            {improved}
          </div>

          {/* Action buttons */}
          <div
            className="flex items-center justify-end gap-1.5 px-3 py-2"
            style={{ borderTop: `1px solid ${colors.containerBorder}` }}
          >
            <button
              onClick={mode === 'improved' ? handleRegenerate : handleRegenerateClarified}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors"
              style={{
                background: colors.surfaceHover,
                color: colors.textSecondary,
              }}
              title="Generate another version"
            >
              <ArrowClockwise size={10} />
              Regenerate
            </button>
            <button
              onClick={() => { onReprompt(improved); setMode('idle') }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors"
              style={{
                background: colors.accent,
                color: colors.textOnAccent,
              }}
              title="Use this prompt"
            >
              <ArrowRight size={10} weight="bold" />
              Reprompt
            </button>
          </div>

          {error && (
            <div className="px-3 pb-2 text-[10px]" style={{ color: colors.statusError }}>
              {error}
            </div>
          )}
        </motion.div>
      </div>,
      portalTarget,
    )
  }

  // Clarification mode — multi-choice questions
  if (mode === 'clarifying') {
    return createPortal(
      <div
        ref={panelRef}
        data-clui-ui
        style={{
          position: 'fixed',
          left: panelLeft,
          bottom: panelBottom,
          width: Math.min(panelMaxWidth, 440),
          maxHeight: anchorRect.top - 16,
          pointerEvents: 'auto',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.1, 1] }}
          className="rounded-2xl overflow-hidden flex flex-col"
          style={{
            maxHeight: anchorRect.top - 16,
            background: colors.containerBg,
            border: `1px solid ${colors.containerBorder}`,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2 flex-shrink-0"
            style={{ borderBottom: `1px solid ${colors.containerBorder}` }}
          >
            <div className="flex items-center gap-1.5">
              <ListChecks size={12} style={{ color: colors.accent }} />
              <span className="text-[11px] font-semibold" style={{ color: colors.textPrimary }}>
                Clarify Your Prompt
              </span>
            </div>
            <button
              onClick={() => setMode('idle')}
              className="p-0.5 rounded transition-colors"
              style={{ color: colors.textTertiary }}
            >
              <X size={12} />
            </button>
          </div>

          {/* Questions */}
          <div className="overflow-y-auto flex-1" style={{ maxHeight: 'calc(100% - 80px)' }}>
            {questions.map((q, qi) => (
              <div key={q.id} className="px-3 py-2" style={{ borderBottom: qi < questions.length - 1 ? `1px solid ${colors.containerBorder}` : undefined }}>
                <div className="text-[11px] font-medium mb-1.5" style={{ color: colors.textPrimary }}>
                  {q.question}
                </div>
                <div className="flex flex-wrap gap-1">
                  {q.options.map((opt) => {
                    const isOther = opt.toLowerCase().includes('other')
                    const optKey = isOther ? '__custom__' : opt
                    const isSelected = answers[q.id] === optKey
                    return (
                      <button
                        key={opt}
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: optKey }))}
                        className="px-2 py-0.5 rounded-full text-[10px] transition-colors"
                        style={{
                          background: isSelected ? `${colors.accent}20` : colors.surfaceHover,
                          color: isSelected ? colors.accent : colors.textSecondary,
                          border: isSelected ? `1px solid ${colors.accent}40` : `1px solid transparent`,
                        }}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
                {/* Custom input when "Other" is selected */}
                <AnimatePresence>
                  {answers[q.id] === '__custom__' && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.12 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <PencilSimple size={10} style={{ color: colors.textTertiary, flexShrink: 0 }} />
                        <input
                          type="text"
                          value={customInputs[q.id] || ''}
                          onChange={(e) => setCustomInputs((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          placeholder="Type your answer..."
                          className="flex-1 bg-transparent outline-none text-[11px] px-2 py-1 rounded"
                          style={{
                            color: colors.textPrimary,
                            border: `1px solid ${colors.containerBorder}`,
                          }}
                          autoFocus
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {/* Confirm button */}
          <div
            className="flex items-center justify-end px-3 py-2 flex-shrink-0"
            style={{ borderTop: `1px solid ${colors.containerBorder}` }}
          >
            <button
              onClick={handleBuildClarified}
              disabled={!allAnswered}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors"
              style={{
                background: allAnswered ? colors.accent : colors.surfaceHover,
                color: allAnswered ? colors.textOnAccent : colors.textTertiary,
                cursor: allAnswered ? 'pointer' : 'not-allowed',
              }}
              title="Generate prompt from answers"
            >
              <Sparkle size={11} weight="fill" />
              Generate Prompt
            </button>
          </div>

          {error && (
            <div className="px-3 pb-2 text-[10px]" style={{ color: colors.statusError }}>
              {error}
            </div>
          )}
        </motion.div>
      </div>,
      portalTarget,
    )
  }

  return null
}
