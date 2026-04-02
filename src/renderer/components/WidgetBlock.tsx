import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import { ArrowsOut, Code, Copy, Check } from '@phosphor-icons/react'
import { useColors, useThemeStore } from '../theme'
import type { Widget } from '../../shared/types'

// ─── Auto-resize script injected into every widget ───
const AUTO_RESIZE_SCRIPT = `
<script>
(function(){
  function post(){
    var h = document.documentElement.scrollHeight || document.body.scrollHeight;
    window.parent.postMessage({type:'clui-widget-resize', height: h}, '*');
  }
  window.addEventListener('load', function(){ setTimeout(post, 50); setTimeout(post, 300); });
  new MutationObserver(post).observe(document.body, {childList:true, subtree:true, attributes:true});
  new ResizeObserver(post).observe(document.body);
})();
</script>`

// ─── Build full HTML document from widget code ───

function buildFullHtml(code: string, kind: 'html' | 'svg', isDark: boolean): string {
  const bg = isDark ? '#1a1a2e' : '#ffffff'
  const fg = isDark ? '#e0e0e0' : '#1a1a2e'
  const accent = isDark ? '#6c63ff' : '#5b54e0'

  const themeVars = `<style>:root{--bg:${bg};--fg:${fg};--accent:${accent};color-scheme:${isDark ? 'dark' : 'light'}}</style>`
  const noScroll = `<style>html,body{overflow:hidden;margin:0;}</style>`

  if (kind === 'svg') {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${themeVars}${noScroll}
<style>
  body { display: flex; align-items: center; justify-content: center;
         background: ${bg}; color: ${fg}; min-height: 100vh; }
  svg { max-width: 100%; height: auto; }
</style></head>
<body>${code}${AUTO_RESIZE_SCRIPT}</body></html>`
  }

  const trimmed = code.trimStart()
  if (/^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    let doc = code
    if (/<head[\s>]/i.test(doc)) {
      doc = doc.replace(/<head([^>]*)>/i, `<head$1>${themeVars}${noScroll}`)
    } else {
      doc = doc.replace(/<html([^>]*)>/i, `<html$1><head>${themeVars}${noScroll}</head>`)
    }
    if (/<\/body>/i.test(doc)) {
      doc = doc.replace(/<\/body>/i, `${AUTO_RESIZE_SCRIPT}</body>`)
    } else {
      doc += AUTO_RESIZE_SCRIPT
    }
    return doc
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">${themeVars}${noScroll}
<style>
  body { padding: 16px; background: var(--bg); color: var(--fg);
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         font-size: 14px; }
</style></head>
<body>${code}${AUTO_RESIZE_SCRIPT}</body></html>`
}

// ─── Register HTML with the custom protocol and get a clui-widget:// URL ───
// Custom protocol gives the iframe its own origin so scripts execute freely
// without inheriting the parent's restrictive CSP.
function useWidgetUrl(html: string): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const htmlRef = useRef(html)

  useEffect(() => {
    htmlRef.current = html
    let cancelled = false
    window.clui.registerWidget(html).then(({ url: newUrl }) => {
      if (!cancelled) setUrl(newUrl)
    })
    return () => { cancelled = true }
  }, [html])

  return url
}

// ─── Seamless inline widget ───

export function InlineWidget({
  widget,
  colors,
}: {
  widget: Widget
  colors: ReturnType<typeof useColors>
}) {
  const isDark = useThemeStore((s) => s.isDark)
  const [showCode, setShowCode] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [iframeHeight, setIframeHeight] = useState(320)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const fullHtml = useMemo(
    () => buildFullHtml(widget.code, widget.kind, isDark),
    [widget.code, widget.kind, isDark],
  )
  const widgetUrl = useWidgetUrl(fullHtml)

  // Listen for resize messages from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'clui-widget-resize' && typeof e.data.height === 'number') {
        if (iframeRef.current && e.source === iframeRef.current.contentWindow) {
          setIframeHeight(Math.max(60, Math.min(e.data.height, 800)))
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const openInWindow = useCallback(() => {
    window.clui.openWidgetWindow(widget.title, fullHtml)
  }, [widget.title, fullHtml])

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(widget.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }, [widget.code])

  return (
    <div
      style={{
        position: 'relative',
        margin: '8px 0',
        borderRadius: 8,
        overflow: 'hidden',
        width: '100%',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Floating toolbar — appears on hover */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          zIndex: 10,
          display: 'flex',
          gap: 2,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s ease',
          pointerEvents: hovered ? 'auto' : 'none',
          background: isDark ? 'rgba(30,30,50,0.85)' : 'rgba(255,255,255,0.9)',
          borderRadius: 6,
          padding: '2px 3px',
          backdropFilter: 'blur(8px)',
          boxShadow: isDark
            ? '0 1px 4px rgba(0,0,0,0.4)'
            : '0 1px 4px rgba(0,0,0,0.12)',
        }}
      >
        <button
          type="button"
          onClick={copyCode}
          className="no-drag"
          title={copied ? 'Copied!' : 'Copy code'}
          style={{
            background: 'none',
            border: 'none',
            color: copied ? '#2ecc71' : (isDark ? '#bbb' : '#666'),
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button
          type="button"
          onClick={() => setShowCode((s) => !s)}
          className="no-drag"
          title={showCode ? 'Hide code' : 'View code'}
          style={{
            background: 'none',
            border: 'none',
            color: showCode ? colors.accent : (isDark ? '#bbb' : '#666'),
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Code size={14} />
        </button>
        <button
          type="button"
          onClick={openInWindow}
          className="no-drag"
          title="Open in window"
          style={{
            background: 'none',
            border: 'none',
            color: isDark ? '#bbb' : '#666',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ArrowsOut size={14} />
        </button>
      </div>

      {/* Custom protocol iframe — own origin, scripts execute freely */}
      {!showCode && widgetUrl && (
        <iframe
          ref={iframeRef}
          src={widgetUrl}
          sandbox="allow-scripts"
          style={{
            width: '100%',
            height: iframeHeight,
            border: 'none',
            display: 'block',
            borderRadius: 8,
            background: isDark ? '#1a1a2e' : '#ffffff',
            overflow: 'hidden',
          }}
          scrolling="no"
          title={widget.title}
        />
      )}

      {/* Code view */}
      {showCode && (
        <pre
          style={{
            margin: 0,
            padding: 12,
            fontSize: 11,
            lineHeight: 1.5,
            color: colors.textSecondary,
            background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.04)',
            borderRadius: 8,
            overflowX: 'auto',
            maxHeight: 400,
            overflowY: 'auto',
          }}
        >
          <code>{widget.code}</code>
        </pre>
      )}
    </div>
  )
}

// ─── WidgetPopup — no longer used ───
export function WidgetPopup() {
  return null
}
