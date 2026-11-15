# App icon

The icon is `public/favicon.svg`. `npm run icons` turns it into the PNGs in `public/` (see `pwa-assets.config.ts`).

**Current icon: option G1 "Polaroid Tick" (chosen 2026-11-15).** A tilted cream instant photo with a family group on amber and an amber check badge, on charcoal. Shapes only, full square: iOS cuts its own rounded corners.

`icon-options.html` is the review page with all 50 options (A–H). To switch: copy the option's `<symbol>` drawing into `public/favicon.svg` as a 512 × 512 square, run `npm run icons`, and commit the SVG and PNGs together.
