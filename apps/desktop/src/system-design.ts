/**
 * Runtime-facing entry point for the shared desktop design tokens.
 *
 * The CSS consumed by the app lives in design-system/tokens.css; keeping this
 * re-export means React specimens and non-CSS consumers use the same values.
 */
export { systemDesignTokens } from '../design-system/tokens';
export type { DesignTokens } from '../design-system/tokens';
