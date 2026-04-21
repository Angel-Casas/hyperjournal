# Phase 1 Session 1 — Scaffold & Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay a production-grade Vite + React + TypeScript-strict foundation with Tailwind dark-first tokens, a split-home route shell, PWA scaffold for GitHub Pages, import-boundary-enforcing ESLint, and a working Vitest TDD loop proven by one real domain function — ready for Session 2 to plug in Hyperliquid ingestion.

**Architecture:** Frontend-only PWA. `app/` bootstraps providers and routes; `features/*` own screen-level logic; `domain/` holds pure functions; `lib/*` holds cross-cutting concerns. Dark-first Tailwind with semantic gain/loss/risk/neutral tokens. React Router v6 `BrowserRouter` with a `basename` tied to `import.meta.env.BASE_URL` (so the same code runs locally at `/` and on GH Pages at `/<repo>/`). Zustand for non-addressable UI state; TanStack Query installed but only the provider is wired this session. Import boundaries enforced by `eslint-plugin-boundaries`.

**Tech Stack:** pnpm, Vite 5, React 18, TypeScript 5 (strict), Tailwind CSS 3, Framer Motion, React Router v6, TanStack Query v5, Zustand v4, vite-plugin-pwa, ESLint 8 (flat config) + `eslint-plugin-boundaries`, Prettier, Vitest + React Testing Library + jsdom.

---

## File structure (what exists at end of session)

```
HyperJournal/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── .gitignore
├── .prettierrc
├── CLAUDE.md                        (existing)
├── docs/                            (existing)
├── eslint.config.js
├── index.html
├── package.json
├── pnpm-lock.yaml
├── postcss.config.js
├── public/
│   ├── 404.html                     (GH Pages SPA fallback)
│   ├── favicon.svg
│   └── icons/                       (PWA icons, placeholder)
├── src/
│   ├── app/
│   │   ├── App.tsx                  (providers + <RouterProvider />)
│   │   ├── routes.tsx               (route tree)
│   │   └── providers.tsx            (QueryClientProvider, etc.)
│   ├── features/
│   │   ├── analytics/
│   │   │   ├── index.ts
│   │   │   └── components/
│   │   │       └── AnalyticsPanel.tsx
│   │   ├── journal/
│   │   │   ├── index.ts
│   │   │   └── components/
│   │   │       └── JournalPanel.tsx
│   │   ├── wallets/
│   │   │   └── index.ts             (empty public surface; real impl in Session 2)
│   │   └── home/
│   │       ├── index.ts
│   │       └── components/
│   │           └── SplitHome.tsx
│   ├── domain/
│   │   └── wallets/
│   │       ├── isValidWalletAddress.ts
│   │       └── isValidWalletAddress.test.ts
│   ├── entities/
│   │   └── wallet.ts                (WalletAddress branded type)
│   ├── lib/
│   │   └── ui/
│   │       └── tokens.ts            (exported token names for IDE autocompletion)
│   ├── state/
│   │   └── ui-store.ts              (Zustand bootstrap)
│   ├── styles/
│   │   └── globals.css              (Tailwind directives + CSS vars)
│   ├── main.tsx
│   └── vite-env.d.ts
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── vitest.config.ts
```

---

## Conventions used throughout this plan

- Every `pnpm` command runs from repo root: `/Users/angel/Documents/HyperJournal`.
- Every file path is given absolute from repo root.
- Every command shows expected output. If actual output differs, stop and diagnose before proceeding — do not "push through".
- Commits are small. One task = one commit unless otherwise noted. Commit messages use imperative mood (`CONVENTIONS.md` §10).
- Pinned versions in install commands. Do not use `latest` — reproducibility matters.

---

## Task 1: Verify prerequisites and initialize repo

**Files:**

- Create: `.gitignore`

- [ ] **Step 1.1: Check Node and pnpm versions**

Run: `node -v && pnpm -v`
Expected: Node ≥ 20.11 and pnpm ≥ 9.0. If either is missing/older, stop and ask the user to install/upgrade before continuing.

- [ ] **Step 1.2: Initialize git repository if not already**

Run: `git init -b main 2>/dev/null || true; git status`
Expected: either a fresh repo on `main` or existing repo reporting untracked `CLAUDE.md` and `docs/`.

- [ ] **Step 1.3: Write `.gitignore`**

Create `/Users/angel/Documents/HyperJournal/.gitignore`:

```gitignore
node_modules/
dist/
dist-ssr/
coverage/
.vite/
*.local
.env
.env.*
!.env.example

# Editor & OS
.DS_Store
.vscode/*
!.vscode/extensions.json
.idea/

# Build & test artifacts
playwright-report/
test-results/
*.tsbuildinfo
```

- [ ] **Step 1.4: Commit**

```bash
git add .gitignore
git commit -m "chore: add gitignore for Node/Vite project"
```

---

## Task 2: Scaffold Vite + React + TS and customize package.json

**Files:**

- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/vite-env.d.ts`

- [ ] **Step 2.1: Run Vite scaffold into a temp directory and move useful files out**

```bash
cd /tmp
pnpm create vite@5.5.3 hj-scaffold --template react-ts
```

Expected: creates `/tmp/hj-scaffold/` with Vite's standard React-TS template. If prompted for anything interactive, the create command should accept the defaults because both arguments are provided.

```bash
cp /tmp/hj-scaffold/index.html /Users/angel/Documents/HyperJournal/
cp /tmp/hj-scaffold/src/vite-env.d.ts /Users/angel/Documents/HyperJournal/src/ 2>/dev/null || mkdir -p /Users/angel/Documents/HyperJournal/src && cp /tmp/hj-scaffold/src/vite-env.d.ts /Users/angel/Documents/HyperJournal/src/
rm -rf /tmp/hj-scaffold
```

- [ ] **Step 2.2: Write `package.json`**

Create `/Users/angel/Documents/HyperJournal/package.json`:

```json
{
  "name": "hyperjournal",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20.11"
  },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "@tanstack/react-query": "5.56.2",
    "framer-motion": "11.11.1",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "6.26.2",
    "zustand": "4.5.5"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.5.0",
    "@testing-library/react": "16.0.1",
    "@testing-library/user-event": "14.5.2",
    "@types/node": "20.16.10",
    "@types/react": "18.3.11",
    "@types/react-dom": "18.3.0",
    "@typescript-eslint/eslint-plugin": "8.8.1",
    "@typescript-eslint/parser": "8.8.1",
    "@vitejs/plugin-react": "4.3.2",
    "@vitest/coverage-v8": "2.1.2",
    "autoprefixer": "10.4.20",
    "eslint": "8.57.1",
    "eslint-plugin-boundaries": "4.2.2",
    "eslint-plugin-react-hooks": "4.6.2",
    "eslint-plugin-react-refresh": "0.4.12",
    "jsdom": "25.0.1",
    "postcss": "8.4.47",
    "prettier": "3.3.3",
    "tailwindcss": "3.4.13",
    "typescript": "5.6.2",
    "vite": "5.4.8",
    "vite-plugin-pwa": "0.20.5",
    "vitest": "2.1.2"
  }
}
```

- [ ] **Step 2.3: Write `tsconfig.json`**

Create `/Users/angel/Documents/HyperJournal/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "useDefineForClassFields": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "baseUrl": "./src",
    "paths": {
      "@app/*": ["app/*"],
      "@features/*": ["features/*"],
      "@domain/*": ["domain/*"],
      "@entities/*": ["entities/*"],
      "@lib/*": ["lib/*"],
      "@state/*": ["state/*"],
      "@styles/*": ["styles/*"]
    },
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vitest.config.ts", "vite.config.ts", "tailwind.config.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2.4: Write `tsconfig.node.json`**

Create `/Users/angel/Documents/HyperJournal/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["vite.config.ts", "vitest.config.ts", "tailwind.config.ts", "postcss.config.js"]
}
```

- [ ] **Step 2.5: Write `vite.config.ts`**

Create `/Users/angel/Documents/HyperJournal/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'HyperJournal',
        short_name: 'HyperJournal',
        description: 'Local-first Hyperliquid trading analytics and journaling PWA',
        theme_color: '#0b0d10',
        background_color: '#0b0d10',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@entities': path.resolve(__dirname, 'src/entities'),
      '@lib': path.resolve(__dirname, 'src/lib'),
      '@state': path.resolve(__dirname, 'src/state'),
      '@styles': path.resolve(__dirname, 'src/styles'),
    },
  },
});
```

- [ ] **Step 2.6: Write `index.html`**

Overwrite `/Users/angel/Documents/HyperJournal/index.html`:

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0b0d10" />
    <title>HyperJournal</title>
  </head>
  <body class="bg-bg-base text-fg-base antialiased">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2.7: Write `src/main.tsx`**

Create `/Users/angel/Documents/HyperJournal/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@app/App';
import '@styles/globals.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found in index.html');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 2.8: Install dependencies**

Run: `pnpm install`
Expected: lockfile `pnpm-lock.yaml` created, `node_modules/` populated, no peer warnings that block install.

- [ ] **Step 2.9: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsconfig.node.json vite.config.ts index.html src/main.tsx src/vite-env.d.ts
git commit -m "chore: scaffold Vite + React + TS strict project with pinned deps"
```

---

## Task 3: Tailwind with dark-first semantic tokens

**Files:**

- Create: `postcss.config.js`, `tailwind.config.ts`, `src/styles/globals.css`, `src/lib/ui/tokens.ts`

- [ ] **Step 3.1: Write `postcss.config.js`**

Create `/Users/angel/Documents/HyperJournal/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3.2: Write `tailwind.config.ts`**

Create `/Users/angel/Documents/HyperJournal/tailwind.config.ts`:

```ts
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
```

- [ ] **Step 3.3: Write `src/styles/globals.css`**

Create `/Users/angel/Documents/HyperJournal/src/styles/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --bg-base: 220 13% 6%;
    --bg-raised: 220 12% 9%;
    --bg-overlay: 220 12% 12%;

    --fg-base: 210 20% 96%;
    --fg-muted: 215 16% 72%;
    --fg-subtle: 217 12% 50%;

    --border: 220 10% 18%;
    --border-strong: 220 10% 26%;

    --gain: 152 76% 50%;
    --loss: 357 80% 60%;
    --risk: 35 95% 58%;
    --neutral: 215 16% 72%;
    --accent: 262 82% 68%;
  }

  html,
  body,
  #root {
    height: 100%;
  }

  body {
    font-family: theme('fontFamily.sans');
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }
}
```

- [ ] **Step 3.4: Write `src/lib/ui/tokens.ts`**

Create `/Users/angel/Documents/HyperJournal/src/lib/ui/tokens.ts`:

```ts
export const semanticColor = {
  gain: 'text-gain',
  loss: 'text-loss',
  risk: 'text-risk',
  neutral: 'text-neutral',
} as const;

export type SemanticColor = keyof typeof semanticColor;
```

- [ ] **Step 3.5: Commit**

```bash
git add postcss.config.js tailwind.config.ts src/styles/globals.css src/lib/ui/tokens.ts
git commit -m "feat(ui): configure Tailwind with dark-first semantic design tokens"
```

---

## Task 4: App shell — providers, router, split home route

**Files:**

- Create: `src/app/App.tsx`, `src/app/providers.tsx`, `src/app/routes.tsx`, `src/state/ui-store.ts`, `src/features/home/index.ts`, `src/features/home/components/SplitHome.tsx`, `src/features/analytics/index.ts`, `src/features/analytics/components/AnalyticsPanel.tsx`, `src/features/journal/index.ts`, `src/features/journal/components/JournalPanel.tsx`, `src/features/wallets/index.ts`

- [ ] **Step 4.1: Write `src/state/ui-store.ts`**

Create `/Users/angel/Documents/HyperJournal/src/state/ui-store.ts`:

```ts
import { create } from 'zustand';

type Theme = 'dark';

type UiState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

export const useUiStore = create<UiState>((set) => ({
  theme: 'dark',
  setTheme: (theme) => set({ theme }),
}));
```

- [ ] **Step 4.2: Write `src/app/providers.tsx`**

Create `/Users/angel/Documents/HyperJournal/src/app/providers.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

type Props = { children: ReactNode };

export function AppProviders({ children }: Props) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 4.3: Write `src/features/analytics/components/AnalyticsPanel.tsx`**

Create `/Users/angel/Documents/HyperJournal/src/features/analytics/components/AnalyticsPanel.tsx`:

```tsx
type Props = { compact?: boolean };

export function AnalyticsPanel({ compact = true }: Props) {
  return (
    <section
      aria-labelledby="analytics-heading"
      className="flex h-full flex-col rounded-lg border border-border bg-bg-raised p-6"
    >
      <header className="mb-4">
        <h2 id="analytics-heading" className="text-lg font-semibold text-fg-base">
          Trading analytics
        </h2>
        <p className="text-sm text-fg-muted">
          {compact
            ? 'Paste a Hyperliquid wallet address to see performance, calendar, and key metrics.'
            : 'Expanded analytics view — populated in Session 4.'}
        </p>
      </header>
      <div className="flex flex-1 items-center justify-center text-fg-subtle">
        <span className="font-mono text-xs uppercase tracking-wider">Empty state</span>
      </div>
    </section>
  );
}
```

- [ ] **Step 4.4: Write `src/features/analytics/index.ts`**

Create `/Users/angel/Documents/HyperJournal/src/features/analytics/index.ts`:

```ts
export { AnalyticsPanel } from './components/AnalyticsPanel';
```

- [ ] **Step 4.5: Write `src/features/journal/components/JournalPanel.tsx`**

Create `/Users/angel/Documents/HyperJournal/src/features/journal/components/JournalPanel.tsx`:

```tsx
type Props = { compact?: boolean };

export function JournalPanel({ compact = true }: Props) {
  return (
    <section
      aria-labelledby="journal-heading"
      className="flex h-full flex-col rounded-lg border border-border bg-bg-raised p-6"
    >
      <header className="mb-4">
        <h2 id="journal-heading" className="text-lg font-semibold text-fg-base">
          Journal & coaching
        </h2>
        <p className="text-sm text-fg-muted">
          {compact
            ? 'Recent notes, strategies, and coaching prompts will appear here.'
            : 'Expanded journal view — populated in Session 5.'}
        </p>
      </header>
      <div className="flex flex-1 items-center justify-center text-fg-subtle">
        <span className="font-mono text-xs uppercase tracking-wider">Empty state</span>
      </div>
    </section>
  );
}
```

- [ ] **Step 4.6: Write `src/features/journal/index.ts`**

Create `/Users/angel/Documents/HyperJournal/src/features/journal/index.ts`:

```ts
export { JournalPanel } from './components/JournalPanel';
```

- [ ] **Step 4.7: Write `src/features/home/components/SplitHome.tsx`**

Create `/Users/angel/Documents/HyperJournal/src/features/home/components/SplitHome.tsx`:

```tsx
import { AnalyticsPanel } from '@features/analytics';
import { JournalPanel } from '@features/journal';

export function SplitHome() {
  return (
    <main className="grid h-[100dvh] grid-cols-1 gap-4 bg-bg-base p-4 md:grid-cols-2">
      <AnalyticsPanel />
      <JournalPanel />
    </main>
  );
}
```

- [ ] **Step 4.8: Write `src/features/home/index.ts`**

Create `/Users/angel/Documents/HyperJournal/src/features/home/index.ts`:

```ts
export { SplitHome } from './components/SplitHome';
```

- [ ] **Step 4.9: Write `src/features/wallets/index.ts`** (empty surface, real impl in Session 2)

Create `/Users/angel/Documents/HyperJournal/src/features/wallets/index.ts`:

```ts
// Session 2 will populate this feature. Keeping an empty public surface so
// imports referencing '@features/wallets' resolve without a TS error.
export {};
```

- [ ] **Step 4.10: Write `src/app/routes.tsx`**

Create `/Users/angel/Documents/HyperJournal/src/app/routes.tsx`:

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { SplitHome } from '@features/home';

const router = createBrowserRouter([{ path: '/', element: <SplitHome /> }], {
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
});

export function AppRouter() {
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 4.11: Write `src/app/App.tsx`**

Create `/Users/angel/Documents/HyperJournal/src/app/App.tsx`:

```tsx
import { AppProviders } from './providers';
import { AppRouter } from './routes';

export function App() {
  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
```

- [ ] **Step 4.12: Run dev server and confirm split home renders**

Run: `pnpm dev`
Expected: server starts on `http://localhost:5173/`. Open the URL manually — two panels with dark backgrounds, "Trading analytics" and "Journal & coaching" headings, "Empty state" text, no console errors. Kill the dev server with Ctrl-C.

- [ ] **Step 4.13: Run typecheck**

Run: `pnpm typecheck`
Expected: exit 0, no type errors.

- [ ] **Step 4.14: Commit**

```bash
git add src/
git commit -m "feat(app): add provider shell, router, and split-home route with empty panels"
```

---

## Task 5: ESLint (flat config) + Prettier + import boundaries

**Files:**

- Create: `eslint.config.js`, `.prettierrc`, `.prettierignore`

- [ ] **Step 5.1: Write `.prettierrc`**

Create `/Users/angel/Documents/HyperJournal/.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

- [ ] **Step 5.2: Write `.prettierignore`**

Create `/Users/angel/Documents/HyperJournal/.prettierignore`:

```
dist
coverage
node_modules
pnpm-lock.yaml
```

- [ ] **Step 5.3: Write `eslint.config.js`**

Create `/Users/angel/Documents/HyperJournal/eslint.config.js`. This file enforces the CLAUDE.md §4 import boundaries:

```js
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import boundaries from 'eslint-plugin-boundaries';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/**' },
        { type: 'feature', pattern: 'src/features/*/**', capture: ['feature'] },
        { type: 'domain', pattern: 'src/domain/**' },
        { type: 'entities', pattern: 'src/entities/**' },
        { type: 'lib', pattern: 'src/lib/**' },
        { type: 'state', pattern: 'src/state/**' },
        { type: 'styles', pattern: 'src/styles/**' },
      ],
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'app', allow: ['feature', 'domain', 'entities', 'lib', 'state', 'styles'] },
            {
              from: 'feature',
              allow: [
                'domain',
                'entities',
                'lib',
                'state',
                'styles',
                ['feature', { feature: '${from.feature}' }],
              ],
            },
            { from: 'domain', allow: ['domain', 'entities'] },
            { from: 'entities', allow: ['entities'] },
            { from: 'lib', allow: ['lib', 'entities'] },
            { from: 'state', allow: ['state', 'entities'] },
            { from: 'styles', allow: [] },
          ],
        },
      ],
    },
  },
];
```

- [ ] **Step 5.4: Run lint and formatter**

Run: `pnpm lint && pnpm format:check`
Expected: lint exits 0. Formatter may report files that need formatting — if so, run `pnpm format` and re-run `pnpm format:check` until clean.

- [ ] **Step 5.5: Confirm boundaries rule actually fires**

Create a throwaway test file to verify the rule triggers, then delete it:

```bash
cat > /tmp/boundary-probe.tsx <<'EOF'
import { SplitHome } from '@features/home';
export const x = SplitHome;
EOF
cp /tmp/boundary-probe.tsx /Users/angel/Documents/HyperJournal/src/domain/wallets/probe.tsx
pnpm lint src/domain/wallets/probe.tsx || echo "boundary rule fired as expected"
rm /Users/angel/Documents/HyperJournal/src/domain/wallets/probe.tsx /tmp/boundary-probe.tsx
```

Expected: `pnpm lint` exits non-zero because `domain` cannot import from `feature`; message includes the text `boundaries/element-types`. If no error fires, the boundaries config is broken — stop and fix before continuing.

Note: at this point `src/domain/wallets/` may not exist yet — if the probe `cp` fails because the parent dir is missing, run `mkdir -p src/domain/wallets` first, then retry, then `rm -rf src/domain/wallets` after confirming.

- [ ] **Step 5.6: Commit**

```bash
git add eslint.config.js .prettierrc .prettierignore
git commit -m "chore: add ESLint flat config with import boundaries and Prettier"
```

---

## Task 6: Vitest + React Testing Library setup and one smoke test

**Files:**

- Create: `vitest.config.ts`, `src/tests/setup.ts`, `src/features/home/components/SplitHome.test.tsx`

- [ ] **Step 6.1: Write `vitest.config.ts`**

Create `/Users/angel/Documents/HyperJournal/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, 'src/app'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@entities': path.resolve(__dirname, 'src/entities'),
      '@lib': path.resolve(__dirname, 'src/lib'),
      '@state': path.resolve(__dirname, 'src/state'),
      '@styles': path.resolve(__dirname, 'src/styles'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
```

- [ ] **Step 6.2: Write `src/tests/setup.ts`**

Create `/Users/angel/Documents/HyperJournal/src/tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 6.3: Write a failing component test for SplitHome**

Create `/Users/angel/Documents/HyperJournal/src/features/home/components/SplitHome.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SplitHome } from './SplitHome';

describe('SplitHome', () => {
  it('renders the analytics and journal panels side by side', () => {
    render(<SplitHome />);
    expect(screen.getByRole('heading', { name: /trading analytics/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /journal & coaching/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6.4: Run the test**

Run: `pnpm test`
Expected: one passing test. If it fails with "cannot find module", verify the aliases in `vitest.config.ts` match the ones in `vite.config.ts` exactly.

- [ ] **Step 6.5: Commit**

```bash
git add vitest.config.ts src/tests/setup.ts src/features/home/components/SplitHome.test.tsx
git commit -m "test: set up Vitest + RTL and add SplitHome smoke test"
```

---

## Task 7: First pure-domain TDD cycle — `isValidWalletAddress`

This task proves the TDD loop the rest of Phase 1 depends on: red → green → refactor → commit. It also produces a real utility Session 2 will use to validate pasted addresses.

**Files:**

- Create: `src/entities/wallet.ts`, `src/domain/wallets/isValidWalletAddress.ts`, `src/domain/wallets/isValidWalletAddress.test.ts`

- [ ] **Step 7.1: Write the entity type**

Create `/Users/angel/Documents/HyperJournal/src/entities/wallet.ts`:

```ts
export type WalletAddress = string & { readonly __brand: 'WalletAddress' };
```

- [ ] **Step 7.2: Write the failing test**

Create `/Users/angel/Documents/HyperJournal/src/domain/wallets/isValidWalletAddress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isValidWalletAddress } from './isValidWalletAddress';

describe('isValidWalletAddress', () => {
  it('accepts a canonical lowercase 0x-prefixed 20-byte hex address', () => {
    expect(isValidWalletAddress('0xf318afb8f0050d140b5d1f58e9537f9ebfe82b14')).toBe(true);
  });

  it('accepts a mixed-case address (EIP-55 not enforced at this layer)', () => {
    expect(isValidWalletAddress('0xf318AFb8f0050D140B5D1F58E9537f9eBFE82B14')).toBe(true);
  });

  it('rejects the empty string', () => {
    expect(isValidWalletAddress('')).toBe(false);
  });

  it('rejects an address with no 0x prefix', () => {
    expect(isValidWalletAddress('f318afb8f0050d140b5d1f58e9537f9ebfe82b14')).toBe(false);
  });

  it('rejects an address that is too short', () => {
    expect(isValidWalletAddress('0x123')).toBe(false);
  });

  it('rejects an address that is too long', () => {
    expect(isValidWalletAddress('0xf318afb8f0050d140b5d1f58e9537f9ebfe82b1400')).toBe(false);
  });

  it('rejects an address with non-hex characters', () => {
    expect(isValidWalletAddress('0xf318afb8f0050d140b5d1f58e9537f9ebfe82Bzz')).toBe(false);
  });

  it('rejects non-string inputs (narrowed at type boundary, defensive here)', () => {
    expect(isValidWalletAddress(undefined as unknown as string)).toBe(false);
    expect(isValidWalletAddress(null as unknown as string)).toBe(false);
  });
});
```

- [ ] **Step 7.3: Run the test to confirm it fails**

Run: `pnpm test src/domain/wallets/isValidWalletAddress.test.ts`
Expected: failure — "Cannot find module './isValidWalletAddress'" or similar. Confirm the failure is for the expected reason before implementing.

- [ ] **Step 7.4: Write the minimal implementation**

Create `/Users/angel/Documents/HyperJournal/src/domain/wallets/isValidWalletAddress.ts`:

```ts
import type { WalletAddress } from '@entities/wallet';

const WALLET_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export function isValidWalletAddress(input: string): input is WalletAddress {
  return typeof input === 'string' && WALLET_ADDRESS_PATTERN.test(input);
}
```

- [ ] **Step 7.5: Run the tests**

Run: `pnpm test src/domain/wallets/`
Expected: 8 tests, all pass.

- [ ] **Step 7.6: Run coverage to confirm the 90% threshold holds for `domain/`**

Run: `pnpm test:coverage`
Expected: coverage report shows 100% for `src/domain/wallets/isValidWalletAddress.ts`, thresholds not violated.

- [ ] **Step 7.7: Commit**

```bash
git add src/entities/wallet.ts src/domain/wallets/isValidWalletAddress.ts src/domain/wallets/isValidWalletAddress.test.ts
git commit -m "feat(domain): add WalletAddress type and isValidWalletAddress with tests"
```

---

## Task 8: PWA assets and GitHub Pages SPA fallback

**Files:**

- Create: `public/favicon.svg`, `public/404.html`, `public/icons/icon-192.png` (placeholder), `public/icons/icon-512.png` (placeholder)

- [ ] **Step 8.1: Write `public/favicon.svg`**

Create `/Users/angel/Documents/HyperJournal/public/favicon.svg`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="14" fill="#0b0d10" />
  <path
    d="M18 44 L24 30 L30 38 L40 20 L46 44"
    stroke="hsl(152 76% 50%)"
    stroke-width="4"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
```

- [ ] **Step 8.2: Write `public/404.html` (GH Pages SPA fallback)**

Create `/Users/angel/Documents/HyperJournal/public/404.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>HyperJournal</title>
    <script>
      // Standard spa-github-pages redirect: preserve the requested path and
      // bounce to index.html, where main.tsx will consume it.
      (function () {
        var segmentCount = 1; // number of path segments in the GH Pages base
        var l = window.location;
        l.replace(
          l.protocol +
            '//' +
            l.hostname +
            (l.port ? ':' + l.port : '') +
            l.pathname
              .split('/')
              .slice(0, 1 + segmentCount)
              .join('/') +
            '/?/' +
            l.pathname.slice(1).split('/').slice(segmentCount).join('/').replace(/&/g, '~and~') +
            (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
            l.hash,
        );
      })();
    </script>
  </head>
  <body></body>
</html>
```

- [ ] **Step 8.3: Add the companion redirect decoder to `index.html`**

Modify `/Users/angel/Documents/HyperJournal/index.html` — insert this script block immediately before `<script type="module" src="/src/main.tsx"></script>`:

```html
<script>
  // Decoder for the spa-github-pages 404.html redirect.
  (function (l) {
    if (l.search[1] === '/') {
      var decoded = l.search
        .slice(1)
        .split('&')
        .map(function (s) {
          return s.replace(/~and~/g, '&');
        })
        .join('?');
      window.history.replaceState(null, '', l.pathname.slice(0, -1) + decoded + l.hash);
    }
  })(window.location);
</script>
```

- [ ] **Step 8.4: Create placeholder PWA icons**

```bash
mkdir -p /Users/angel/Documents/HyperJournal/public/icons
# Use the favicon as a stand-in for now. Real icons land in Session 5 polish.
cp /Users/angel/Documents/HyperJournal/public/favicon.svg /Users/angel/Documents/HyperJournal/public/icons/icon-192.svg
cp /Users/angel/Documents/HyperJournal/public/favicon.svg /Users/angel/Documents/HyperJournal/public/icons/icon-512.svg
```

Add a note to `docs/BACKLOG.md` — see Task 10.

- [ ] **Step 8.5: Run production build locally and confirm PWA assets emit**

Run: `pnpm build`
Expected: build succeeds. `dist/` contains `index.html`, `404.html`, `favicon.svg`, `manifest.webmanifest`, a service worker (`sw.js` or similar), and hashed JS/CSS bundles.

- [ ] **Step 8.6: Commit**

```bash
git add public/ index.html
git commit -m "feat(pwa): add PWA assets and GH Pages SPA fallback scaffolding"
```

---

## Task 9: GitHub Actions deploy workflow

**Files:**

- Create: `.github/workflows/deploy.yml`

- [ ] **Step 9.1: Write the workflow**

Create `/Users/angel/Documents/HyperJournal/.github/workflows/deploy.yml`:

```yaml
name: Build and deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test:coverage

      - name: Build
        env:
          VITE_BASE_PATH: /${{ github.event.repository.name }}/
        run: pnpm build

      - name: Copy 404.html alongside index.html (belt & suspenders)
        run: cp dist/index.html dist/404.html || true

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 9.2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Actions workflow that builds and deploys to Pages"
```

- [ ] **Step 9.3: Note for user — manual step required after first push**

After pushing to GitHub, the user must enable Pages for this repo: Repository → Settings → Pages → "Build and deployment" → Source: **GitHub Actions**. Record this as a gotcha in `SESSION_LOG.md` at end of session.

---

## Task 10: Update CONVENTIONS, BACKLOG, SESSION_LOG

**Files:**

- Modify: `docs/CONVENTIONS.md`, `docs/BACKLOG.md`, `docs/SESSION_LOG.md`

- [ ] **Step 10.1: Add patterns that emerged to `docs/CONVENTIONS.md`**

In `/Users/angel/Documents/HyperJournal/docs/CONVENTIONS.md`, append under the appropriate sections. Specifically:

- §2 File and module layout — add: "Use path aliases `@app/*`, `@features/*`, `@domain/*`, `@entities/*`, `@lib/*`, `@state/*`, `@styles/*` (defined in `tsconfig.json` and mirrored in `vite.config.ts` + `vitest.config.ts`). Keep them in sync — lint rules rely on the `src/` layout they encode."
- §3 Domain layer — add: "`domain/` uses the `@entities/*` alias to consume branded types. Do not duplicate entity shapes inside `domain/`."
- §5 Styling — add: "Semantic colors are `gain`, `loss`, `risk`, `neutral`, and `accent`, defined as CSS variables in `src/styles/globals.css` and consumed via Tailwind color utilities. Never hardcode `hsl(...)` or hex values in components."
- §6 State management — add: "Addressable UI state (selected wallet, current view mode) belongs in the router; non-addressable UI state belongs in Zustand (`src/state/ui-store.ts`). Per ADR-0004, never store `selectedWalletAddress` in Zustand."

- [ ] **Step 10.2: Add deferred items to `docs/BACKLOG.md`**

Append under a new `## Session 1 deferrals` section:

```markdown
## Session 1 deferrals

- `[soon]` Replace placeholder PWA icons (`public/icons/icon-*.svg`) with proper 192/512 PNGs and maskable variants. Landed in Session 5 polish.
- `[soon]` Configure Playwright + one E2E smoke test. Deferred from Session 1 to avoid scope creep; revisit once a real user flow exists (Session 4+).
- `[soon]` shadcn/ui init and Button/Card registration. Deferred to Session 2 — installing them is low value until Session 2's wallet input actually uses them.
- `[later]` Enable GitHub Pages manually in repo settings after the first push (Settings → Pages → Source: GitHub Actions).
- `[maybe]` Consider adding a `useReducedMotion` hook wrapper around Framer Motion so every animation honors `prefers-reduced-motion` by construction, not convention. Decide after the first real animation lands.
```

- [ ] **Step 10.3: Append to `docs/SESSION_LOG.md`**

Append this entry immediately below the `---` line at the end of the file:

```markdown
## 2026-04-21 — Phase 1 Session 1: Scaffold & shell

**Session goal:** Lay the Vite + React + TS-strict foundation with Tailwind tokens, split-home route, PWA scaffold, import-boundary-enforcing lint, a working Vitest TDD loop, and a CI deploy to GitHub Pages.

**Done:**

- Scaffolded Vite + React + TS strict with pnpm (Node ≥ 20.11, pnpm 9.12.0).
- Installed pinned dependencies covering core runtime (React, Router, TanStack Query, Zustand, Framer Motion), styling (Tailwind), PWA (vite-plugin-pwa), and test/lint toolchain.
- Configured Tailwind with dark-first semantic tokens (`gain`, `loss`, `risk`, `neutral`, `accent`) and a `prefers-reduced-motion` base override.
- Built the app shell: `AppProviders` (TanStack Query), `AppRouter` (BrowserRouter with `basename` tied to `import.meta.env.BASE_URL`), and `SplitHome` route rendering `AnalyticsPanel` + `JournalPanel` empty states.
- Enforced import boundaries via `eslint-plugin-boundaries` matching CLAUDE.md §4 (verified by a probe that confirms the rule fires).
- Added Vitest + RTL + jsdom with a component smoke test for `SplitHome`.
- First TDD cycle end-to-end: `WalletAddress` branded type + `isValidWalletAddress` pure function with 8 tests, 100% coverage, 90% threshold enforced for `src/domain/**`.
- PWA scaffold: manifest, placeholder favicon/icons, and the spa-github-pages 404.html fallback pair.
- GitHub Actions workflow that typechecks, lints, tests with coverage, builds, and deploys to Pages using `actions/deploy-pages@v4`.

**Decisions made:** ADR-0002 (GH Pages deploy), ADR-0003 (pnpm), ADR-0004 (React Router v6 BrowserRouter).

**Deferred / not done:**

- Playwright E2E — deferred to Session 4+; no real flow to exercise yet.
- shadcn/ui init — deferred to Session 2 (first user of Button/Input).
- Real PWA icons — deferred to Session 5 polish; SVG placeholders in place.

**Gotchas for next session:**

- Production builds must be run with `VITE_BASE_PATH=/<repo-name>/` or Pages assets 404. CI sets this automatically.
- `selectedWalletAddress` belongs in the route (per ADR-0004), not in Zustand. Session 2 wallet feature should place the address in the URL (`/w/:address`) and read it via `useParams`.
- Alias definitions are duplicated across `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`. Keep them in lockstep; any new alias must be added to all three.
- After first push, the user must manually enable GH Pages: Settings → Pages → Source: GitHub Actions.

**Invariants assumed:**

- Every test added to `src/domain/**` must keep coverage ≥ 90% (threshold is in `vitest.config.ts`).
- `src/styles/globals.css` is the single source of CSS custom properties; components consume them only through Tailwind tokens.
- The `boundaries` ESLint rule is the authoritative encoder of CLAUDE.md §4; if you need to relax it, write an ADR that amends §4 first.

---
```

- [ ] **Step 10.4: Commit docs**

```bash
git add docs/CONVENTIONS.md docs/BACKLOG.md docs/SESSION_LOG.md
git commit -m "docs: record Session 1 conventions, deferrals, and session log"
```

---

## Final verification

Before closing the session, run this end-to-end checklist from repo root:

- [ ] `pnpm install --frozen-lockfile` — lockfile is stable
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm lint` — 0 errors, 0 warnings (fix or suppress warnings explicitly)
- [ ] `pnpm test:coverage` — all tests pass; `src/domain/**` ≥ 90% coverage
- [ ] `pnpm build` — production build succeeds
- [ ] `pnpm dev` → open `http://localhost:5173/` — split home renders, no console errors
- [ ] `git status` — working tree clean; all work committed
- [ ] `git log --oneline` — commit history tells a coherent story, one logical change per commit

If any step fails, stop and resolve before declaring the session done. Do not push to remote without the user's explicit go-ahead (CLAUDE.md "Executing actions with care" — push is a shared-state action).

---

## Self-review checklist (for the plan author)

- **Spec coverage:** Every Phase 1 Session 1 roadmap bullet maps to at least one task:
  - Vite + React + TS strict scaffold → Task 2
  - Tailwind + dark-first tokens → Task 3
  - App shell providers + router + split home → Task 4
  - Import boundaries ESLint → Task 5
  - Vitest + RTL + smoke test → Task 6
  - First TDD loop (isValidWalletAddress) → Task 7
  - PWA scaffold + GH Pages fallback → Task 8
  - CI deploy → Task 9
  - Docs updates (CONVENTIONS, BACKLOG, SESSION_LOG) → Task 10
- **No placeholders:** every code block is the final content; no `TODO`, `TBD`, or "fill in here" text.
- **Type consistency:** `WalletAddress` is declared once in `src/entities/wallet.ts` and consumed identically in `src/domain/wallets/isValidWalletAddress.ts`. Path aliases match across tsconfig / vite / vitest.
