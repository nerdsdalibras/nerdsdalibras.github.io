# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static website for **Nerds da Libras** — a Brazilian Sign Language (Libras) education brand run by Prof. Lorena. The site acts as a link-in-bio landing page and course sales funnel.

- **Live domain**: clubedalibras.com (CNAME → GitHub Pages)
- **Language**: Brazilian Portuguese (pt-BR) throughout all content and HTML attributes
- **Stack**: Vanilla HTML/CSS/JS — no build tools, no framework, no npm

## Development

No build step. Open any `.html` file directly in a browser, or serve locally with:

```bash
python3 -m http.server 8080
```

There are no tests, linters, or CI pipelines. Changes go live on push to the default branch (GitHub Pages auto-deploys).

## Architecture

The site is two standalone HTML files — all CSS and JS is inlined in each file with no shared stylesheets or scripts.

| File | Purpose |
|---|---|
| `index.html` | Main landing page — hero, stats, product cards, social links |
| `dozeroalibrascursos.html` | Course sales page (longer-form) |
| `_redirects` | Netlify short-link redirects (e.g. `/zero-a-libras`, `/youtube`) — contains placeholder URLs that need real destinations |
| `fotos/` | All photo assets (JPGs for hero carousel, ebook cover, card images) |

### Design System (index.html)

Dark theme with CSS custom properties defined in `:root`:

```css
--ouro / --ouro-lt   /* gold — primary brand accent */
--escuro / --cinza   /* near-black backgrounds */
--verde              /* #22C55E — course/CTA green */
--roxo               /* #8B5CF6 — mentoria/mentorship purple */
--rosa               /* #EC4899 — highlight/badge pink */
--texto              /* rgba(255,255,255,0.55) — muted body text */
```

**dozeroalibrascursos.html** uses a separate light/crimson theme with its own `:root` vars (`--verde`, `--ouro`, `--vermelho`, `--bg`, etc.) — the two files do not share design tokens.

### Animations

Both files use a `.shimmer` / `shimmerCta` keyframe on CTA buttons (sliding light reflection). `index.html` additionally has:
- **Ken Burns carousel**: `#photoCarousel` rotates hero photos every 4.5 s with a CSS zoom animation
- **AOS** (Animate On Scroll, loaded from CDN): `data-aos="fade-up"` attributes on sections
- `prefers-reduced-motion` media query disables all animations for accessibility

### CTA Pattern

Each product card ends with a colour-coded CTA anchor:
- `.cta-verde` → course (green)
- `.cta-roxo` → mentoria (purple)
- `.cta-ouro` → service (gold)
- `.cta-play` → app store (pink)

All CTAs include the `::after` shimmer pseudo-element and use staggered `animation-delay` so they don't flash in sync.

## Placeholders to Fill In

`_redirects` contains dummy URLs that need real destinations:
- `/zero-a-libras` → Hotmart product link
- `/mentoria` → Mentoria booking link
- `/telegram` → Telegram channel URL
- `/app` → Google Play app URL

`index.html` has commented-out blocks for Meta Pixel (`SEU_PIXEL_ID_AQUI`) and Google Analytics (`G-XXXXXXXXXX`) that are ready to activate.

## Deployment

Push to the `main` branch — GitHub Pages deploys automatically. The custom domain `clubedalibras.com` is configured via `CNAME`. No build artifacts to manage.
