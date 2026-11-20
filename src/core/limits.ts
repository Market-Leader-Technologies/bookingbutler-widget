/**
 * What the BookingButler server accepts from a page. Checked here so a page's
 * author hears about a mistake by name, in their own console, before the
 * server refuses it.
 */

/** Pictures one tool result may carry. */
export const MAX_IMAGES_PER_RESULT = 4;

/** Each picture's size once decoded: 3 MB. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** The picture types the agent reads. */
export const IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

/**
 * The longest side worth sending. A larger picture reads no better and
 * costs more, so `toHostImage` scales down to this by default.
 */
export const RECOMMENDED_MAX_SIDE = 1568;

/**
 * How many of its most recent pictures the agent is shown. Attach one when
 * the picture matters, not on every call.
 */
export const IMAGES_THE_AGENT_SEES = 3;

/** `setContext` data, as JSON: at most 4 KB. */
export const MAX_CONTEXT_BYTES = 4 * 1024;

/** Tools one page may offer. */
export const MAX_HOST_TOOLS = 20;

/** A tool's name: lowercase letters, digits and underscores, at most 48. */
export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{0,47}$/;
