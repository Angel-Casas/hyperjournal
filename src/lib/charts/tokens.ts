/**
 * Hardcoded HSL values from src/styles/globals.css, consumed by ECharts
 * option objects. ECharts takes JS values, not Tailwind classes — this is
 * the documented exception to CONVENTIONS.md §5's no-raw-HSL rule for
 * chart components. When the palette in globals.css changes, update this
 * file in the same commit; future chart components import from here
 * rather than redeclaring their own TOKEN const.
 */
export const CHART_TOKENS = {
  bgBase: 'hsl(220 13% 6%)', // --bg-base
  bgRaised: 'hsl(220 12% 9%)', // --bg-raised
  bgOverlay: 'hsl(220 12% 12%)', // --bg-overlay
  fgBase: 'hsl(210 20% 96%)', // --fg-base
  fgMuted: 'hsl(215 16% 72%)', // --fg-muted
  border: 'hsl(220 10% 18%)', // --border
  borderStrong: 'hsl(220 10% 26%)', // --border-strong
  gain: 'hsl(152 76% 50%)', // --gain
  gainFade0: 'hsl(152 76% 50% / 0.4)',
  gainFade1: 'hsl(152 76% 50% / 0)',
  loss: 'hsl(357 80% 60%)', // --loss
};
