/**
 * In-memory per-conversation retry counter.
 * Tracks how many consecutive failed routing attempts have occurred
 * for each active call session.
 */

const retryMap = new Map<string, number>();

/**
 * Get the current retry count for a conversation.
 */
export function getRetryCount(conversationId: string): number {
  return retryMap.get(conversationId) ?? 0;
}

/**
 * Increment the retry count for a conversation and return the new value.
 */
export function incrementRetry(conversationId: string): number {
  const current = getRetryCount(conversationId) + 1;
  retryMap.set(conversationId, current);
  return current;
}

/**
 * Reset the retry count for a conversation (e.g. on hangup or successful routing).
 */
export function resetRetry(conversationId: string): void {
  retryMap.delete(conversationId);
}

/**
 * Clean up stale entries periodically to prevent memory leaks.
 */
setInterval(() => {
  retryMap.clear();
}, 30 * 60 * 1000); // every 30 minutes