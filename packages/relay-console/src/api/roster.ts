import type { ApiClient } from "@multica/core/api/client";

import type { MentionKind, MentionTarget } from "../relay/mentions";

/**
 * Name → id resolution for the entities a relay mentions.
 *
 * Ids are only ever taken from the API. Hand-written ids are the protocol's
 * most expensive failure mode: about 6% of hand-typed dispatches in the DEMO
 * runs carried a plausible-looking but wrong uuid, which the server accepts with
 * HTTP 201 and then silently drops as `target_unavailable` — no error, no task.
 *
 * Squad names are not unique on this platform (migration 087), so an ambiguous
 * name is refused rather than resolved by picking one.
 */

export interface RosterEntry {
  readonly kind: MentionKind;
  readonly name: string;
  readonly id: string;
  readonly description: string;
}

/** Marks the relay's own generation of squads in their description. */
const RELAY_MARKER = "aidlc-relay:";

export class RosterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RosterError";
  }
}

export class Roster {
  private readonly squadsByName = new Map<string, RosterEntry[]>();
  private readonly agentsByName = new Map<string, RosterEntry>();
  private readonly agentsById = new Map<string, RosterEntry>();
  private readonly squadsById = new Map<string, RosterEntry>();
  private readonly squadLeaderIds = new Map<string, string>();

  private constructor(
    squads: readonly RosterEntry[],
    agents: readonly RosterEntry[],
    leaderIds: ReadonlyMap<string, string>,
  ) {
    for (const squad of squads) {
      this.squadsById.set(squad.id, squad);
      const bucket = this.squadsByName.get(squad.name);
      if (bucket) bucket.push(squad);
      else this.squadsByName.set(squad.name, [squad]);
    }
    for (const agent of agents) {
      this.agentsByName.set(agent.name, agent);
      this.agentsById.set(agent.id, agent);
    }
    this.squadLeaderIds = new Map(leaderIds);
  }

  static async load(api: ApiClient, workspaceId: string): Promise<Roster> {
    const [squads, agents] = await Promise.all([
      api.listSquads(),
      api.listAgents({ workspace_id: workspaceId }),
    ]);

    const squadEntries: RosterEntry[] = squads.map((squad) => ({
      kind: "squad",
      name: squad.name,
      id: squad.id,
      description: squad.description ?? "",
    }));
    const agentEntries: RosterEntry[] = agents.map((agent) => ({
      kind: "agent",
      name: agent.name,
      id: agent.id,
      description: agent.description ?? "",
    }));

    const leaderIds = new Map<string, string>();
    for (const squad of squads) {
      if (squad.leader_id) leaderIds.set(squad.id, squad.leader_id);
    }
    return new Roster(squadEntries, agentEntries, leaderIds);
  }

  squad(name: string): RosterEntry {
    const candidates = this.squadsByName.get(name) ?? [];
    if (candidates.length === 0) {
      throw new RosterError(`no squad named '${name}' in this workspace`);
    }
    if (candidates.length > 1) {
      // Names repeat across imports; the relay's own generation carries the
      // marker in its description. Only fall through when that disambiguates
      // to exactly one.
      const marked = candidates.filter((entry) => entry.description.includes(RELAY_MARKER));
      if (marked.length === 1 && marked[0]) return marked[0];
      throw new RosterError(
        `squad name '${name}' is ambiguous (${candidates.length} matches) — refusing to guess`,
      );
    }
    const only = candidates[0];
    if (!only) throw new RosterError(`no squad named '${name}' in this workspace`);
    return only;
  }

  agent(name: string): RosterEntry {
    const entry = this.agentsByName.get(name);
    if (!entry) throw new RosterError(`no agent named '${name}' in this workspace`);
    return entry;
  }

  agentById(id: string): RosterEntry | undefined {
    return this.agentsById.get(id);
  }

  squadById(id: string): RosterEntry | undefined {
    return this.squadsById.get(id);
  }

  /** The leader agent of a squad, resolved through the squad's `leader_id`. */
  leaderOfSquad(squadName: string): RosterEntry {
    const squad = this.squad(squadName);
    const leaderId = this.squadLeaderIds.get(squad.id);
    if (!leaderId) {
      throw new RosterError(`squad '${squadName}' has no leader bound`);
    }
    const leader = this.agentsById.get(leaderId);
    if (!leader) {
      throw new RosterError(
        `squad '${squadName}' points at leader ${leaderId}, which is not in this workspace's agents`,
      );
    }
    return leader;
  }

  /** Every entry, for diagnostics and probes. */
  allSquads(): readonly RosterEntry[] {
    return [...this.squadsById.values()];
  }

  allAgents(): readonly RosterEntry[] {
    return [...this.agentsById.values()];
  }
}

/** A mention target built from a roster entry — the only safe way to build one. */
export function targetOf(entry: RosterEntry): MentionTarget {
  return { kind: entry.kind, name: entry.name, id: entry.id };
}
