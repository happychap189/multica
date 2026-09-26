import type { Agent, RuntimeLocalSkillSummary } from "../types";

/**
 * Client-side replica of the daemon's skill slug pipeline (see
 * server/internal/daemon/execenv/context.go `sanitizeSkillName` and
 * skill_visibility.go `resolveSkillSlugs`) — the slash menu lists the same
 * command names the runtime resolves on disk. Host-side directory collisions
 * stay unknowable from the client, so mounted labels remain a display
 * approximation.
 */

// ASCII-only fold, matching the daemon's `[^a-z0-9]+` regex: only ASCII
// lowercase letters and digits survive; every other maximal run — including
// non-ASCII letters — becomes a single hyphen.
const NON_ALPHANUMERIC = /[^a-z0-9]+/g;

/**
 * Port of the daemon's sanitizeSkillName: lowercase, fold every run of
 * non-[a-z0-9] characters into one hyphen, trim hyphens, and fall back to
 * "skill" when nothing survives.
 */
export function sanitizeSkillSlug(name: string): string {
  let s = name.trim().toLowerCase().replace(NON_ALPHANUMERIC, "-");
  s = s.replace(/^-+|-+$/g, "");
  return s === "" ? "skill" : s;
}

// The nth fallback for a natural slug: the bare slug, then `-multica`, then
// numbered variants. Mirrors execenv skillSlugCandidate so a collision shown
// here reads like the directory the daemon actually allocates.
function skillSlugCandidate(baseSlug: string, attempt: number): string {
  if (attempt <= 0) {
    return baseSlug;
  }
  if (attempt === 1) {
    return `${baseSlug}-multica`;
  }
  return `${baseSlug}-multica-${attempt}`;
}

/**
 * Port of the daemon's resolveSkillSlugs: deterministic in input order, and
 * batch-internal collisions get `-multica` / `-multica-<n>` suffixes so two
 * skills never claim the same command name.
 */
export function resolveMountedSkillSlugs(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const base = sanitizeSkillSlug(name);
    let slug = base;
    for (let attempt = 1; taken.has(slug); attempt++) {
      slug = skillSlugCandidate(base, attempt);
    }
    taken.add(slug);
    return slug;
  });
}

export type AgentCommandEntry = {
  id: string;
  label: string;
  description?: string;
  source: "mounted" | "runtime";
  plugin?: string;
};

export type AgentCommandGroup = {
  agentId: string;
  agentName: string;
  /**
   * Runtime whose local-skill enumeration feeds source C — carried through to
   * the menu so a degraded group's retry control can target the right query.
   */
  runtimeId: string;
  degraded: boolean;
  /** True while the runtime enumeration is in flight (header loading state). */
  pending?: boolean;
  items: AgentCommandEntry[];
};

const RESERVED_NOTE_SLUG = sanitizeSkillSlug("note");

/**
 * Joins each agent's mounted skills (source A) with its runtime's local
 * skills (source C) into one command group. `input.agents` arrives
 * pre-filtered by the caller — mentioned, runtime-bound, assignable — this
 * function only joins.
 *
 * Runtime entries win same-name collisions because their key is the name the
 * CLI actually answers to; labels normalizing to the reserved `note` command
 * are dropped from both sources. `degraded` marks an agent whose runtime
 * enumeration is absent from the cache; its mounted items still emit.
 */
export function buildAgentCommandCatalog(input: {
  agents: Agent[];
  runtimeSkillsByRuntime: Map<string, RuntimeLocalSkillSummary[]>;
}): AgentCommandGroup[] {
  return input.agents.map((agent) => {
    const runtimeSkills = input.runtimeSkillsByRuntime.get(agent.runtime_id);
    const degraded = runtimeSkills === undefined;

    const disabledKeys = new Set(
      (agent.disabled_runtime_skills ?? [])
        .filter((disabled) => disabled.runtime_id === agent.runtime_id)
        .map((disabled) => disabled.key),
    );

    const runtimeItems: AgentCommandEntry[] = [];
    const runtimeLabels = new Set<string>();
    for (const skill of runtimeSkills ?? []) {
      if (
        disabledKeys.has(skill.key) ||
        sanitizeSkillSlug(skill.key) === RESERVED_NOTE_SLUG
      ) {
        continue;
      }
      const normalized = sanitizeSkillSlug(skill.key);
      if (runtimeLabels.has(normalized)) {
        continue;
      }
      runtimeLabels.add(normalized);
      runtimeItems.push({
        id: skill.key,
        label: skill.key,
        description: skill.description,
        source: "runtime",
        plugin: skill.plugin,
      });
    }

    // The daemon's slug batch already excludes disabled mounts — the
    // agent_skill junction filters enabled = TRUE upstream of execenv — so
    // resolving over the enabled subset lands on the daemon's exact suffixes.
    const mountedSkills = (agent.skills ?? []).filter(
      (skill) => skill.enabled !== false,
    );
    const slugs = resolveMountedSkillSlugs(
      mountedSkills.map((skill) => skill.name),
    );
    const mountedItems: AgentCommandEntry[] = [];
    for (const [i, skill] of mountedSkills.entries()) {
      // Index-aligned with slugs by construction.
      const label = slugs[i];
      if (
        label === undefined ||
        sanitizeSkillSlug(label) === RESERVED_NOTE_SLUG ||
        runtimeLabels.has(label)
      ) {
        continue;
      }
      mountedItems.push({
        id: skill.id,
        label,
        description: skill.description,
        source: "mounted",
      });
    }

    return {
      agentId: agent.id,
      agentName: agent.name,
      runtimeId: agent.runtime_id,
      degraded,
      items: [...mountedItems, ...runtimeItems],
    };
  });
}
