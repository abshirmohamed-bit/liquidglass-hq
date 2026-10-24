/**
 * What a headline and a description are for.
 *
 * Both are read in the half second before someone decides whether to keep
 * watching, so both have to earn that half second rather than summarise what
 * the viewer could already see. The Engine's finder carries the same rule in
 * Python for the headlines it writes during a job; this is the app's copy,
 * for the rewrites a creator asks for afterwards.
 */
export const HOOK_RULES =
  "Open a question the clip answers, name the stake, or lead with the line that makes " +
  "someone stop scrolling. Draw it from what is actually said — never promise something " +
  'the clip does not deliver, and no ALL CAPS or "you won\'t believe".';

/** A headline is read off the video itself, so it has to be short and plain. */
export const HEADLINE_RULES =
  `${HOOK_RULES} It is burned onto the clip, so keep it under 60 characters, ` +
  "no quotation marks and no trailing full stop.";
