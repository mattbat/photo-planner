import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Run `npm run icons` after changing public/favicon.svg to regenerate the PNG icons.
// The icon is full-bleed and keeps the aperture inside the maskable safe zone, so no padding.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: '#1c1810' } },
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background: '#1c1810' } },
  },
  images: ['public/favicon.svg'],
});
