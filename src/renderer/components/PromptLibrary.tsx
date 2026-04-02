import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BookmarkSimple, Trash, Plus, X, MagnifyingGlass } from '@phosphor-icons/react'
import { usePopoverLayer } from './PopoverLayer'
import { useColors, motion as motionPresets } from '../theme'

const STORAGE_KEY = 'clui-prompt-library'
const MAX_PROMPTS = 100

export interface SavedPrompt {
  id: string
  title: string
  body: string
  createdAt: number
}

function loadPrompts(): SavedPrompt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePrompts(prompts: SavedPrompt[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts))
  } catch (e: any) {
    if (e?.name === 'QuotaExceededError') {
      // Drop oldest prompts to make room
      const trimmed = prompts.slice(-Math.floor(prompts.length / 2))
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed)) } catch { /* give up */ }
    }
  }
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (body: string) => void
  anchorRect: DOMRect | null
}

export function PromptLibrary({ open, onClose, onSelect, anchorRect }: Props) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>(loadPrompts)
  const [filter, setFilter] = useState('')
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const colors = useColors()
  const panelRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const portalTarget = usePopoverLayer()

  // Reload from storage whenever we open
  useEffect(() => {
    if (open) {
      setPrompts(loadPrompts())
      setFilter('')
      setAdding(false)
      setSelectedIndex(0)
      setTimeout(() => filterRef.current?.focus(), 50)
    }
  }, [open])

  const filtered = filter.trim()
    ? prompts.filter((p) => {
        const q = filter.toLowerCase()
        return p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q)
      })
    : prompts

  // Clamp selected index
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  const handleAdd = useCallback(() => {
    const title = newTitle.trim()
    const body = newBody.trim()
    if (!title || !body) return
    const prompt: SavedPrompt = { id: crypto.randomUUID(), title, body, createdAt: Date.now() }
    const updated = [...prompts, prompt].slice(-MAX_PROMPTS)
    setPrompts(updated)
    savePrompts(updated)
    setAdding(false)
    setNewTitle('')
    setNewBody('')
  }, [newTitle, newBody, prompts])

  const handleDelete = useCallback((id: string) => {
    const updated = prompts.filter((p) => p.id !== id)
    setPrompts(updated)
    savePrompts(updated)
  }, [prompts])

  const handleSelect = useCallback((p: SavedPrompt) => {
    onSelect(p.body)
    onClose()
  }, [onSelect, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (adding) return
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter' && filtered[selectedIndex]) { e.preventDefault(); handleSelect(filtered[selectedIndex]) }
  }, [adding, filtered, selectedIndex, handleSelect, onClose])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  if (!open || !portalTarget) return null

  // Position above the anchor
  const style: React.CSSProperties = {
    position: 'fixed',
    bottom: anchorRect ? window.innerHeight - anchorRect.top + 8 : 80,
    left: anchorRect ? anchorRect.left : '50%',
    width: anchorRect ? Math.min(anchorRect.width, 420) : 400,
    transform: anchorRect ? undefined : 'translateX(-50%)',
    pointerEvents: 'auto' as const,
  }

  return createPortal(
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={motionPresets.panelSpring}
      style={{
        ...style,
        background: colors.containerBg,
        border: `1px solid ${colors.containerBorder}`,
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: `1px solid ${colors.containerBorder}` }}
      >
        <div className="flex items-center gap-2">
          <BookmarkSimple size={14} style={{ color: colors.accent }} />
          <span className="text-[12px] font-semibold" style={{ color: colors.textPrimary }}>
            Prompt Library
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setAdding(true); setTimeout(() => titleRef.current?.focus(), 50) }}
            className="p-1 rounded transition-colors"
            style={{ color: colors.textTertiary }}
            title="Save new prompt"
          >
            <Plus size={14} />
          </button>
          <button onClick={onClose} className="p-1 rounded transition-colors" style={{ color: colors.textTertiary }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ borderBottom: `1px solid ${colors.containerBorder}`, overflow: 'hidden' }}
          >
            <div className="px-3 py-2 flex flex-col gap-1.5">
              <input
                ref={titleRef}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Title"
                className="bg-transparent outline-none text-[12px] px-2 py-1 rounded"
                style={{ color: colors.textPrimary, border: `1px solid ${colors.containerBorder}` }}
                onKeyDown={(e) => { if (e.key === 'Escape') setAdding(false); if (e.key === 'Enter') e.preventDefault() }}
              />
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Prompt body..."
                rows={3}
                className="bg-transparent outline-none text-[12px] px-2 py-1 rounded resize-none"
                style={{ color: colors.textPrimary, border: `1px solid ${colors.containerBorder}` }}
                onKeyDown={(e) => { if (e.key === 'Escape') setAdding(false) }}
              />
              <div className="flex justify-end gap-1.5 pb-1">
                <button
                  onClick={() => setAdding(false)}
                  className="text-[11px] px-2 py-0.5 rounded transition-colors"
                  style={{ color: colors.textTertiary }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!newTitle.trim() || !newBody.trim()}
                  className="text-[11px] px-2 py-0.5 rounded transition-colors"
                  style={{
                    background: newTitle.trim() && newBody.trim() ? colors.accent : colors.containerBorder,
                    color: newTitle.trim() && newBody.trim() ? colors.textOnAccent : colors.textTertiary,
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search */}
      {prompts.length > 3 && !adding && (
        <div
          className="flex items-center gap-2 px-3 py-1.5"
          style={{ borderBottom: `1px solid ${colors.containerBorder}` }}
        >
          <MagnifyingGlass size={12} style={{ color: colors.textTertiary, flexShrink: 0 }} />
          <input
            ref={filterRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search prompts..."
            className="flex-1 bg-transparent outline-none text-[12px]"
            style={{ color: colors.textPrimary }}
          />
        </div>
      )}

      {/* Prompt list */}
      <div className="max-h-[240px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-[11px]" style={{ color: colors.textTertiary }}>
            {prompts.length === 0 ? 'No saved prompts yet' : 'No matching prompts'}
          </div>
        ) : (
          filtered.map((p, i) => (
            <div
              key={p.id}
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors group"
              style={{
                background: i === selectedIndex ? `${colors.accent}15` : 'transparent',
              }}
              onClick={() => handleSelect(p)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-[12px] truncate"
                  style={{ color: i === selectedIndex ? colors.accent : colors.textPrimary }}
                >
                  {p.title}
                </div>
                <div className="text-[10px] truncate" style={{ color: colors.textTertiary }}>
                  {p.body.slice(0, 80)}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: colors.textTertiary }}
                title="Delete"
              >
                <Trash size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </motion.div>,
    portalTarget,
  )
}
