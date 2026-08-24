import { TextSourceCodeBase, VisitNodeStep } from '@eslint/plugin-kit'

/**
 * A minimal ESLint language that treats a file as one opaque block of text.
 *
 * It exists so `supabase/**\/*.sql` can be linted by the same `garage/no-emoji`
 * rule, in the same `eslint .` run, as the TypeScript sources — rather than
 * bolting a second scanner onto the lint script and hoping CI keeps calling it.
 */

class PlainTextSourceCode extends TextSourceCodeBase {
  constructor({ text, ast }) {
    super({ text, ast })
  }

  get comments() {
    return []
  }

  getParent() {
    return undefined
  }

  *traverse() {
    yield new VisitNodeStep({ target: this.ast, phase: 1, args: [this.ast] })
    yield new VisitNodeStep({ target: this.ast, phase: 2, args: [this.ast] })
  }
}

export const plainText = {
  fileType: 'text',
  lineStart: 1,
  columnStart: 0,
  nodeTypeKey: 'type',
  visitorKeys: { Document: [] },

  validateLanguageOptions() {
    // No options to validate.
  },

  parse(file) {
    const text = String(file.body)
    const lines = text.split(/\r?\n/u)

    return {
      ok: true,
      ast: {
        type: 'Document',
        range: [0, text.length],
        loc: {
          start: { line: 1, column: 0 },
          end: { line: lines.length, column: lines[lines.length - 1].length },
        },
      },
    }
  },

  createSourceCode(file, parseResult) {
    return new PlainTextSourceCode({
      text: String(file.body),
      ast: parseResult.ast,
    })
  },
}
