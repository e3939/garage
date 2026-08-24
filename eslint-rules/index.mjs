import noEmoji from './no-emoji.mjs'
import { plainText } from './plain-text-language.mjs'

/** Project-local ESLint plugin. Rules that enforce CLAUDE.md, nothing generic. */
export const garagePlugin = {
  meta: { name: 'eslint-plugin-garage', version: '0.1.0' },
  rules: { 'no-emoji': noEmoji },
  languages: { text: plainText },
}

export default garagePlugin
