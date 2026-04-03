# CLUI-CC UI/UX Audit Report

**Date:** 2026-04-03  
**Scope:** Full renderer codebase — components, styling, accessibility, interaction patterns  
**Version:** 0.1.0

---

## 1. Project Overview

CLUI CC is a **desktop Electron app** (frameless window, pill/card UI) that wraps Claude Code with a rich conversational interface. It features:
- Multi-tab chat sessions with Claude Code backend
- Inline widget rendering (HTML/SVG visualizations)
- Marketplace/plugin system
- Terminal panel (xterm.js)
- Multi-agent orchestration mode
- Memory panel, cost dashboard, notifications
- Custom drag system (bypasses `-webkit-app-region` conflicts)
- Glass-surface design language with dark/light themes

**Tech Stack:** React 19, Zustand, Framer Motion, Tailwind CSS v4, Phosphor Icons, xterm.js, react-markdown

---

## 2. Strengths (What's Working Well)

### 2.1 Design System Foundation
- **Well-structured token system** — `theme.ts` defines complete dark/light palettes with ~60 semantic tokens
- **CSS custom properties** synced from JS tokens at runtime — single source of truth
- **Consistent glass-surface aesthetic** — cohesive card/pill visual language
- **Smooth animations** — Framer Motion with custom cubic-bezier easing throughout

### 2.2 Interaction Design
- **Creative stacking buttons** — circle buttons that expand on hover (`.btn-stack`) is a novel, space-efficient pattern
- **Custom window drag** — well-engineered solution for frameless window movement
- **Click-through transparency** — `setIgnoreMouseEvents` toggling for transparent regions is sophisticated
- **Double-click snap-back** — intuitive position reset

### 2.3 Conversation UX
- **Message grouping** — tool calls grouped into collapsible sections
- **Streaming rendering** — real-time text chunks with proper scroll management
- **Permission cards** — inline allow/deny with clear visual hierarchy
- **Pagination** — smart `INITIAL_RENDER_CAP` + lazy loading for long conversations

### 2.4 Theme System
- **Three-mode theming** — system/light/dark with OS change listener
- **Persisted settings** — localStorage with sensible defaults
- **Complete token coverage** — every UI element has semantic color tokens

---

## 3. Critical Issues

### 3.1 Accessibility (WCAG 2.2 Failures)

**Severity: HIGH**

| Issue | Location | Impact |
|-------|----------|--------|
| **No focus indicators** | Global — `outline: none` everywhere, no `focus-visible` styles | Keyboard users cannot see where focus is. WCAG 2.4.7 failure |
| **Missing ARIA roles** | App.tsx panels, TabStrip, ConversationView | Screen readers can't navigate panel structure |
| **No keyboard nav for tabs** | TabStrip.tsx | Can't arrow between tabs, no `role="tablist"` / `role="tab"` |
| **No `aria-live` regions** | ConversationView.tsx | Screen readers miss new messages and status changes |
| **Buttons without labels** | Stack buttons use icon-only with `title` but no `aria-label` | Assistive tech reads "button" with no context |
| **No skip navigation** | App.tsx | No landmark structure, no way to jump to input |
| **Color-only status indicators** | StatusDot relies solely on color | Color-blind users can't distinguish states (WCAG 1.4.1) |
| **No reduced-motion support** | All animations always play | Vestibular disorder users have no opt-out (WCAG 2.3.3) |

### 3.2 Keyboard Navigation Gaps

**Severity: HIGH**

- **Panel switching** — No keyboard shortcut to cycle panels (notifications, cost, memory, MCP)
- **Escape handling** — Inconsistent; some panels close on backdrop click but not on Escape
- **Tab trapping** — When a panel overlay is open, focus can leak behind it
- **Command palette** — Has `onKeyDown` but no `role="listbox"` or `aria-activedescendant`

### 3.3 Error Handling UX

**Severity: MEDIUM**

- **Silent `.catch(() => {})` blocks** — App.tsx lines 40, 63 swallow errors silently
- **No error boundary** — A component crash takes down the entire app
- **No offline/disconnection state** — If Claude Code process dies, recovery path is unclear beyond status dot
- **No retry affordance** — After `session_dead` event, user needs clearer recovery options

---

## 4. UX Improvement Opportunities

### 4.1 Information Architecture

| Area | Current | Recommendation |
|------|---------|----------------|
| **Panel discovery** | Hidden behind tab strip icons | Add tooltips on first use; consider onboarding hint |
| **Stacked buttons** | Hover-expand requires mouse precision | Add keyboard shortcut badges; consider always-visible in expanded UI mode |
| **Cost visibility** | Buried in panel | Show running cost in status bar or tab strip inline |
| **MCP server status** | Panel-only | Surface connection issues as inline toasts |

### 4.2 Input Bar Improvements

- **No multiline visual cue** — The transition from single to multiline (`MULTILINE_ENTER_HEIGHT: 52px`) is abrupt; consider a smooth height animation with a visual "drag to expand" handle
- **Attachment UX** — No drag-and-drop support visible for files; common expectation in 2025+ chat UIs
- **Voice transcription** — Good feature, but no visual waveform or level indicator during recording
- **Slash command discoverability** — Menu exists but first-time users won't know to type `/`

### 4.3 Conversation View

- **No message search** — Can't search within conversation history
- **No message actions** — Can't copy individual messages, edit sent messages, or bookmark important responses
- **Code blocks** — No syntax highlighting (raw `<pre>` without language detection)
- **Long conversations** — Scroll-to-top button exists but no "jump to last user message" or message anchors
- **No empty state** — New tab has no onboarding, tips, or suggested prompts

### 4.4 Visual Design Refinements

- **Fixed widths** — `460px` / `700px` hardcoded; no responsive behavior. On ultra-wide monitors, the narrow pill feels cramped
- **Typography** — Base font is `Noto Sans Lao` with system fallbacks; this is unusual — Lao is a specialized script. Consider making the primary face the system stack and loading Lao only for its unicode range
- **Code font** — No monospace font defined for code blocks; inherits sans-serif
- **Contrast ratios** — `textTertiary: '#76766e'` on `containerBg: '#242422'` yields ~3.4:1, below WCAG AA 4.5:1 minimum for body text
- **Shadow system** — Multiple shadow values defined but inconsistently applied; some surfaces use `glass-surface` class, others have inline shadows

### 4.5 Performance UX

- **No skeleton/shimmer loaders** — Marketplace and history loading show spinners instead of skeleton placeholders
- **No optimistic updates** — Sending a message could show the user bubble immediately before the API call
- **Widget iframe loading** — No loading state for HTML widgets rendering in iframes
- **Large conversation renders** — `INITIAL_RENDER_CAP = 100` is generous; consider virtual scrolling for heavy sessions

---

## 5. Best Practice Recommendations

### 5.1 Accessibility Quick Wins (Effort: Low, Impact: High)

```
1. Add focus-visible styles globally:
   *:focus-visible { outline: 2px solid var(--clui-accent); outline-offset: 2px; border-radius: 4px; }

2. Add aria-label to icon-only buttons (stack buttons, tab close, panel toggles)

3. Add role="tablist" to TabStrip, role="tab" to each tab, role="tabpanel" to content

4. Add aria-live="polite" to ConversationView for new messages

5. Add prefers-reduced-motion media query:
   @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }

6. Add status text alongside StatusDot colors (e.g., "Running", "Idle" as sr-only text)
```

### 5.2 Keyboard Navigation (Effort: Medium, Impact: High)

```
- Cmd/Ctrl+1-9 for tab switching
- Cmd/Ctrl+T for new tab, Cmd/Ctrl+W for close tab
- Cmd/Ctrl+K for command palette (already exists?)
- Escape to close any open panel/overlay
- Tab trapping inside modals/overlays with focus-trap library
- Arrow keys for tab strip navigation
- Cmd/Ctrl+Shift+P for panel cycling
```

### 5.3 Design System Hardening (Effort: Medium, Impact: Medium)

```
- Define a monospace font stack for code: 'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace
- Fix contrast: bump textTertiary to at least #9a9a90 (dark) for 4.5:1 ratio
- Extract shadow scale: shadow-sm, shadow-md, shadow-lg instead of per-component values
- Add semantic spacing scale: gap-xs (4px), gap-sm (8px), gap-md (12px), gap-lg (16px), gap-xl (24px)
- Consider CSS container queries for responsive panel widths instead of hardcoded px
```

### 5.4 Conversation UX Enhancements (Effort: High, Impact: High)

```
1. Empty state with: greeting, suggested prompts, keyboard shortcut cheat sheet
2. Syntax highlighting for code blocks (use shiki or highlight.js with theme-matched colors)
3. Message-level actions: copy markdown, copy code block, retry from this point
4. Inline search (Cmd/Ctrl+F within conversation, not browser find)
5. "Jump to bottom" FAB with unread count badge
6. Drag-and-drop file attachment zone
```

### 5.5 Error Recovery (Effort: Medium, Impact: High)

```
1. Add React Error Boundary at App level with graceful fallback UI
2. Replace silent catch blocks with user-facing toast notifications
3. Add explicit "Reconnect" button when session dies
4. Show connection status in status bar (not just dot color)
5. Auto-retry connection with exponential backoff
```

### 5.6 Performance Patterns (Effort: Medium, Impact: Medium)

```
1. Skeleton loaders for marketplace grid and history list
2. Virtual scrolling for conversations (react-window or virtuoso)
3. Optimistic UI for message sending
4. Lazy-load heavy panels (terminal, marketplace) with React.lazy + Suspense
5. Debounce search inputs in marketplace and command palette
```

---

## 6. Comparison with Best-in-Class Developer Tools

| Dimension | CLUI CC | VS Code | Cursor | Warp | Linear |
|-----------|---------|---------|--------|------|--------|
| Keyboard-first | Partial | Excellent | Excellent | Excellent | Excellent |
| Accessibility | Poor | Good | Fair | Fair | Good |
| Information density | Low (narrow pill) | Adaptive | Adaptive | Medium | Adaptive |
| Animation quality | Good | Minimal | Good | Excellent | Excellent |
| Error recovery | Poor | Excellent | Good | Good | Good |
| Onboarding | None | Extensions | AI-guided | Interactive | Progressive |
| Theme system | Good | Excellent | Good | Good | Good |
| Command palette | Basic | Gold standard | Good | Good | Excellent |

---

## 7. Priority Matrix

| Priority | Category | Items |
|----------|----------|-------|
| **P0 (Do Now)** | Accessibility | Focus indicators, ARIA roles, reduced-motion, contrast fixes |
| **P0** | Stability | Error boundary, replace silent catches |
| **P1 (Next Sprint)** | Keyboard | Tab navigation, Escape handling, keyboard shortcuts |
| **P1** | Conversation | Empty state, code syntax highlighting, message actions |
| **P2 (Soon)** | Design | Monospace font, spacing scale, responsive widths |
| **P2** | Performance | Skeleton loaders, virtual scrolling |
| **P3 (Backlog)** | Polish | Onboarding flow, drag-and-drop files, conversation search |

---

## 8. Summary

CLUI CC has a **distinctive visual identity** and **creative interaction patterns** (glass surfaces, stacking buttons, custom drag). The theme system is well-engineered with proper token architecture.

The critical gaps are:
1. **Accessibility is the #1 priority** — the app is effectively unusable without a mouse. Focus indicators, ARIA roles, and keyboard navigation are baseline requirements, not nice-to-haves.
2. **Error resilience** — silent error swallowing and no error boundary means crashes are opaque.
3. **Contrast ratios** — some text tokens fail WCAG AA, especially tertiary text in dark mode.
4. **No responsive behavior** — fixed pixel widths with no adaptation to screen size.

The app has strong bones. The design token system, animation quality, and component architecture are solid foundations to build upon.
