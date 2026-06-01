# KKGT Coffee Flow — UI Pre-Delivery Checklist

Adapted from the `ui-ux-pro-max` pre-delivery checklist, tuned for an
**agri-commodity ERP** (mood: trustworthy, dense, calm, data-first — not a
consumer/marketing app). Run through this before every UI change ships.

## The vertical's design rules

KKGT is a coffee export/supply-chain ERP. Design decisions should favor:
- **Clarity over flair** — operators enter data all day; speed and legibility win.
- **Calm motion** — subtle transitions only; no celebratory animation on routine saves.
- **Dense but scannable** — tables are the primary surface; align numbers, keep rows tight but tappable.
- **Muted, trustworthy palette** — brand green (`#126433`) + orange accent (`#f06721`). No purple/pink AI gradients, no neon.

## Pre-delivery checklist

Before pushing a UI change, verify:

- [ ] **Icons are SVG (Lucide), not emoji**, in interactive/iconographic UI. (Emoji inside notification/alert *message text* is acceptable — it also renders in Telegram.)
- [ ] **`cursor-pointer` on everything clickable** — buttons/links get it free; `<div onClick>` needs it explicitly or `role="button"` (global CSS covers `[role="button"]`).
- [ ] **Hover transitions 150–300ms** — Button is 150ms, cards 300ms. No instant jumps, no >400ms sluggishness.
- [ ] **Text contrast ≥ 4.5:1** (AA). Watch small orange text on white — `#f06721` at <16px fails; use it only for large numbers/badges, or darken to `#c2410c` for small text.
- [ ] **Focus-visible ring on keyboard nav** — global soft glow is in `index.css`. Tab through new forms to confirm.
- [ ] **`prefers-reduced-motion` respected** — global rule in `index.css` neutralizes animation. Don't add inline animations that bypass it.
- [ ] **Responsive at 375 / 768 / 1024 / 1440px** — test all four. Tables scroll horizontally inside a wrapper; dialogs fit 375px; nothing clips under the mobile bottom nav (safe-area handled).
- [ ] **Numbers use tabular figures** — global `td/th` rule aligns digits. New number displays outside tables should add `tabular-nums`.
- [ ] **Empty states are encouraging** — use `<EmptyState>` (icon + warm headline + next action), never a bare "No results".
- [ ] **Loading shows structure** — use `<SkeletonTable>` / `<Skeleton>`, not a bare spinner, for list/table loads.
- [ ] **Touch targets ≥ 44px** on mobile — use `.tap-target` for icon-only buttons.
- [ ] **Errors are human** — "Couldn't save — check your connection and try again", never "Error 422".

## Anti-patterns (never do, for this app)

- ❌ Emoji where an icon component belongs (status chips, nav, buttons)
- ❌ Purple/pink "AI" gradients, neon, glassmorphism — wrong mood for an ERP
- ❌ Confetti / bounce on routine CRUD saves (reserve celebration for genuine milestones, if ever)
- ❌ Gray-on-gray data tables (fails contrast, hard to scan)
- ❌ Animations that delay data entry or block the primary action
- ❌ Desktop-only layouts — field staff use phones and tablets

## Known follow-ups (deferred, not yet done)

- Replace emoji inside StockReport / OutputReport **alert message strings** with Lucide icons — requires refactoring the alert components to accept an `icon` prop (touches several files; do as a focused task, not inline).
- Audit small-orange-text contrast per-use and swap to a darker shade where it's <16px.
- Tablet (768/1024) pass — verify every table/dialog at those widths.

## How to verify quickly

```powershell
npm run build           # must pass
npm run test:e2e        # 28 tests must stay green (set VITE_DEMO_MODE=false for the run)
```

Then open the app at 375px and 1440px in the browser and eyeball the changed pages against this list.
