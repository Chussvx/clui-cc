/**
 * Agent Defaults — role-based system prompts and tool restrictions.
 *
 * When a user defines agents for orchestration mode, any missing fields
 * (systemPrompt, allowedTools, maxTurns) are filled from these defaults
 * based on the agent's role.
 */

import type { AgentRole } from '../../shared/types'

// ─── System Prompts ───

const SYSTEM_PROMPTS: Record<AgentRole, string> = {
  orchestrator: [
    'You are the orchestrator agent. Your job is to coordinate the overall task.',
    'Break down the user\'s request into subtasks and monitor progress.',
    'Synthesize results from other agents into a coherent final output.',
    'You have full tool access.',
  ].join(' '),

  worker: [
    'You are a general worker agent. Execute the task assigned to you',
    'thoroughly and report your results clearly.',
  ].join(' '),

  researcher: [
    'You are a research agent. Your job is to gather information, read code,',
    'search documentation, and produce findings. Do NOT modify any files.',
    'Focus on understanding and reporting.',
  ].join(' '),

  implementer: [
    'You are an implementation agent. Your job is to write, edit, and modify code',
    'based on the task requirements. Follow existing code conventions.',
    'Run tests after making changes when possible.',
  ].join(' '),

  reviewer: [
    'You are a code review agent. Your job is to review code changes for',
    'correctness, style, performance, and security issues.',
    'Do NOT modify files — only read and report findings.',
  ].join(' '),

  custom: '',
}

// ─── Tool Restrictions ───

/** Tools that are always safe for read-only agents */
const READ_ONLY_TOOLS = [
  'Read', 'Glob', 'Grep', 'LS', 'WebSearch', 'WebFetch',
]

const ALL_TOOLS = [
  'Read', 'Glob', 'Grep', 'LS', 'Bash', 'Edit', 'Write', 'MultiEdit',
  'WebSearch', 'WebFetch',
]

const TOOL_SETS: Record<AgentRole, string[] | undefined> = {
  orchestrator: undefined,  // undefined = no restriction (full access)
  worker: undefined,
  researcher: [...READ_ONLY_TOOLS, 'Bash'],  // Bash for read-only commands
  implementer: ALL_TOOLS,
  reviewer: READ_ONLY_TOOLS,
  custom: undefined,
}

// ─── Turn Limits ───

const MAX_TURNS: Record<AgentRole, number> = {
  orchestrator: 50,
  worker: 30,
  researcher: 20,
  implementer: 40,
  reviewer: 15,
  custom: 30,
}

// ─── Public API ───

export function defaultSystemPrompt(role: AgentRole): string {
  return SYSTEM_PROMPTS[role] || ''
}

export function defaultAllowedTools(role: AgentRole): string[] | undefined {
  return TOOL_SETS[role]
}

export function defaultMaxTurns(role: AgentRole): number {
  return MAX_TURNS[role] || 30
}

/**
 * Fill missing fields in an agent definition with role-based defaults.
 */
export function applyDefaults(agent: {
  role: AgentRole
  systemPrompt?: string
  allowedTools?: string[]
  maxTurns?: number
}): { systemPrompt: string; allowedTools: string[] | undefined; maxTurns: number } {
  return {
    systemPrompt: agent.systemPrompt || defaultSystemPrompt(agent.role),
    allowedTools: agent.allowedTools ?? defaultAllowedTools(agent.role),
    maxTurns: agent.maxTurns ?? defaultMaxTurns(agent.role),
  }
}
