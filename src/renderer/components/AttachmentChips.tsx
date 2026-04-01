import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, FileText, Image, FileCode, File, FileCss, FileHtml, FileSql } from '@phosphor-icons/react'
import { useColors } from '../theme'
import type { Attachment } from '../../shared/types'

function getFileIcon(mime?: string): React.ReactNode {
  if (!mime) return <File size={14} />
  if (mime.startsWith('image/')) return <Image size={14} />
  if (mime === 'text/html') return <FileHtml size={14} />
  if (mime === 'text/css' || mime === 'text/x-scss' || mime === 'text/x-less') return <FileCss size={14} />
  if (mime === 'text/x-sql') return <FileSql size={14} />
  if (mime.startsWith('text/x-') || mime === 'text/typescript' || mime === 'text/javascript' || mime === 'application/json') return <FileCode size={14} />
  if (mime.startsWith('text/')) return <FileText size={14} />
  return <File size={14} />
}

export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: Attachment[]
  onRemove: (id: string) => void
}) {
  const colors = useColors()

  if (attachments.length === 0) return null

  return (
    <div data-clui-ui className="flex gap-1.5 pb-1" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
      <AnimatePresence mode="popLayout">
        {attachments.map((a) => (
          <motion.div
            key={a.id}
            layout
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.12 }}
            className="flex items-center gap-1.5 group flex-shrink-0"
            style={{
              background: colors.surfacePrimary,
              border: `1px solid ${colors.surfaceSecondary}`,
              borderRadius: 14,
              padding: a.dataUrl ? '3px 8px 3px 3px' : '4px 8px',
              maxWidth: 200,
            }}
          >
            {/* Image preview thumbnail */}
            {a.dataUrl ? (
              <img
                src={a.dataUrl}
                alt={a.name}
                className="rounded-[10px] object-cover flex-shrink-0"
                style={{ width: 24, height: 24 }}
              />
            ) : (
              <span className="flex-shrink-0" style={{ color: colors.textTertiary }}>
                {getFileIcon(a.mimeType)}
              </span>
            )}

            {/* File name */}
            <span
              className="text-[11px] font-medium truncate min-w-0 flex-1"
              style={{ color: colors.textPrimary }}
            >
              {a.name}
            </span>

            {/* Remove button */}
            <button
              onClick={() => onRemove(a.id)}
              className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: colors.textTertiary }}
            >
              <X size={10} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
