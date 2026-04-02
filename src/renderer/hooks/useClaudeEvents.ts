import { useEffect, useRef } from 'react'
import { useSessionStore, getModelDisplayLabel } from '../stores/sessionStore'
import { useNotificationStore } from '../stores/notificationStore'
import type { NormalizedEvent } from '../../shared/types'

/**
 * Subscribes to all ControlPlane events via IPC and routes them
 * to the Zustand store.
 *
 * text_chunk events are batched per animation frame to avoid
 * flooding React with one state update per chunk during streaming.
 */
export function useClaudeEvents() {
  const handleNormalizedEvent = useSessionStore((s) => s.handleNormalizedEvent)
  const handleStatusChange = useSessionStore((s) => s.handleStatusChange)
  const handleError = useSessionStore((s) => s.handleError)
  const handleAgentEvent = useSessionStore((s) => s.handleAgentEvent)

  // RAF batching for text_chunk events
  const chunkBufferRef = useRef<Map<string, string>>(new Map())
  const rafIdRef = useRef<number>(0)

  useEffect(() => {
    const flushChunks = () => {
      rafIdRef.current = 0
      const buffer = chunkBufferRef.current
      if (buffer.size === 0) return

      // Flush all accumulated text per tab in one go
      for (const [tabId, text] of buffer) {
        handleNormalizedEvent(tabId, { type: 'text_chunk', text } as NormalizedEvent)
      }
      buffer.clear()
    }

    const unsubEvent = window.clui.onEvent((tabId, event) => {
      if (event.type === 'text_chunk') {
        // Buffer text chunks and flush on next animation frame
        const buffer = chunkBufferRef.current
        const existing = buffer.get(tabId) || ''
        buffer.set(tabId, existing + (event as any).text)

        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(flushChunks)
        }
      } else {
        // task_update and task_complete contain fallback text logic that checks
        // whether any assistant text has already been rendered. If a RAF flush is
        // pending, those checks would see stale state and incorrectly conclude
        // "no text yet" — causing duplicate messages once the RAF fires.
        // Flush synchronously before handling these events so the store sees the
        // correct message state.
        if (
          (event.type === 'task_update' || event.type === 'task_complete') &&
          rafIdRef.current
        ) {
          cancelAnimationFrame(rafIdRef.current)
          flushChunks()
        }
        // Dispatch notifications for key events
        if (event.type === 'task_complete') {
          const e = event as NormalizedEvent & { type: 'task_complete'; costUsd: number; durationMs: number }
          useNotificationStore.getState().addNotification({
            type: 'success',
            message: `Task completed — $${e.costUsd.toFixed(4)} · ${(e.durationMs / 1000).toFixed(1)}s`,
            duration: 5000,
          })
          // Notify about auto-selected model
          const { lastResolvedModel, preferredModel } = useSessionStore.getState()
          if (preferredModel === 'auto' && lastResolvedModel) {
            useNotificationStore.getState().addNotification({
              type: 'model-selected',
              message: `Auto mode selected ${getModelDisplayLabel(lastResolvedModel)}`,
              duration: 6000,
            })
          }
        } else if (event.type === 'error') {
          const e = event as NormalizedEvent & { type: 'error'; message: string }
          useNotificationStore.getState().addNotification({
            type: 'error',
            message: e.message,
            duration: 8000,
          })
        } else if (event.type === 'rate_limit') {
          useNotificationStore.getState().addNotification({
            type: 'warning',
            message: 'Rate limited. Please wait...',
            duration: 10000,
          })
        }

        handleNormalizedEvent(tabId, event)
      }
    })

    const unsubStatus = window.clui.onTabStatusChange((tabId, newStatus, oldStatus) => {
      handleStatusChange(tabId, newStatus, oldStatus)
    })

    const unsubError = window.clui.onError((tabId, error) => {
      handleError(tabId, error)
    })

    const unsubSkill = window.clui.onSkillStatus((status) => {
      if (status.state === 'failed') {
        console.warn(`[CLUI] Skill install failed: ${status.name} — ${status.error}`)
      }
    })

    // Orchestration: per-agent events via dedicated channel
    const unsubAgent = window.clui.onAgentEvent((tabId, agentId, event) => {
      handleAgentEvent(tabId, agentId, event)
    })

    return () => {
      unsubEvent()
      unsubStatus()
      unsubError()
      unsubSkill()
      unsubAgent()
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      chunkBufferRef.current.clear()
    }
  }, [handleNormalizedEvent, handleStatusChange, handleError, handleAgentEvent])

  // Note: window.clui.start() is called via sessionStore.initStaticInfo() in App.tsx.
  // No duplicate call needed here.
}
