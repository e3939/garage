/**
 * Fails on any emoji codepoint. Non-negotiable #1 in CLAUDE.md: iconography
 * comes from Phosphor, and an emoji in a string is a design regression that
 * ships to production because nobody reads seed data in review.
 *
 * The check runs over the raw file text rather than the AST, so it catches
 * emoji in comments, JSX text, template literals and SQL alike.
 */

/**
 * Extended_Pictographic covers the emoji blocks; Emoji_Presentation catches the
 * few that render as emoji by default without being pictographic; the regional
 * indicator range covers flags, which are pairs of otherwise-plain letters.
 *
 * Deliberately not \p{Emoji}: that property matches ASCII digits and `#`.
 */
const EMOJI_PATTERN =
  /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}]/gu

/**
 * Typographic marks that Unicode classifies as pictographic but which are text,
 * not iconography. Flagging a copyright sign helps nobody.
 */
const ALLOWED = new Set(['©', '®', '™'])

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow emoji codepoints anywhere in the source',
    },
    schema: [],
    messages: {
      emoji:
        'Emoji are not allowed ({{codepoint}}). Use an icon from components/icons instead.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode

    function check(node) {
      const text = sourceCode.text
      EMOJI_PATTERN.lastIndex = 0

      let match
      while ((match = EMOJI_PATTERN.exec(text)) !== null) {
        const character = match[0]
        if (ALLOWED.has(character)) continue

        const codepoint = `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`

        context.report({
          node,
          loc: {
            start: sourceCode.getLocFromIndex(match.index),
            end: sourceCode.getLocFromIndex(match.index + character.length),
          },
          messageId: 'emoji',
          data: { codepoint },
        })
      }
    }

    // `Program` is the JavaScript/TypeScript root; `Document` is the root of
    // the plain-text language used for .sql files.
    return { Program: check, Document: check }
  },
}

export default rule
