// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@multica/core/api/client";

import { RedLineError } from "../config/red-lines";

import {
  WriteRefused,
  closeIssue,
  postMentionComment,
  reassignToMember,
  reassignToSquad,
  type ActionContext,
} from "./actions";

interface FakeApi {
  updateIssue: ReturnType<typeof vi.fn>;
  createComment: ReturnType<typeof vi.fn>;
}

function fakeApi(): { api: ApiClient; calls: FakeApi } {
  const calls: FakeApi = {
    updateIssue: vi.fn(async () => ({ id: "issue-1" })),
    createComment: vi.fn(async () => ({ id: "comment-1" })),
  };
  return { api: calls as unknown as ApiClient, calls };
}

function context(readOnly = false) {
  const { api, calls } = fakeApi();
  return { ctx: { api, readOnly } satisfies ActionContext, calls };
}

const ISSUE = "issue-1";

describe("the read-only guard", () => {
  it("refuses every write before touching the network", async () => {
    const { ctx, calls } = context(true);

    await expect(reassignToMember(ctx, ISSUE, "member-1")).rejects.toBeInstanceOf(WriteRefused);
    await expect(reassignToSquad(ctx, ISSUE, "squad-1")).rejects.toBeInstanceOf(WriteRefused);
    await expect(postMentionComment(ctx, ISSUE, "text")).rejects.toBeInstanceOf(WriteRefused);
    await expect(closeIssue(ctx, ISSUE, "done")).rejects.toBeInstanceOf(WriteRefused);

    expect(calls.updateIssue).not.toHaveBeenCalled();
    expect(calls.createComment).not.toHaveBeenCalled();
  });

  it("names the refused action in the message", async () => {
    const { ctx } = context(true);
    await expect(closeIssue(ctx, ISSUE, "done")).rejects.toThrow(/read-only/);
  });
});

describe("reassign actions", () => {
  it("reassigns to a member", async () => {
    const { ctx, calls } = context();
    await reassignToMember(ctx, ISSUE, "member-7");
    expect(calls.updateIssue).toHaveBeenCalledWith(ISSUE, {
      assignee_type: "member",
      assignee_id: "member-7",
    });
  });

  it("reassigns to a squad without touching the status", async () => {
    const { ctx, calls } = context();
    await reassignToSquad(ctx, ISSUE, "squad-5");
    expect(calls.updateIssue).toHaveBeenCalledWith(ISSUE, {
      assignee_type: "squad",
      assignee_id: "squad-5",
    });
    const body = calls.updateIssue.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("status");
  });
});

describe("postMentionComment", () => {
  it("posts an ordinary comment so the mention can fire", async () => {
    const { ctx, calls } = context();
    await postMentionComment(ctx, ISSUE, "[@x](mention://squad/s1)");
    expect(calls.createComment).toHaveBeenCalledWith(
      ISSUE,
      "[@x](mention://squad/s1)",
      "comment",
    );
  });
});

describe("closeIssue", () => {
  it("writes done", async () => {
    const { ctx, calls } = context();
    await closeIssue(ctx, ISSUE, "done");
    expect(calls.updateIssue).toHaveBeenCalledWith(ISSUE, { status: "done" });
  });

  it("refuses every other status through the red-line guard", async () => {
    for (const status of ["in_progress", "in_review", "backlog", "todo", "blocked"]) {
      const { ctx, calls } = context();
      await expect(closeIssue(ctx, ISSUE, status)).rejects.toBeInstanceOf(RedLineError);
      expect(calls.updateIssue).not.toHaveBeenCalled();
    }
  });
});
