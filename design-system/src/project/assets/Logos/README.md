# Logos

The Vilda mark, copied from the repository as shipped. There is no wordmark: the product name is always set in plain type next to the mark (see the ChromeStrip component and the brand book).

- `logo_vilda.webp` (480 × 293) is the mark the app loads. The chrome strip renders it at 38 × 38 px with `object-fit: cover` and a 10 px corner radius (`.chrome-brand-logo`), so the composition is cropped to its centre square. The auth card shows the whole mark uncropped: `.vilda-auth-logo` renders it at `max-width: 180px` (`width: 100%`, `height: auto`) with a 14 px corner radius and `alt="Waga i wzrost — Vilda Clinic"`.
- `logo_vilda.jpeg` (1696 × 1034) is the same artwork at full size; pages reference `https://wagaiwzrost.pl/logo_vilda.jpeg` as the shared image for social previews.

What the mark shows: three leaf-shaped strokes in three steps of the brand teal (a light cyan, the `secondary` teal, and the deep `primary` teal) rising over a pale, light-blue grid, with three thin curved lines climbing to the right. It reads as growth curves on a centile chart. The artwork is opaque white behind the grid, so place it on `bg` (#ffffff) or `card`; do not knock it out on a teal fill.

Rules: never redraw, recolour or stretch the mark; keep the corner radius at 10 px when it is cropped square and 14 px when it is shown whole in the auth card; use the full-size JPEG only where the whole composition fits.
