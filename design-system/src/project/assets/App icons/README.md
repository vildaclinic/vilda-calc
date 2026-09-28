# App icons

The installable-app icons from `pwa-icons/`, copied as shipped. `manifest.json` lists sizes from 40 × 40 up to 1024 × 1024; this group carries the four a consumer needs.

- `icon-512x512.png`: the standard PWA icon (manifest `any` purpose).
- `icon-512x512-maskable.png`: the maskable variant with safe-zone padding for Android adaptive icons.
- `icon-192x192.png`: the small install icon and shortcut icon.
- `icon-180x180.png`: the iOS home-screen icon (`apple-touch-icon`).

The manifest pairs them with `theme_color` `primary` (#00838d) and `background_color` `bg` (#ffffff); the browser UI colour meta tag is the same `primary`. Keep those two values in step with the icon set when either changes.
