import type { Comment } from "@multica/core/types/comment";

import { findAnchor } from "./anchor";
import type { AnchorOccurrence } from "./slots";

/**
 * Build anchor occurrences from the issue timeline.
 *
 * Two details the scanner must not get wrong (both measured in real runs):
 *   - anchors may be posted as in-thread replies, not only as top-level
 *     comments, so replies are scanned too;
 *   - a comment's `created_at` orders "latest", and the input order breaks ties
 *     — `summarizeSlots` relies on that.
 */

export function anchorOccurrencesFrom(comments: readonly Comment[]): AnchorOccurrence[] {
  const occurrences: AnchorOccurrence[] = [];
  for (const comment of comments) {
    const anchor = findAnchor(comment.content);
    if (!anchor) continue;
    occurrences.push({
      anchor,
      commentId: comment.id,
      createdAt: comment.created_at,
      isReply: comment.parent_id !== null,
    });
  }
  return occurrences;
}

/** Epoch milliseconds of the newest comment, or null for an empty timeline. */
export function newestCommentAt(comments: readonly Comment[]): number | null {
  let newest: number | null = null;
  for (const comment of comments) {
    const at = Date.parse(comment.created_at);
    if (Number.isNaN(at)) continue;
    if (newest === null || at > newest) newest = at;
  }
  return newest;
}

/** Comments posted after `commentId`, in timeline order. Null id yields all. */
export function commentsAfter(
  comments: readonly Comment[],
  commentId: string | null,
): readonly Comment[] {
  if (commentId === null) return comments;
  const index = comments.findIndex((comment) => comment.id === commentId);
  return index === -1 ? comments : comments.slice(index + 1);
}
