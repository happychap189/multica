// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  buildMentionLiteral,
  findExplicitMention,
  hasTriggeringMention,
  mentionsIn,
  triggeringMentions,
  type MentionTarget,
} from "./mentions";

const SQUAD_ID = "6b68f1f8-fd67-49a4-9f9b-591ca231741c";
const AGENT_ID = "c342d6cd-9eee-4ea2-aa96-400e8f872937";

const SQUAD: MentionTarget = { kind: "squad", name: "aidlc-阶段二-构思", id: SQUAD_ID };
const LEADER: MentionTarget = { kind: "agent", name: "aidlc-architect", id: AGENT_ID };

describe("buildMentionLiteral", () => {
  it("builds the squad literal byte-exactly", () => {
    // The literal is load-bearing: a plain-text name or a short form returns
    // HTTP 201 with zero trigger outcomes and zero tasks.
    expect(buildMentionLiteral(SQUAD)).toBe(
      `[@aidlc-阶段二-构思](mention://squad/${SQUAD_ID})`,
    );
  });

  it("builds the agent literal byte-exactly", () => {
    expect(buildMentionLiteral(LEADER)).toBe(
      `[@aidlc-architect](mention://agent/${AGENT_ID})`,
    );
  });

  it("round-trips through the parser", () => {
    const literal = buildMentionLiteral(SQUAD);
    expect(mentionsIn(literal)).toEqual([
      { label: "aidlc-阶段二-构思", kind: "squad", id: SQUAD_ID },
    ]);
  });
});

describe("findExplicitMention", () => {
  it("finds an exact target mention", () => {
    expect(findExplicitMention(`交付完成 ${buildMentionLiteral(LEADER)}`, LEADER)).toBe(true);
  });

  it("does not match a different entity id of the same kind", () => {
    const other: MentionTarget = { kind: "squad", name: "aidlc-阶段三-孵化", id: "other-id" };
    expect(findExplicitMention(buildMentionLiteral(other), SQUAD)).toBe(false);
  });

  it("does not match a different kind with the same id", () => {
    const asAgent: MentionTarget = { kind: "agent", name: "x", id: SQUAD_ID };
    expect(findExplicitMention(buildMentionLiteral(asAgent), SQUAD)).toBe(false);
  });

  it("does not count a plain-text @name", () => {
    expect(findExplicitMention("交付完成 @aidlc-architect", LEADER)).toBe(false);
  });

  it("does not count the short mention form", () => {
    expect(findExplicitMention(`交付完成 n/${AGENT_ID}`, LEADER)).toBe(false);
  });
});

describe("triggeringMentions", () => {
  it("keeps agent and squad mentions", () => {
    const body = `${buildMentionLiteral(SQUAD)} ${buildMentionLiteral(LEADER)}`;
    expect(triggeringMentions(body).map((m) => m.kind)).toEqual(["squad", "agent"]);
  });

  it("drops issue links", () => {
    const body = "[MUL-123](mention://issue/MUL-123) please review";
    expect(triggeringMentions(body)).toEqual([]);
    expect(hasTriggeringMention(body)).toBe(false);
  });

  it("drops @all", () => {
    // `@all` suppresses the implicit assignee route and is never used to
    // request work (platform notes: mentions.md).
    expect(triggeringMentions("[@all](mention://all/all)")).toEqual([]);
  });

  it("reports mention-bearing bodies", () => {
    expect(hasTriggeringMention(buildMentionLiteral(SQUAD))).toBe(true);
    expect(hasTriggeringMention("phase 交付摘要（零 mention）")).toBe(false);
  });
});
