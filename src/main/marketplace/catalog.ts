import { net } from 'electron'
import { execFile } from 'child_process'
import { readFile, readdir, mkdir, writeFile, rm } from 'fs/promises'
import { join, resolve } from 'path'
import { homedir } from 'os'
import type { CatalogPlugin } from '../../shared/types'
import { log as _log } from '../logger'
import { getCliEnv } from '../cli-env'

// ─── Input Validation ───

// Strict safe charset for plugin names: alphanumeric, hyphens, underscores, dots
const SAFE_PLUGIN_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
// Strict owner/repo format
const SAFE_REPO = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/

function validatePluginName(name: string): boolean {
  return SAFE_PLUGIN_NAME.test(name) && !name.includes('..')
}

function validateRepo(repo: string): boolean {
  return SAFE_REPO.test(repo)
}

function validateSourcePath(p: string): boolean {
  // Reject absolute paths, null bytes, backslashes, and traversal
  if (!p || /[\0\\]/.test(p) || p.startsWith('/') || p.includes('..')) return false
  return true
}

function assertSkillDirContained(skillsDir: string, base: string): void {
  const resolved = resolve(skillsDir)
  const resolvedBase = resolve(base)
  if (!resolved.startsWith(resolvedBase + '/') && !resolved.startsWith(resolvedBase + '\\') && resolved !== resolvedBase) {
    throw new Error(`Path escapes skills directory: ${resolved}`)
  }
}

function log(msg: string): void {
  _log('marketplace', msg)
}

// ─── Sources ───

const SOURCES = [
  { repo: 'anthropics/skills', category: 'Agent Skills' },
  { repo: 'anthropics/knowledge-work-plugins', category: 'Knowledge Work' },
  { repo: 'anthropics/financial-services-plugins', category: 'Financial Services' },
] as const

// ─── TTL Cache ───

let cachedPlugins: CatalogPlugin[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Cache raw SKILL.md content keyed by skill name for direct installation
const skillContentCache = new Map<string, string>()

// ─── fetchCatalog ───

export async function fetchCatalog(forceRefresh?: boolean): Promise<{ plugins: CatalogPlugin[]; error: string | null }> {
  if (!forceRefresh && cachedPlugins && Date.now() - cacheTimestamp < CACHE_TTL) {
    return { plugins: cachedPlugins, error: null }
  }

  const allPlugins: CatalogPlugin[] = []
  const errors: string[] = []

  const results = await Promise.allSettled(
    SOURCES.map(async (source) => {
      const marketplaceUrl = `https://raw.githubusercontent.com/${source.repo}/main/.claude-plugin/marketplace.json`
      log(`Fetching marketplace: ${marketplaceUrl}`)

      const marketplaceRes = await netFetch(marketplaceUrl)
      if (!marketplaceRes.ok) {
        throw new Error(`Failed to fetch marketplace for ${source.repo}: ${marketplaceRes.status}`)
      }

      const marketplaceData = JSON.parse(marketplaceRes.body) as {
        name: string
        plugins: Array<{
          name: string
          source: string
          description?: string
          author?: { name: string } | string
          skills?: string[]
        }>
      }

      const safeMarketplaceName = typeof marketplaceData.name === 'string' && marketplaceData.name.trim().length > 0
        ? marketplaceData.name.trim()
        : source.repo

      // Flatten: for entries with a skills[] array, expand each skill as its own catalog item.
      // For entries without skills[] (knowledge-work, financial-services), use plugin.json as before.
      type FetchJob = { installName: string; skillPath: string; entryDescription: string; entryAuthor: string; useSkillMd: boolean }
      const jobs: FetchJob[] = []

      for (const entry of marketplaceData.plugins) {
        let entryAuthor = ''
        if (entry.author) {
          entryAuthor = typeof entry.author === 'string' ? entry.author : entry.author.name || ''
        }

        if (entry.skills && entry.skills.length > 0) {
          // Skills repo: each skill path (e.g. "./skills/xlsx") becomes its own entry
          for (const skillRef of entry.skills) {
            const skillPath = skillRef.replace(/^\.\//, '').replace(/\/$/, '')
            // Use the individual skill directory name as installName (not the bundle name)
            const individualName = skillPath.split('/').pop() || entry.name
            jobs.push({
              installName: individualName,
              skillPath,
              entryDescription: entry.description || '',
              entryAuthor,
              useSkillMd: true,
            })
          }
        } else {
          // Standard plugin: source points to a directory with .claude-plugin/plugin.json
          const normalizedSource = entry.source.replace(/^\.\//, '').replace(/\/$/, '')
          jobs.push({
            installName: entry.name,
            skillPath: normalizedSource || entry.name,
            entryDescription: entry.description || '',
            entryAuthor,
            useSkillMd: false,
          })
        }
      }

      const jobResults = await Promise.allSettled(
        jobs.map(async (job) => {
          let name = ''
          let description = ''
          let version = '0.0.0'
          let author = job.entryAuthor || 'Anthropic'

          if (job.useSkillMd) {
            // Fetch SKILL.md and parse frontmatter for name/description
            const skillUrl = `https://raw.githubusercontent.com/${source.repo}/main/${job.skillPath}/SKILL.md`
            try {
              const res = await netFetch(skillUrl)
              if (res.ok) {
                const parsed = parseSkillFrontmatter(res.body)
                name = parsed.name
                description = parsed.description
                // Cache raw content for direct installation
                skillContentCache.set(job.installName, res.body)
              }
            } catch (e) {
              log(`SKILL.md fetch failed for ${job.skillPath}`)
            }
          } else {
            // Fetch plugin.json
            const pluginUrl = `https://raw.githubusercontent.com/${source.repo}/main/${job.skillPath}/.claude-plugin/plugin.json`
            try {
              const res = await netFetch(pluginUrl)
              if (res.ok) {
                const data = JSON.parse(res.body) as { name?: string; version?: string; description?: string; author?: string }
                name = data.name?.trim() || ''
                description = data.description || ''
                version = data.version?.trim() || '0.0.0'
                author = data.author?.trim() || author
              }
            } catch (e) {
              log(`plugin.json fetch failed for ${job.skillPath}`)
            }
          }

          // Fallbacks
          const dirName = job.skillPath.split('/').pop() || job.installName
          if (!name) name = dirName
          if (!description) description = job.entryDescription

          const plugin: CatalogPlugin = {
            id: `${source.repo}/${job.skillPath}`,
            name,
            description,
            version,
            author,
            marketplace: safeMarketplaceName,
            repo: source.repo,
            sourcePath: job.skillPath,
            installName: job.installName,
            category: source.category,
            tags: deriveSemanticTags(name, description, job.skillPath),
            isSkillMd: job.useSkillMd,
          }
          return plugin
        })
      )

      for (const r of jobResults) {
        if (r.status === 'fulfilled') {
          allPlugins.push(r.value)
        } else {
          log(`Plugin fetch warning: ${r.reason}`)
        }
      }
    })
  )

  for (const r of results) {
    if (r.status === 'rejected') {
      log(`Source fetch error: ${r.reason}`)
      errors.push(String(r.reason))
    }
  }

  // Only error if ALL sources failed and we got no plugins
  if (allPlugins.length === 0 && errors.length > 0) {
    return { plugins: [], error: errors.join('; ') }
  }

  // Sort by name
  allPlugins.sort((a, b) => a.name.localeCompare(b.name))

  // Update cache
  cachedPlugins = allPlugins
  cacheTimestamp = Date.now()

  return { plugins: allPlugins, error: null }
}

// ─── listInstalled ───
// Reads directly from ~/.claude filesystem for reliable detection:
// - Plugins: ~/.claude/plugins/installed_plugins.json (keys are "name@marketplace")
// - Skills: ~/.claude/skills/ (each subdirectory is an installed skill)

export async function listInstalled(): Promise<string[]> {
  const claudeDir = join(homedir(), '.claude')
  const names: string[] = []

  // 1. Installed plugins from JSON registry
  try {
    const raw = await readFile(join(claudeDir, 'plugins', 'installed_plugins.json'), 'utf-8')
    const data = JSON.parse(raw) as { plugins?: Record<string, unknown> }
    if (data.plugins) {
      for (const key of Object.keys(data.plugins)) {
        // Keys are "name@marketplace" e.g. "design@knowledge-work-plugins"
        const pluginName = key.split('@')[0]
        if (pluginName) names.push(pluginName)
        // Also push the full key for exact matching
        names.push(key)
      }
    }
  } catch (e) {
    log(`listInstalled: no installed_plugins.json or parse error: ${e}`)
  }

  // 2. Installed skills from ~/.claude/skills/
  try {
    const entries = await readdir(join(claudeDir, 'skills'), { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        names.push(entry.name)
      }
    }
  } catch (e) {
    log(`listInstalled: no skills dir or read error: ${e}`)
  }

  return [...new Set(names)]
}

// ─── installPlugin ───
// For SKILL.md skills: writes directly to ~/.claude/skills/<name>/
// For CLI plugins: falls back to `claude plugin install`

export async function installPlugin(
  repo: string,
  pluginName: string,
  marketplace: string,
  sourcePath?: string,
  isSkillMd?: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Validate all external inputs before any filesystem or network operations
    if (!validatePluginName(pluginName)) {
      return { ok: false, error: `Invalid plugin name: ${pluginName}` }
    }
    if (!validateRepo(repo)) {
      return { ok: false, error: `Invalid repo format: ${repo}` }
    }
    if (sourcePath && !validateSourcePath(sourcePath)) {
      return { ok: false, error: `Invalid source path: ${sourcePath}` }
    }

    if (isSkillMd !== false) {
      // Direct SKILL.md install
      const skillsBase = join(homedir(), '.claude', 'skills')
      const skillsDir = join(skillsBase, pluginName)
      assertSkillDirContained(skillsDir, skillsBase)

      // Check if we have cached content from the catalog fetch
      let content = skillContentCache.get(pluginName)

      if (!content) {
        const path = sourcePath || `skills/${pluginName}`
        const url = `https://raw.githubusercontent.com/${repo}/main/${path}/SKILL.md`
        log(`installPlugin: fetching ${url}`)
        const res = await netFetch(url)
        if (!res.ok) {
          return { ok: false, error: `Failed to fetch SKILL.md (${res.status})` }
        }
        content = res.body
      }

      await mkdir(skillsDir, { recursive: true })
      await writeFile(join(skillsDir, 'SKILL.md'), content, 'utf-8')
      log(`installPlugin: wrote ${skillsDir}/SKILL.md`)
    } else {
      // CLI plugin install (knowledge-work, financial-services bundles)
      const addResult = await execAsync('claude', ['plugin', 'marketplace', 'add', repo], 15000)
      if (addResult.exitCode !== 0 && !addResult.stdout.includes('already added') && !addResult.stderr.includes('already added')) {
        return { ok: false, error: addResult.stderr || 'Failed to add marketplace' }
      }
      const installResult = await execAsync('claude', ['plugin', 'install', `${pluginName}@${marketplace}`], 15000)
      if (installResult.exitCode !== 0) {
        return { ok: false, error: installResult.stderr || 'Failed to install plugin' }
      }
    }

    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`installPlugin error: ${msg}`)
    return { ok: false, error: msg }
  }
}

// ─── uninstallPlugin ───

export async function uninstallPlugin(
  pluginName: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!validatePluginName(pluginName)) {
      return { ok: false, error: `Invalid plugin name: ${pluginName}` }
    }
    const skillsBase = join(homedir(), '.claude', 'skills')
    const skillsDir = join(skillsBase, pluginName)
    assertSkillDirContained(skillsDir, skillsBase)
    await rm(skillsDir, { recursive: true, force: true })
    log(`uninstallPlugin: removed ${skillsDir}`)
    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`uninstallPlugin error: ${msg}`)
    return { ok: false, error: msg }
  }
}

// ─── Helpers ───

function netFetch(url: string, timeoutMs = 15000): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
    const timer = setTimeout(() => {
      request.abort()
      reject(new Error(`Request timed out after ${timeoutMs / 1000}s`))
    }, timeoutMs)
    request.on('response', (response) => {
      let body = ''
      response.on('data', (chunk) => { body += chunk.toString() })
      response.on('end', () => {
        clearTimeout(timer)
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          body,
        })
      })
    })
    request.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    request.end()
  })
}

/** Parse YAML-like frontmatter from SKILL.md (name: ..., description: "...") */
function parseSkillFrontmatter(content: string): { name: string; description: string } {
  let name = ''
  let description = ''
  // Frontmatter is at the top, no --- delimiters — just key: value lines
  const lines = content.split('\n')
  for (const line of lines) {
    const nameMatch = line.match(/^name:\s*(.+)/)
    if (nameMatch && !name) {
      name = nameMatch[1].replace(/^["']|["']$/g, '').trim()
    }
    const descMatch = line.match(/^description:\s*(.+)/)
    if (descMatch && !description) {
      // Description may be quoted and span conceptually one line
      description = descMatch[1].replace(/^["']|["']$/g, '').trim()
      // Truncate long descriptions for display
      if (description.length > 200) {
        description = description.substring(0, 197) + '...'
      }
    }
    // Stop after we have both, or after hitting a markdown heading (end of frontmatter)
    if (name && description) break
    if (line.startsWith('# ')) break
  }
  return { name, description }
}

// ─── Semantic tag derivation ───
// Maps plugin meaning (name, description, path) to discoverable use-case tags.
// Provenance (repo, author, marketplace) stays in metadata, not tags.

const TAG_RULES: Array<{ tag: string; patterns: RegExp }> = [
  { tag: 'Design',       patterns: /\b(figma|ui|ux|design|sketch|prototype|wireframe|layout|css|style|visual)\b/i },
  { tag: 'Product',      patterns: /\b(prd|roadmap|strategy|product|backlog|prioriti[sz]|feature\s*request|user\s*stor)\b/i },
  { tag: 'Research',     patterns: /\b(research|interview|insights?|survey|user\s*study|ethnograph|discover)\b/i },
  { tag: 'Docs',         patterns: /\b(doc(ument)?s?|writing|spec(ification)?|readme|markdown|technical\s*writ|content)\b/i },
  { tag: 'Spreadsheet',  patterns: /\b(sheet|spreadsheet|xlsx?|csv|tabular|pivot|formula)\b/i },
  { tag: 'Slides',       patterns: /\b(slides?|presentation|deck|pptx?|keynote|pitch)\b/i },
  { tag: 'Analysis',     patterns: /\b(analy[sz](is|e|ing)|insight|metric|dashboard|report(ing)?|data\s*viz|statistic)\b/i },
  { tag: 'Finance',      patterns: /\b(financ|accounting|budget|revenue|forecast|valuation|portfolio|investment)\b/i },
  { tag: 'Compliance',   patterns: /\b(risk|audit|policy|compliance|regulat|governance|sox|gdpr|hipaa)\b/i },
  { tag: 'Management',   patterns: /\b(manag|planning|meeting|ops|operations|team|workflow|project\s*plan)\b/i },
  { tag: 'Automation',   patterns: /\b(automat|workflow|pipeline|ci\s*cd|deploy|integrat|orchestrat|script)\b/i },
  { tag: 'Code',         patterns: /\b(code|coding|program|develop|engineer|debug|refactor|test(ing)?|linter?)\b/i },
  { tag: 'Creative',     patterns: /\b(creative|brainstorm|ideation|copywriting|storytelling|narrative)\b/i },
  { tag: 'Sales',        patterns: /\b(sales|crm|prospect|lead|deal|pipeline|outreach|cold\s*(call|email))\b/i },
  { tag: 'Support',      patterns: /\b(support|customer|helpdesk|ticket|troubleshoot|faq|knowledge\s*base)\b/i },
  { tag: 'Security',     patterns: /\b(secur|vulnerabilit|pentest|threat|encrypt|auth(enticat|ori[sz]))\b/i },
  { tag: 'Data',         patterns: /\b(data|database|sql|etl|warehouse|lake|ingest|transform|schema)\b/i },
  { tag: 'AI/ML',        patterns: /\b(ai|ml|machine\s*learn|model|train|inference|llm|prompt|embed)\b/i },
]

function deriveSemanticTags(name: string, description: string, skillPath: string): string[] {
  const text = `${name} ${description} ${skillPath}`.toLowerCase()
  const matched: string[] = []
  for (const rule of TAG_RULES) {
    if (rule.patterns.test(text)) {
      matched.push(rule.tag)
    }
    if (matched.length >= 2) break // Cap at 2 semantic tags
  }
  return matched
}

// ─── Online Search (GitHub + npm) ───

let searchAbortController: AbortController | null = null

export async function searchOnline(query: string): Promise<{ plugins: CatalogPlugin[]; error: string | null }> {
  if (!query || query.trim().length < 2) {
    return { plugins: [], error: null }
  }

  // Cancel any in-flight search
  if (searchAbortController) searchAbortController.abort()
  searchAbortController = new AbortController()

  const results: CatalogPlugin[] = []
  const errors: string[] = []

  const searchTerm = query.trim()

  // GitHub: search repos with "claude" + "mcp" or "skill" context
  const githubSearch = (async () => {
    try {
      const q = encodeURIComponent(`${searchTerm} claude mcp in:name,description,readme`)
      const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&per_page=15`
      const res = await netFetch(url)
      if (!res.ok) return

      const data = JSON.parse(res.body) as {
        items?: Array<{
          full_name: string
          name: string
          description: string | null
          stargazers_count: number
          owner: { login: string }
          default_branch: string
        }>
      }

      for (const item of (data.items || []).slice(0, 10)) {
        // Skip if already in catalog
        if (cachedPlugins?.some((p) => p.repo === item.full_name)) continue

        results.push({
          id: `github:${item.full_name}`,
          name: item.name,
          description: item.description || 'No description',
          version: 'latest',
          author: item.owner.login,
          marketplace: 'GitHub',
          repo: item.full_name,
          sourcePath: '',
          installName: item.name,
          category: 'Community',
          tags: deriveSemanticTags(item.name, item.description || '', ''),
          isSkillMd: true,
          source: 'github',
          stars: item.stargazers_count,
        })
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') errors.push(`GitHub: ${e.message}`)
    }
  })()

  // npm: search for packages with "claude" or "mcp" keywords
  const npmSearch = (async () => {
    try {
      const q = encodeURIComponent(`${searchTerm} claude mcp`)
      const url = `https://registry.npmjs.org/-/v1/search?text=${q}&size=10`
      const res = await netFetch(url)
      if (!res.ok) return

      const data = JSON.parse(res.body) as {
        objects?: Array<{
          package: {
            name: string
            description: string
            version: string
            publisher: { username: string }
            links: { repository?: string; npm: string }
          }
          score: { detail: { popularity: number } }
        }>
      }

      for (const obj of (data.objects || []).slice(0, 8)) {
        const pkg = obj.package
        // Extract repo from links
        let repo = ''
        if (pkg.links.repository) {
          const match = pkg.links.repository.match(/github\.com\/([^/]+\/[^/]+)/)
          if (match) repo = match[1].replace(/\.git$/, '')
        }

        // Skip if already in catalog or GitHub results
        if (cachedPlugins?.some((p) => p.name === pkg.name)) continue
        if (results.some((r) => r.name === pkg.name)) continue

        results.push({
          id: `npm:${pkg.name}`,
          name: pkg.name,
          description: pkg.description || 'No description',
          version: pkg.version,
          author: pkg.publisher?.username || 'Unknown',
          marketplace: 'npm',
          repo: repo || pkg.name,
          sourcePath: '',
          installName: pkg.name,
          category: 'Community',
          tags: deriveSemanticTags(pkg.name, pkg.description || '', ''),
          isSkillMd: false,
          source: 'npm',
          downloads: Math.round(obj.score.detail.popularity * 100000),
        })
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') errors.push(`npm: ${e.message}`)
    }
  })()

  await Promise.allSettled([githubSearch, npmSearch])

  // Sort: GitHub by stars desc, npm by downloads desc
  results.sort((a, b) => (b.stars || 0) - (a.stars || 0) || (b.downloads || 0) - (a.downloads || 0))

  return {
    plugins: results,
    error: errors.length > 0 ? errors.join('; ') : null,
  }
}

// ─── Community Marketplace (claudemarketplaces.com) ───

let communityCache: CatalogPlugin[] | null = null
let communityCacheTimestamp = 0
const COMMUNITY_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export async function fetchCommunitySkills(query?: string): Promise<{ plugins: CatalogPlugin[]; error: string | null }> {
  try {
    // Return cached results if fresh and no specific query
    if (!query && communityCache && Date.now() - communityCacheTimestamp < COMMUNITY_CACHE_TTL) {
      return { plugins: communityCache, error: null }
    }

    const url = query
      ? `https://claudemarketplaces.com/skills?q=${encodeURIComponent(query)}`
      : 'https://claudemarketplaces.com/skills'

    log(`fetchCommunitySkills: fetching ${url}`)
    const res = await netFetch(url, 30000) // 30s timeout — page is ~1.2MB
    if (!res.ok) {
      return { plugins: [], error: `Community marketplace returned ${res.status}` }
    }

    const skills = parseCommunitySkills(res.body)
    log(`fetchCommunitySkills: parsed ${skills.length} skills`)

    // Filter by query client-side (since server search may not work reliably)
    let filtered = skills
    if (query) {
      const q = query.toLowerCase()
      filtered = skills.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.repo.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    // Cache full results (unfiltered)
    if (!query) {
      communityCache = skills
      communityCacheTimestamp = Date.now()
    }

    return { plugins: filtered, error: null }
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : String(err)
    log(`fetchCommunitySkills error: ${raw}`)
    const msg = raw.includes('timed out') || raw.includes('TIMED_OUT')
      ? 'Community marketplace timed out — check your connection and try again.'
      : raw.includes('ERR_CONNECTION') || raw.includes('ENOTFOUND')
        ? 'Could not reach claudemarketplaces.com — check your internet connection.'
        : raw
    return { plugins: [], error: msg }
  }
}

/** Generate a readable description from a hyphenated skill name + repo when none is provided */
function describeSkill(name: string, repo: string): string {
  // "web-design-guidelines" → "Web design guidelines"
  const readable = name.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  const owner = repo.split('/')[0] || ''
  return `${readable} — by ${owner}`
}

function parseCommunitySkills(html: string): CatalogPlugin[] {
  const plugins: CatalogPlugin[] = []
  const seen = new Set<string>()

  // Strategy 1: Try to extract the JSON skills array from the RSC payload.
  // The __next_f.push calls contain escaped JSON. We look for the "skills":[...]
  // array inside the push that has skill data.
  try {
    // Find the push containing "skills" array — it appears as \"skills\":[ in raw HTML
    const skillsArrayMatch = html.match(/\\?"skills\\?":\[(\{.*?\})\]/s)
    if (!skillsArrayMatch) throw new Error('no skills array found')

    // Extract just the array content and normalize escaped quotes
    let arrayStr = '[' + skillsArrayMatch[1] + ']'
    // The RSC payload escapes quotes as \" or \\" — normalize to plain quotes
    arrayStr = arrayStr.replace(/\\\\"/g, '\\"') // \\\" → \"
    arrayStr = arrayStr.replace(/\\"/g, '"')      // \" → "

    const skillsArr = JSON.parse(arrayStr) as Array<Record<string, unknown>>
    for (const s of skillsArr) {
      const name = String(s.name || '')
      const repo = String(s.repo || '')
      const path = String(s.path || '')
      if (!name || !repo) continue
      const id = `community:${repo}/${path}`
      if (seen.has(id)) continue
      seen.add(id)
      const desc = String(s.description || '') || describeSkill(name, repo)
      plugins.push({
        id,
        name,
        description: desc,
        version: 'latest',
        author: repo.split('/')[0] || 'Unknown',
        marketplace: 'Community',
        repo,
        sourcePath: path,
        installName: name,
        category: 'Community',
        tags: deriveSemanticTags(name, desc, path),
        isSkillMd: true,
        source: 'community',
        stars: typeof s.stars === 'number' ? s.stars : undefined,
        downloads: typeof s.installs === 'number' ? s.installs : undefined,
      })
    }
  } catch (e) {
    log(`parseCommunitySkills: JSON strategy failed (${e instanceof Error ? e.message : e}), trying regex fallback`)
  }

  // Strategy 2: Fallback — match "npx skills add" install commands directly on raw HTML.
  // These don't require quote normalization and reliably capture repo + skill name.
  if (plugins.length === 0) {
    // Build a stars/installs lookup from nearby numeric data
    const statsMap = new Map<string, { stars?: number; installs?: number; description?: string }>()
    // Match full skill object fragments with escaped quotes
    const fragPattern = /\\?"name\\?":\\?"([^"\\]+)\\?"[^}]*?\\?"stars\\?":\s*(\d+)[^}]*?\\?"installs\\?":\s*(\d+)/g
    let fragMatch: RegExpExecArray | null
    while ((fragMatch = fragPattern.exec(html)) !== null) {
      statsMap.set(fragMatch[1], { stars: parseInt(fragMatch[2], 10), installs: parseInt(fragMatch[3], 10) })
    }

    const altPattern = /npx skills add https:\/\/github\.com\/([\w._-]+\/[\w._-]+)\s+--skill\s+([\w._-]+)/g
    let match: RegExpExecArray | null
    while ((match = altPattern.exec(html)) !== null) {
      const [, repoPath, skillName] = match
      const id = `community:${repoPath}/${skillName}`
      if (seen.has(id)) continue
      seen.add(id)
      const stats = statsMap.get(skillName)

      plugins.push({
        id,
        name: skillName,
        description: stats?.description || describeSkill(skillName, repoPath),
        version: 'latest',
        author: repoPath.split('/')[0] || 'Unknown',
        marketplace: 'Community',
        repo: repoPath,
        sourcePath: skillName,
        installName: skillName,
        category: 'Community',
        tags: deriveSemanticTags(skillName, '', ''),
        isSkillMd: true,
        source: 'community',
        stars: stats?.stars,
        downloads: stats?.installs,
      })
    }
  }

  log(`parseCommunitySkills: found ${plugins.length} skills from HTML (${html.length} bytes)`)

  // Sort by installs/stars descending
  plugins.sort((a, b) => (b.downloads || 0) - (a.downloads || 0) || (b.stars || 0) - (a.stars || 0))

  return plugins
}

// ─── Skill Detail Fetcher ───

const skillDetailCache = new Map<string, string>()

/**
 * Fetch the SKILL.md (or README.md) content from GitHub for a given repo/path.
 * Returns the raw markdown text, or an error message.
 */
export async function fetchSkillReadme(repo: string, skillPath: string): Promise<{ content: string; error: string | null }> {
  if (!validateRepo(repo)) {
    return { content: '', error: 'Invalid repo format' }
  }

  const cacheKey = `${repo}/${skillPath}`
  if (skillDetailCache.has(cacheKey)) {
    return { content: skillDetailCache.get(cacheKey)!, error: null }
  }

  // Try multiple possible file locations
  const candidates = [
    `https://raw.githubusercontent.com/${repo}/main/${skillPath}/SKILL.md`,
    `https://raw.githubusercontent.com/${repo}/main/${skillPath}/README.md`,
    `https://raw.githubusercontent.com/${repo}/master/${skillPath}/SKILL.md`,
    `https://raw.githubusercontent.com/${repo}/master/${skillPath}/README.md`,
  ]

  for (const url of candidates) {
    try {
      const res = await netFetch(url)
      if (res.ok && res.body.trim()) {
        skillDetailCache.set(cacheKey, res.body)
        return { content: res.body, error: null }
      }
    } catch {
      // Try next candidate
    }
  }

  return { content: '', error: 'Could not find SKILL.md or README.md' }
}

function execAsync(cmd: string, args: string[], timeout: number): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, env: getCliEnv() }, (err, stdout, stderr) => {
      resolve({
        exitCode: err ? 1 : 0,
        stdout: stdout || '',
        stderr: stderr || '',
      })
    })
  })
}
