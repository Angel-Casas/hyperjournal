import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'hsl(var(--bg-base) / <alpha-value>)',
          raised: 'hsl(var(--bg-raised) / <alpha-value>)',
          overlay: 'hsl(var(--bg-overlay) / <alpha-value>)',
        },
        fg: {
          base: 'hsl(var(--fg-base) / <alpha-value>)',
          muted: 'hsl(var(--fg-muted) / <alpha-value>)',
          subtle: 'hsl(var(--fg-subtle) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'hsl(var(--border) / <alpha-value>)',
          strong: 'hsl(var(--border-strong) / <alpha-value>)',
        },
        gain: 'hsl(var(--gain) / <alpha-value>)',
        loss: 'hsl(var(--loss) / <alpha-value>)',
        risk: 'hsl(var(--risk) / <alpha-value>)',
        neutral: 'hsl(var(--neutral) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['InterVariable', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
      },
    },
  },
  plugins: [],
};

export default config;
