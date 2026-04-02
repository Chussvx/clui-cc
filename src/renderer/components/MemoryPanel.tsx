import React, { useState, useEffect, useCallback } from 'react'
import { X, Trash, PencilSimple, Brain, FileText, FloppyDisk, Tag, ArrowLeft } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'
import type { MemoryEntry, MemoryListResult } from '../../shared/types'

const TYPE_COLORS: Record<string, string> = {
  user: '#3b82f6',
  feedback: '#f59e0b',
  project: '#10b981',
  reference: '#8b5cf6',
  unknown: '#6b7280',
}

const TYPE_LABELS: Record<string, string> = {
  user: 'User',
  feedback: 'Feedback',
  project: 'Project',
  reference: 'Reference',
  unknown: 'Other',
}

export function MemoryPanel({ onClose }: { onClose: () => void }) {
  const colors = useColors()
  const activeTab = useSessionStore(
    (s) => s.tabs.find((t) => t.id === s.activeTabId),
  )
  const staticInfo = useSessionStore((s) => s.staticInfo)
  const projectPath = activeTab?.hasChosenDirectory
    ? activeTab.workingDirectory
    : (staticInfo?.homePath || activeTab?.workingDirectory || '~')

  const [data, setData] = useState<MemoryListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'edit-memory' | 'view-claude'>('list')
  const [editingMemory, setEditingMemory] = useState<MemoryEntry | null>(null)
  const [editContent, setEditContent] = useState('')
  const [viewingClaudeMd, setViewingClaudeMd] = useState<{ label: string; content: string; path: string } | null>(null)
  const [filter, setFilter] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.clui.memoryList(projectPath)
      setData(result)
    } catch {
      setData(null)
    }
    setLoading(false)
  }, [projectPath])

  useEffect(() => { void loadData() }, [loadData])

  const handleDelete = async (mem: MemoryEntry) => {
    await window.clui.memoryDelete(projectPath, mem.filename)
    void loadData()
  }

  const handleEdit = (mem: MemoryEntry) => {
    setEditingMemory(mem)
    // Reconstruct full file content from parsed fields
    const fullContent = [
      '---',
      `name: ${mem.name}`,
      `description: ${mem.description}`,
      `type: ${mem.memoryType}`,
      '---',
      '',
      mem.body,
    ].join('\n')
    setEditContent(fullContent)
    setView('edit-memory')
  }

  const handleSave = async () => {
    if (!editingMemory) return
    await window.clui.memoryWrite(projectPath, editingMemory.filename, editContent)
    setView('list')
    setEditingMemory(null)
    void loadData()
  }

  const handleViewClaudeMd = (file: { label: string; content: string; path: string }) => {
    setViewingClaudeMd(file)
    setView('view-claude')
  }

  const memories = data?.memories || []
  const filteredMemories = filter ? memories.filter((m) => m.memoryType === filter) : memories

  // ─── Edit/View detail screens ───
  if (view === 'edit-memory' && editingMemory) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 470 }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px 10px', borderBottom: `1px solid ${colors.containerBorder}`, flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={() => setView('list')} className="no-drag"
              style={{ background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 2 }}>
              <ArrowLeft size={14} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
              Edit: {editingMemory.name}
            </span>
          </div>
          <button type="button" onClick={handleSave} className="no-drag"
            style={{
              background: colors.accent, border: 'none', color: '#fff', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
            <FloppyDisk size={12} /> Save
          </button>
        </div>
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1, margin: 12, padding: 12, borderRadius: 10,
            background: colors.surfacePrimary, color: colors.textPrimary,
            border: `1px solid ${colors.containerBorder}`,
            fontSize: 12, fontFamily: 'monospace', lineHeight: 1.5,
            resize: 'none', outline: 'none',
          }}
        />
      </div>
    )
  }

  if (view === 'view-claude' && viewingClaudeMd) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 470 }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px 10px', borderBottom: `1px solid ${colors.containerBorder}`, flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" onClick={() => setView('list')} className="no-drag"
              style={{ background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 2 }}>
              <ArrowLeft size={14} />
            </button>
            <FileText size={14} weight="duotone" style={{ color: colors.accent }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>
              {viewingClaudeMd.label}
            </span>
          </div>
          <button type="button" onClick={() => setView('list')} className="no-drag"
            style={{ background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 2 }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          <pre style={{
            fontSize: 11, lineHeight: 1.6, color: colors.textSecondary,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
            fontFamily: 'monospace',
          }}>
            {viewingClaudeMd.content || '(empty)'}
          </pre>
        </div>
      </div>
    )
  }

  // ─── Main list view ───
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: 470 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px 10px', borderBottom: `1px solid ${colors.containerBorder}`, flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Brain size={16} weight="duotone" style={{ color: colors.accent }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary }}>Memory</span>
          {memories.length > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: colors.accent,
              background: colors.accentLight, padding: '1px 7px', borderRadius: 8,
            }}>
              {memories.length}
            </span>
          )}
        </div>
        <button type="button" onClick={onClose} className="no-drag"
          style={{ background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: colors.textSecondary, fontSize: 12 }}>
            Loading...
          </div>
        ) : (
          <>
            {/* CLAUDE.md section */}
            {data && data.claudeMdFiles.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 6px' }}>
                  Instructions
                </div>
                {data.claudeMdFiles.map((file) => (
                  <div
                    key={file.path}
                    onClick={() => handleViewClaudeMd(file)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                      borderRadius: 10, cursor: 'pointer', transition: 'background 0.12s',
                    }}
                    onMouseOver={(e) => { (e.currentTarget as HTMLDivElement).style.background = colors.accentLight }}
                    onMouseOut={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: colors.accent + '18',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <FileText size={14} weight="fill" style={{ color: colors.accent }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>{file.label}</div>
                      <div style={{ fontSize: 11, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.content.substring(0, 60).replace(/\n/g, ' ') || '(empty)'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Memory type filter chips */}
            {memories.length > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '4px 6px', marginBottom: 8 }}>
                <button type="button" onClick={() => setFilter(null)} className="no-drag"
                  style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                    border: `1px solid ${!filter ? colors.accent : colors.containerBorder}`,
                    background: !filter ? colors.accentLight : 'transparent',
                    color: !filter ? colors.accent : colors.textTertiary,
                    cursor: 'pointer',
                  }}>
                  All
                </button>
                {Object.entries(TYPE_LABELS).filter(([key]) => memories.some((m) => m.memoryType === key)).map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setFilter(key)} className="no-drag"
                    style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                      border: `1px solid ${filter === key ? TYPE_COLORS[key] : colors.containerBorder}`,
                      background: filter === key ? TYPE_COLORS[key] + '20' : 'transparent',
                      color: filter === key ? TYPE_COLORS[key] : colors.textTertiary,
                      cursor: 'pointer',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Memory section header */}
            {memories.length > 0 && (
              <div style={{ fontSize: 10, fontWeight: 700, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 6px' }}>
                Memories
              </div>
            )}

            {/* Memory entries */}
            {filteredMemories.length === 0 && memories.length === 0 && (data?.claudeMdFiles.length || 0) === 0 && (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: colors.textSecondary, fontSize: 12, lineHeight: 1.6 }}>
                <Brain size={28} weight="duotone" style={{ opacity: 0.4, marginBottom: 8 }} />
                <div>No memories yet</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                  Claude will save memories as you chat — preferences, feedback, and project context
                </div>
              </div>
            )}

            {filteredMemories.map((mem) => (
              <div
                key={mem.filename}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px',
                  borderRadius: 10, marginBottom: 2, transition: 'background 0.12s',
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLDivElement).style.background = colors.accentLight }}
                onMouseOut={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0, marginTop: 1,
                  background: (TYPE_COLORS[mem.memoryType] || TYPE_COLORS.unknown) + '18',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Tag size={13} weight="fill" style={{ color: TYPE_COLORS[mem.memoryType] || TYPE_COLORS.unknown }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: colors.textPrimary }}>{mem.name}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                      color: TYPE_COLORS[mem.memoryType] || TYPE_COLORS.unknown,
                      opacity: 0.8,
                    }}>
                      {TYPE_LABELS[mem.memoryType] || 'Other'}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 11, color: colors.textSecondary, marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                    lineHeight: 1.4,
                  }}>
                    {mem.description || mem.body.substring(0, 100)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginTop: 2 }}>
                  <button type="button" onClick={() => handleEdit(mem)} className="no-drag"
                    style={{ background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 4, opacity: 0.5 }}>
                    <PencilSimple size={12} />
                  </button>
                  <button type="button" onClick={() => handleDelete(mem)} className="no-drag"
                    style={{ background: 'none', border: 'none', color: colors.textSecondary, cursor: 'pointer', padding: 4, opacity: 0.5 }}>
                    <Trash size={12} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
