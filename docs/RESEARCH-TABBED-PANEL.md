# UX Patterns for Unified Tabbed Panel Popover — 460px Electron App

**Researched:** 2026-04-02
**Domain:** UI/UX patterns for tabbed floating panels, narrow-width Electron applications
**Confidence:** HIGH (patterns verified across multiple design systems and libraries)

## Summary

A unified tabbed panel popover is a consolidation pattern that replaces 3+ separate floating panels with a single popover containing horizontal tabs. This research investigates whether the pattern is suitable for your 460px Electron app constraints, what the standard implementation looks like, and critical gotchas specific to narrow widths and Electron environments.

**Key Finding:** Tabbed popovers ARE standard in modern tooling (VS Code, Slack). However, for narrow widths (460px), **separate expandable panels or accordions often outperform unified tabs** — tabs compress label space and require wider horizontal real estate. A hybrid approach (toggle button + single tabbed popover) works well when screen real estate is critical.

**Primary Recommendation:** Build a tabbed popover with Floating UI for positioning, Headless UI for accessible tabs, and Zustand for state. But validate early whether your users actually benefit from the unification — the current model (3 separate buttons) may be faster to use in narrow widths.

---

## 1. Tabbed Popover Patterns (vs Separate Panels)

### Standard Industry Patterns

**VS Code (Floating Windows, v1.85+):**
- Uses multiple floating windows (not a single tabbed popover)
- User can drag tabs into floating windows via context menu
- Each window is independent; no unified tabbed view
- **Implication:** Even VS Code doesn't unify floating panels into a single tabbed UI — suggests separate panels may be the "standard" for floating contexts

**Slack & Discord:**
- Slack: Sidebar panels (not popovers) use collapsible sections, not tabs
- Discord: Separate collapsible sidebars; many users request tabbed alternatives
- **Pattern:** Unified tabbed design is NOT the current standard in chat/messaging apps — separate, discoverable panels are preferred

### Tabbed Popovers — When They Work Best

Tabs excel in these scenarios:
1. **Screen real estate abundant** (1200px+) — tab labels are visible, no scrolling
2. **Content doesn't need comparison** — users view one section at a time
3. **Mental model clear** — users understand tabs group related content
4. **Horizontal space more precious than vertical** — good for sidebars, not popovers

Tabs struggle in:
1. **Narrow widths (< 600px)** — tab labels truncate or disappear
2. **Many tabs (> 5)** — require scrollable tab bars or dropdown
3. **Content needs side-by-side comparison** — separate panels better
4. **Users switch between sections frequently** — tabs add cognitive load

### For 460px Electron App: Tab Bar Space Analysis

Tab layout in 460px width:
- Available width: 460px
- Padding/margins: ~16px left/right = 428px usable
- 3 tabs with labels: "MCP Dashboard", "Cost Dashboard", "Notifications"
  - Each label + padding ~120-140px
  - **Result:** Labels truncate or require tiny font (< 12px)
- Without labels: Just icons + active indicator
  - Each icon ~40px with spacing = ~140px total (viable)
  - But: Low discoverability without labels or tooltips

**Verdict:** Icon-only tabs (with tooltips) are viable at 460px, but provide worse discoverability than the current 3-button approach.

---

## 2. StatusBar Icon Design & Notification Badges

### Recommended Icon (Phosphor Library)

For a unified "dashboard/panels" icon, best candidates:

| Icon Name | Use Case | Why It Works |
|-----------|----------|-------------|
| **gauge** | Emphasizes monitoring/metrics (good for "dashboard" concept) | Clear association with dashboards, cost monitoring |
| **sliders** | Emphasizes controls/settings (good for "configuration" concept) | Works if you reframe as "panel controls" |
| **chart-line** | Emphasizes data/visualization (good for metrics) | Clean, recognizable |
| **squares-four** | Grid/panels metaphor (literal "panels") | Modern, abstract — good if users understand metaphor |

**Primary recommendation:** Use `gauge` icon — it immediately signals "dashboard/monitoring" and works well at 28x28px (StatusBar height).

### Notification Badge Implementation

Standard pattern (Material Design 3, PatternFly):
- Dot badge: `bg-red-500 w-2 h-2 rounded-full` positioned absolute top-right
  - Simple, no visual clutter
  - Works at any width
  - Used by: Gmail, Slack, Discord
  
- Counter badge: `text-xs font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full`
  - Shows unread count
  - More visual weight
  - Works when count < 99

**Implementation strategy:**
```typescript
// In Zustand store: compute badge visibility
const hasPendingNotifications = useStore(
  (state) => state.notifications.length > 0 ||
             state.mcpErrors.length > 0 ||
             state.costAlerts.length > 0
);

// Render badge conditionally
{hasPendingNotifications && (
  <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />
)}
```

### Hover Preview / Tooltip

Standard patterns:
- **Tooltip** (not popup): Show icon + count on hover, 2-3 lines max
  - Example: `Dashboard` + `3 alerts`
  - Delay: 500ms before show
  - Duration: 2s
  
- Use Headless UI Popover for tooltip (similar infrastructure)
- Or simpler: native `title` attribute with custom styling

**Recommendation:** Use Framer Motion tooltip with 500ms delay + Floating UI positioning to avoid StatusBar overflow.

---

## 3. Popover Positioning & Overflow Handling

### Floating UI Library (STANDARD)

Floating UI is the ecosystem standard for positioning floating elements. It handles:
- Anchor to StatusBar (bottom-center)
- Flip if popover hits top edge (won't happen in 460px Electron, but good for resilience)
- Shift if popover overflows left/right edges
- Auto-update on window resize

### Implementation Pattern

```typescript
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react';

function TabbedPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const { refs, floatingStyles } = useFloating({
    placement: 'top',
    middleware: [
      offset(8), // 8px gap between StatusBar and popover
      flip(),    // Flip to bottom if hitting top viewport edge
      shift({ padding: 8 }), // Shift left/right to stay in viewport
    ],
    whileElementsMounted: autoUpdate,
  });

  return (
    <>
      <button ref={refs.setReference}>
        <Icon name="gauge" />
        {hasAlerts && <div className="absolute w-2 h-2 bg-red-500 rounded-full" />}
      </button>
      
      {isOpen && (
        <div
          ref={refs.setFloating}
          style={{
            ...floatingStyles,
            zIndex: 1000, // Above other overlays
          }}
          className="bg-slate-900/80 backdrop-blur-lg rounded-lg shadow-lg"
        >
          {/* Tabbed content */}
        </div>
      )}
    </>
  );
}
```

### Z-Index Management

**Problem:** Electron apps with multiple overlays (StatusBar, panels, context menus) can have z-index collisions.

**Strategy:**
- StatusBar: `z-10`
- Default overlays (tooltips, popovers): `z-50`
- Modals: `z-100`
- Popover: `z-50` (same as default overlays)
- Use CSS custom properties to document intent:
  ```css
  :root {
    --z-statusbar: 10;
    --z-overlay: 50;
    --z-modal: 100;
  }
  ```

**Electron-specific:** Check Electron's `webPreferences` for `zoomFactor` conflicts. If window is zoomed, Floating UI may miscalculate viewport. Solution: Use `devicePixelRatio` when computing positioning.

---

## 4. Panel Content Switching & Animation

### Animation Strategy

**Choice: Fade + Instant Slide (Not Full Slide)**

Reasoning:
- Full slide (150ms+) feels sluggish in 460px space
- Fade (100ms) is instant-feeling, smooth
- Instant switch with Framer Motion: `AnimatePresence` + `exit={{ opacity: 0 }}` animates the exit

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { Tab } from '@headlessui/react';

function TabbedPanelContent() {
  const [selectedIndex, setSelectedIndex] = useState(0);

  return (
    <Tab.Group selectedIndex={selectedIndex} onChange={setSelectedIndex}>
      <Tab.List className="flex border-b border-slate-700">
        <Tab className="px-4 py-2 text-sm">MCP</Tab>
        <Tab className="px-4 py-2 text-sm">Cost</Tab>
        <Tab className="px-4 py-2 text-sm">Alerts</Tab>
      </Tab.List>

      <div className="h-64 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <Tab.Panel>
              {selectedIndex === 0 && <MCPDashboard />}
              {selectedIndex === 1 && <CostDashboard />}
              {selectedIndex === 2 && <Notifications />}
            </Tab.Panel>
          </motion.div>
        </AnimatePresence>
      </div>
    </Tab.Group>
  );
}
```

### Scroll Position Preservation

**Pattern:** Store scroll offset per tab in Zustand store.

```typescript
type TabState = {
  selectedTab: number;
  scrollOffsets: Record<number, number>; // tabIndex -> scrollY
  setScrollOffset: (tabIndex: number, offset: number) => void;
  setSelectedTab: (tab: number) => void;
};

function MCPDashboard() {
  const { scrollOffsets, setScrollOffset, selectedTab } = useTabStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Restore scroll when tab opens
    if (ref.current && selectedTab === 0) {
      ref.current.scrollTop = scrollOffsets[0] || 0;
    }
  }, [selectedTab]);

  useEffect(() => {
    // Save scroll when user scrolls
    const handleScroll = () => {
      if (ref.current) {
        setScrollOffset(0, ref.current.scrollTop);
      }
    };
    ref.current?.addEventListener('scroll', handleScroll);
    return () => ref.current?.removeEventListener('scroll', handleScroll);
  }, [setScrollOffset]);

  return <div ref={ref} className="overflow-auto h-64">{/* content */}</div>;
}
```

### Lazy Loading vs Eager Rendering

**For 460px Electron app:** Use **eager rendering** (render all tabs immediately, just hide inactive ones).

**Reasoning:**
- Lazy loading adds complexity (useEffect to fetch data per tab)
- 3 tabs of lightweight data (MCP status, cost summary, notification list) is cheap to render
- Users expect instant switching (no loading spinner)

**But:** If data is expensive (API calls), use lazy loading:
```typescript
const [dataLoaded, setDataLoaded] = useState<Record<number, boolean>>({});

function TabbedPanel() {
  useEffect(() => {
    if (!dataLoaded[selectedIndex]) {
      fetchTabData(selectedIndex).then(() => {
        setDataLoaded(prev => ({ ...prev, [selectedIndex]: true }));
      });
    }
  }, [selectedIndex]);

  return selectedIndex === 0 ? <MCPDashboard loading={!dataLoaded[0]} /> : null;
}
```

---

## 5. Keyboard Navigation

### Accessible Tab Pattern (WCAG 2.1 AA)

Use Headless UI `<Tab>` component — it handles all accessibility automatically:

| Behavior | Key(s) | What Happens |
|----------|--------|--------------|
| Move focus between tabs | Left/Right arrow | Move focus to prev/next tab, auto-activate |
| Jump to first tab | Home | Focus + activate first tab |
| Jump to last tab | End | Focus + activate last tab |
| Close popover | Escape | Close, move focus back to trigger button |
| Focus next element | Tab | Move focus out of tab list (if at last tab) |

**Why Headless UI:** It implements the [WAI-ARIA Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) automatically:
- `role="tablist"` on wrapper
- `role="tab"` on each tab button
- `role="tabpanel"` on each panel
- `aria-selected`, `aria-controls`, `aria-labelledby` managed automatically
- Roving tabindex (only active tab is in tab order)

### Implementation (Using Headless UI)

```typescript
import { Tab } from '@headlessui/react';

function TabbedPanel() {
  const [isOpen, setIsOpen] = useState(false);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      // Focus returns to trigger button (handled by Headless UI internally)
    }
  };

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)}>Dashboard</button>
      
      {isOpen && (
        <Tab.Group onKeyDown={handleKeyDown}>
          <Tab.List>
            {/* Tabs auto-handle left/right arrow navigation */}
          </Tab.List>
          <Tab.Panels>
            {/* Panels */}
          </Tab.Panels>
        </Tab.Group>
      )}
    </>
  );
}
```

### Focus Trap (Click Outside Behavior)

Use **focus-trap-react** library (standard for accessible modals/popovers):

```typescript
import FocusTrap from 'focus-trap-react';

function TabbedPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button ref={triggerRef} onClick={() => setIsOpen(!isOpen)}>
        Dashboard
      </button>

      {isOpen && (
        <FocusTrap>
          <div
            role="dialog"
            onClick={(e) => {
              // Close if click is outside popover (not on trigger)
              if (e.target === e.currentTarget) setIsOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsOpen(false);
            }}
            className="bg-slate-900/80 backdrop-blur-lg"
          >
            {/* Tabbed content — focus trapped inside */}
          </div>
        </FocusTrap>
      )}
    </>
  );
}
```

---

## 6. Common Pitfalls & Prevention

### Pitfall 1: Z-Index Wars with Other Electron Panels

**What goes wrong:** MCP panel, Cost panel, and unified popover all use `z-50`, causing one to randomly appear on top.

**Why it happens:** No centralized z-index strategy; each component uses arbitrary values.

**Prevention:**
- Define z-index scale in global CSS:
  ```css
  :root {
    --z-statusbar: 10;
    --z-tooltip: 40;
    --z-popover: 50;
    --z-modal: 100;
    --z-notification: 200;
  }
  ```
- All overlays use CSS vars, not magic numbers
- Document in a `z-index.ts` file listing all layers

**Warning signs:** Toggle panels on/off and watch which appears on top — should be consistent.

### Pitfall 2: Click-Outside-to-Close Conflicts

**What goes wrong:** Clicking on StatusBar button closes popover, but then immediately re-opens it (because click bubbles up).

**Why it happens:** Click handler on button triggers `setIsOpen(true)`, but event listener on popover also triggers `setIsOpen(false)`.

**Prevention:**
- Use event `stopPropagation()` on trigger button:
  ```typescript
  <button onClick={(e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  }}>
  ```
- Or: Track which element is the trigger and exclude it from close logic:
  ```typescript
  const handleClickOutside = (e: MouseEvent) => {
    if (triggerRef.current?.contains(e.target as Node)) return;
    setIsOpen(false);
  };
  ```

**Warning signs:** Popover closes immediately when you click the button to open it.

### Pitfall 3: Scroll Leaks Between Tabs

**What goes wrong:** Scroll position in MCP tab affects Cost tab (both scroll to same position).

**Why it happens:** Shared `overflow-auto` container; scroll offset not isolated per tab.

**Prevention:**
- Each tab panel has its own scrollable container:
  ```typescript
  <Tab.Panel className="overflow-auto h-64">
    {/* content scrolls independently */}
  </Tab.Panel>
  ```
- Use Zustand store (shown in Section 4) to preserve per-tab scroll

**Warning signs:** Switch tabs, scroll in one, switch back — scroll position jumped.

### Pitfall 4: Memory Leaks from Unmounted Panels

**What goes wrong:** Closing popover unmounts all tabs; they fetch data again when popover reopens.

**Why it happens:** Components are removed from DOM, state is lost, useEffect refetches.

**Prevention:**
- Keep all tab content mounted (just hidden):
  ```typescript
  <Tab.Panel style={{ display: selectedIndex === 0 ? 'block' : 'none' }}>
    {/* Always mounted, just hidden */}
  </Tab.Panel>
  ```
- Or: Store fetched data in Zustand (survives unmount):
  ```typescript
  const mcpData = useStore(state => state.mcpDashboard);
  ```

**Warning signs:** Each time you open popover, spinners appear (data refetch).

### Pitfall 5: Accessibility — Missing ARIA Roles

**What goes wrong:** Screen readers don't understand the tabbed structure.

**Why it happens:** Using `<div>` for tabs instead of `<Tab>` from Headless UI.

**Prevention:**
- Use **Headless UI `<Tab>`** component (handles all ARIA automatically)
- If hand-rolling:
  ```typescript
  <div role="tablist" aria-orientation="horizontal">
    <button role="tab" aria-selected={active} aria-controls="panel-1">
      MCP
    </button>
  </div>
  <div role="tabpanel" id="panel-1" aria-labelledby="tab-1">
    Content
  </div>
  ```

**Warning signs:** Run axe DevTools — should see 0 tab-related violations.

### Pitfall 6: Popover Overflow in 460px Window

**What goes wrong:** Popover opens and is cut off at screen edge.

**Why it happens:** No overflow handling; popover width is fixed.

**Prevention:**
- Use Floating UI `shift()` middleware (auto-shifts left/right):
  ```typescript
  middleware: [
    offset(8),
    flip(),
    shift({ padding: 8 }), // Stay 8px from viewport edge
  ]
  ```
- Set max-width to viewport-safe size:
  ```typescript
  <div className="max-w-[calc(100vw-16px)]">Popover</div>
  ```

**Warning signs:** Resize Electron window to 460px and open popover — should stay in bounds.

---

## 7. Should You Actually Use Tabs? Alternative Analysis

### The Question: Tabs vs Separate Panels

**Current Model (3 separate panels):**
- ✅ Faster to use (click button → see panel, no tab switching)
- ✅ Better for narrow widths (each panel can be full-width within constraints)
- ✅ Buttons are always visible (high discoverability)
- ❌ Takes up 3 StatusBar slots (reduces room for other controls)

**Unified Tabbed Popover:**
- ✅ Saves StatusBar space (1 button instead of 3)
- ✅ Modern, consistent with VS Code
- ✅ Easier to manage single floating window
- ❌ Tab labels truncate at 460px (bad discoverability)
- ❌ Users must switch tabs to compare sections
- ❌ Learning curve (what does the gauge icon mean?)

### Research-Backed Recommendation

**From Nielsen Norman Group (2019)** — Tabs are best when:
1. Users view content sequentially (not side-by-side)
2. Space is precious (desktop sidebars, not 460px popovers)
3. Content is substantial per section (not quick summaries)

**For your use case:**
- MCP Dashboard: Status checks (2-3 lines per MCP connection)
- Cost Dashboard: Cost summary + alerts (3-5 lines)
- Notifications: Alert list (variable height)

**All three are LIGHTWEIGHT.** Users likely want a quick glance (current separate-panel model) rather than deep exploration (tab model).

### Hybrid Recommendation: "Quick Peek" vs "Deep Dive"

**Best UX pattern for 460px Electron:**

1. **Quick peek (current model):** 3 separate buttons, small popovers
   - "MCP Status" button → mini popover showing 1-2 status lines, close on escape
   - "Cost Alert" button → mini popover showing latest cost, close on escape
   - "Notifications" button → mini popover showing latest 3 alerts, close on escape

2. **Deep dive (add if needed):** Single "Dashboard" button opens full tabbed popover
   - User clicks "Dashboard" → tabbed popover with all 3 sections
   - Full heights (MCP: 5 items, Cost: charts, Notifications: all alerts)
   - Users who want to compare or explore deeply use this

**Result:** Best of both worlds — fast common case (quick peek), powerful when needed (deep dive).

### Decision Tree

Use **unified tabbed popover if:**
- ✅ Users frequently compare sections ("Is cost up because of new MCP?")
- ✅ StatusBar space is critical (5+ controls needed)
- ✅ You're willing to invest in better icon/label UX (icon + label, wider popover if window allows)

Use **separate panel approach if:**
- ✅ Users mostly check one section at a time
- ✅ StatusBar space is available
- ✅ Quick discoverability is more important than saving space

---

## 8. Standard Stack & Implementation

### React Libraries (Verified Ecosystem Standards)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **Headless UI** | 1.7+ | Accessible Tab component | Implements WCAG 2.1 AA tabs + roving tabindex |
| **Floating UI** | 0.26+ | Popover positioning | Standard for overflow/flip/shift handling |
| **Framer Motion** | 10+ | Animations (fade) | Works with Headless UI, smooth 60fps |
| **focus-trap-react** | 10+ | Focus management | Prevent focus escape from popover |
| **Zustand** | 5.0+ | State management (already in your stack) | Perfect for tab state + scroll persistence |
| **Tailwind CSS** | 4.0+ | Styling + glass morphism | Already in your stack |
| **Phosphor Icons** | Latest | Icon family (gauge, etc) | Already using it, 683 icons available |

### Installation

```bash
npm install @headlessui/react @floating-ui/react framer-motion focus-trap-react
```

(You already have Zustand, Tailwind, Phosphor.)

### Project Structure

```
src/
├── components/
│   ├── StatusBar/
│   │   ├── TabbedPanelPopover.tsx       # Main component
│   │   ├── TabBar.tsx                    # Tab switching logic
│   │   ├── MCPDashboard.tsx              # Tab panel 1
│   │   ├── CostDashboard.tsx             # Tab panel 2
│   │   └── NotificationsList.tsx         # Tab panel 3
│   └── ...
├── store/
│   └── panelStore.ts                     # Zustand: selectedTab, scrollOffsets
└── styles/
    └── z-index.css                       # Z-index scale
```

### Code Example: Complete TabbedPanel Component

```typescript
// components/StatusBar/TabbedPanelPopover.tsx
import { useState, useRef, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import FocusTrap from 'focus-trap-react';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Gauge } from '@phosphor-icons/react';
import { usePanelStore } from '@/store/panelStore';

export function TabbedPanelPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { selectedTab, setSelectedTab, hasAlerts } = usePanelStore();

  const { refs, floatingStyles } = useFloating({
    placement: 'top',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <>
      <button
        ref={(el) => {
          triggerRef.current = el;
          refs.setReference(el);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="relative p-2 hover:bg-slate-800 rounded transition-colors"
        aria-label="Open dashboard panels"
      >
        <Gauge size={16} weight="duotone" />
        {hasAlerts && (
          <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>

      {isOpen && (
        <FocusTrap>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-50 bg-slate-900/90 backdrop-blur-lg border border-slate-700 rounded-lg shadow-2xl w-[420px] max-h-96"
            onClick={(e) => {
              if (e.target === e.currentTarget) setIsOpen(false);
            }}
          >
            <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
              <Tab.List className="flex border-b border-slate-700 bg-slate-800/50">
                <Tab className="flex-1 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ui-selected:text-blue-400 ui-selected:bg-slate-700/50 ui-not-selected:text-slate-400 hover:text-slate-200">
                  MCP
                </Tab>
                <Tab className="flex-1 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ui-selected:text-blue-400 ui-selected:bg-slate-700/50 ui-not-selected:text-slate-400 hover:text-slate-200">
                  Cost
                </Tab>
                <Tab className="flex-1 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ui-selected:text-blue-400 ui-selected:bg-slate-700/50 ui-not-selected:text-slate-400 hover:text-slate-200">
                  Alerts
                </Tab>
              </Tab.List>

              <Tab.Panels className="overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedTab}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.1 }}
                    className="p-4 max-h-80 overflow-y-auto"
                  >
                    <Tab.Panel>
                      {selectedTab === 0 && <MCPDashboard />}
                      {selectedTab === 1 && <CostDashboard />}
                      {selectedTab === 2 && <NotificationsList />}
                    </Tab.Panel>
                  </motion.div>
                </AnimatePresence>
              </Tab.Panels>
            </Tab.Group>
          </div>
        </FocusTrap>
      )}
    </>
  );
}
```

### Zustand Store

```typescript
// store/panelStore.ts
import { create } from 'zustand';

type PanelStore = {
  selectedTab: number;
  scrollOffsets: Record<number, number>;
  hasAlerts: boolean;
  setSelectedTab: (tab: number) => void;
  setScrollOffset: (tab: number, offset: number) => void;
  setHasAlerts: (has: boolean) => void;
};

export const usePanelStore = create<PanelStore>((set) => ({
  selectedTab: 0,
  scrollOffsets: { 0: 0, 1: 0, 2: 0 },
  hasAlerts: false,

  setSelectedTab: (tab) => set({ selectedTab: tab }),
  setScrollOffset: (tab, offset) =>
    set((state) => ({
      scrollOffsets: { ...state.scrollOffsets, [tab]: offset },
    })),
  setHasAlerts: (has) => set({ hasAlerts: has }),
}));
```

---

## 9. Glass Morphism Implementation (Tailwind CSS 4)

```tailwind
/* bg-slate-900/90 backdrop-blur-lg */
.tabbed-popover {
  @apply bg-slate-900/90 backdrop-blur-lg border border-white/10 rounded-lg shadow-2xl;
}

/* For higher/lower blur intensity */
.glass-light { @apply bg-white/10 backdrop-blur-sm; }      /* Light blur */
.glass-medium { @apply bg-white/20 backdrop-blur-md; }     /* Medium blur */
.glass-heavy { @apply bg-slate-900/90 backdrop-blur-lg; }  /* Heavy blur */
```

**Browser support:** backdrop-blur is supported in Chrome 76+, Safari 9+, Edge 79+. Electron uses Chromium, so all recent versions work. Fallback for older builds: just remove `backdrop-blur-lg` — users get solid background.

---

## 10. Testing & Validation Checklist

Before shipping:

- [ ] **Z-index:** Open popover, toggle other panels — popover stays on top
- [ ] **Keyboard:** Arrow keys switch tabs, Home/End jump to first/last, Escape closes
- [ ] **Focus trap:** Tab within popover doesn't escape to StatusBar buttons
- [ ] **Click outside:** Click background closes, click trigger reopens
- [ ] **Scroll persistence:** Scroll MCP tab, switch to Cost, switch back — scroll position restored
- [ ] **Responsive:** Resize window to 460px — popover stays in bounds, labels readable
- [ ] **Accessibility:** Run axe DevTools — no tab-related violations
- [ ] **Glass effect:** Looks good with background blur (test on real Electron window, not just browser)
- [ ] **Animation smoothness:** Tab transitions are snappy (< 200ms)
- [ ] **Badge visibility:** Notification badge visible in dark theme

---

## 11. Sources & Verification

### HIGH Confidence (Context7 / Official Docs)
- [Floating UI Popover Docs](https://floating-ui.com/docs/popover) — positioning, middleware
- [Headless UI Tabs Documentation](https://headlessui.com/react/tabs) — accessibility, keyboard nav
- [Phosphor Icons Library](https://phosphoricons.com/) — icon selection, availability
- [Tailwind CSS Backdrop Filter](https://tailwindcss.com/docs/backdrop-filter-blur) — glass morphism

### MEDIUM Confidence (Verified with Official Source)
- [React Aria Tabs (WAI-ARIA Pattern)](https://react-spectrum.adobe.com/react-aria/Tabs.html) — keyboard navigation patterns
- [Focus Trap React GitHub](https://github.com/focus-trap/focus-trap-react) — focus management
- [Zustand GitHub](https://github.com/pmndrs/zustand) — state management for tabs
- [Framer Motion + Headless UI Integration](https://medium.com/@michaelyu713705/simple-animated-popup-with-framer-motion-and-react-a3c35a17d0e2) — animation patterns

### Research Sources (WebSearch)
- [Tabs UX: Best Practices (Nielsen Norman Group)](https://www.nngroup.com/articles/tabs-used-right/)
- [Tabs vs. Alternatives for Narrow Widths (Design Best Practices)](https://www.eleken.co/blog-posts/tabs-ux)
- [VS Code Floating Windows (v1.85+)](https://code.visualstudio.com/docs/configure/custom-layout)
- [Electron StatusBar Positioning](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)
- [WCAG 2.1 Tab Accessibility Patterns](https://dev.to/eevajonnapanula/keyboard-accessible-tabs-with-react-5ch4)

---

## 12. Key Decision Points (Before Implementation)

**Decision 1: Icon + Label vs Icon Only?**
- Icon only (40px total): Better for 460px, but lower discoverability
- Icon + label (120px total): Better discoverability, but labels truncate at 460px
- **Recommendation:** Icon with tooltip on hover (best of both)

**Decision 2: Eager vs Lazy Rendering?**
- Eager: All 3 tabs render on open (instant switching, slightly slower open)
- Lazy: Tabs render on-demand (faster open, slight delay when switching)
- **Recommendation:** Eager for lightweight content (as your app seems to have)

**Decision 3: Unified Tabs or Separate Panels?**
- **Recommendation:** Validate with users first. Run quick A/B test:
  - Variant A: Current 3 separate buttons
  - Variant B: Single "Dashboard" button with tabbed popover
  - Measure: Time to find info, user preference, discoverability

---

## 13. Confidence Breakdown

| Area | Confidence | Reason |
|------|-----------|--------|
| Floating UI for positioning | **HIGH** | Official docs verified, standard ecosystem library |
| Headless UI for accessible tabs | **HIGH** | WCAG 2.1 AA compliant, widely used in design systems |
| Framer Motion animations | **HIGH** | Battle-tested library, clear patterns for tab transitions |
| Glass morphism (Tailwind) | **HIGH** | Built-in utilities, good browser support |
| Z-index management strategy | **MEDIUM** | General best practice, specific implementation depends on your codebase |
| Notification badge patterns | **HIGH** | Material Design + PatternFly verified, standard in modern apps |
| Tabs vs separate panels decision | **MEDIUM** | Depends on user research; Nielsen NN/G provides framework, but your use case is unique |
| 460px width constraint feasibility | **MEDIUM** | Icon-only tabs are viable, but requires careful UX testing for discoverability |

---

## 14. Open Questions & Next Steps

1. **User preference:** Do your users actually want to compare sections (tabs benefit), or just peek at one at a time (current model is faster)?
   - **Recommendation:** Conduct 5-minute user interview or quick usage survey

2. **Content height:** How tall is typical content in each dashboard? If > 200px, tabs save scrolling space; if < 100px, separate panels are clearer.
   - **Recommendation:** Measure current panel heights

3. **Electron window responsiveness:** Does your app resize often? If not, Floating UI's autoUpdate can be omitted to save CPU.
   - **Recommendation:** Profile `autoUpdate` performance

4. **Glass morphism aesthetics:** Does the dark glass effect match your branding/design system?
   - **Recommendation:** Screenshot with Figma mockup of the blurred background

---

## Conclusion

**Build the tabbed popover if:**
- Space savings (1 StatusBar button vs 3) is critical
- Users need to compare sections
- Your design system uses glass morphism already

**Stick with separate panels if:**
- StatusBar space is available
- Users mostly check one section at a time
- Discoverability is more important than space

**Hybrid approach recommended:** Keep separate buttons for quick peeks + add a "Full Dashboard" button that opens the tabbed popover for deep exploration.

Use Floating UI + Headless UI + Framer Motion — proven, accessible, performant stack with excellent React 19 support.

