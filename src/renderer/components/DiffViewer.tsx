import React, { useMemo } from 'react'
import { parseDiff, Diff, Hunk } from 'react-diff-view'
import { diffAsText } from 'unidiff'
import { useColors } from '../theme'

interface DiffViewerProps {
  /** Raw accumulated toolInput JSON string from an Edit tool call */
  toolInput: string
  /** File path being edited (shown in header) */
  filePath?: string
}

interface EditInput {
  file_path?: string
  old_string?: string
  new_string?: string
}

function tryParseEditInput(raw: string): EditInput | null {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && ('old_string' in parsed || 'new_string' in parsed)) {
      return parsed as EditInput
    }
  } catch {
    // Streaming JSON may be incomplete — that's expected
  }
  return null
}

export function DiffViewer({ toolInput, filePath }: DiffViewerProps) {
  const colors = useColors()

  const diffData = useMemo(() => {
    const input = tryParseEditInput(toolInput)
    if (!input || !input.old_string || !input.new_string) return null
    if (input.old_string === input.new_string) return null

    try {
      const fileName = input.file_path || filePath || 'file'
      // Normalize CRLF to LF for consistent diffs
      const oldStr = input.old_string.replace(/\r\n/g, '\n')
      const newStr = input.new_string.replace(/\r\n/g, '\n')

      const diffText = diffAsText(oldStr, newStr, {
        aname: `a/${fileName}`,
        bname: `b/${fileName}`,
        context: 3,
      })

      if (!diffText || !diffText.trim()) return null

      const files = parseDiff(diffText, { nearbySequences: 'zip' })
      return files[0] || null
    } catch {
      return null
    }
  }, [toolInput, filePath])

  if (!diffData) return null

  return (
    <div
      className="rounded-lg overflow-hidden text-[11px] leading-[16px] mt-1.5"
      style={{
        background: `${colors.containerBg}`,
        border: `1px solid ${colors.containerBorder}`,
      }}
    >
      {/* File path header */}
      {(filePath || diffData.newPath) && (
        <div
          className="px-3 py-1.5 text-[10px] font-mono truncate"
          style={{
            color: colors.textTertiary,
            borderBottom: `1px solid ${colors.containerBorder}`,
            background: `${colors.containerBorder}22`,
          }}
        >
          {filePath || diffData.newPath?.replace(/^b\//, '')}
        </div>
      )}
      <div
        className="overflow-x-auto"
        style={
          {
            '--diff-add-bg': colors.diffAddedBg,
            '--diff-del-bg': colors.diffRemovedBg,
            '--diff-text': colors.textPrimary,
            '--diff-gutter': colors.textTertiary,
          } as React.CSSProperties
        }
      >
        <style>{`
          .diff-viewer-clui .diff-line {
            font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
          }
          .diff-viewer-clui .diff-gutter {
            color: var(--diff-gutter);
            padding: 0 8px;
            min-width: 36px;
            text-align: right;
            user-select: none;
            opacity: 0.5;
          }
          .diff-viewer-clui .diff-code {
            color: var(--diff-text);
            padding: 0 12px 0 8px;
            white-space: pre-wrap;
            word-break: break-all;
          }
          .diff-viewer-clui .diff-line-insert {
            background: var(--diff-add-bg);
          }
          .diff-viewer-clui .diff-line-delete {
            background: var(--diff-del-bg);
          }
          .diff-viewer-clui table {
            border-collapse: collapse;
            width: 100%;
          }
          .diff-viewer-clui td {
            vertical-align: top;
          }
        `}</style>
        <div className="diff-viewer-clui">
          <Diff viewType="unified" diffType={diffData.type} hunks={diffData.hunks}>
            {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
          </Diff>
        </div>
      </div>
    </div>
  )
}
