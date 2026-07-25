# Contributing to Bolt Slides

Thanks for helping make slides less boring.

## Setup

```bash
npm install
npm run dev     # demo deck at http://localhost:5173
```

Before opening a PR:

```bash
npx tsc --noEmit
npm run build
```

CI runs the same two checks.

## Lay of the land

- **`src/deck/`** — the presentation engine and chrome (navigation, sidebar, grid view, annotations, presenter mode). Changes here affect every deck built from this template, so keep them small, keyboard-accessible, and responsive.
- **`src/components/`** — the slide component library. New components are welcome; they must be responsive (no fixed canvas assumptions) and themable via the tokens in `src/styles/tokens.css` only.
- **`.bolt/skills/slides/SKILL.md`** — the authoring guide agents follow. If you change engine behavior, shortcuts, or component APIs, update the skill in the same PR.
- **`src/App.tsx`** — the demo deck. It exists to showcase every component; keep it in sync when you add one.

## Guidelines

- Theme through `tokens.css` variables — never hard-code colors in components.
- Test at a phone viewport (≤ 640px) as well as desktop; the dock, sidebar, grid view, and annotation toolbar all have mobile layouts.
- Keep the demo deck presentable — it's many people's first impression.
