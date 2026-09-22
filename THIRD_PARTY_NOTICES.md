# Third-party notices

This repository bundles the third-party components listed below. They are
**not** covered by the Apache-2.0 grant in [`LICENSE`](LICENSE); each remains
subject to its own license and copyright notice. Full license texts are in the
[`LICENSES/`](LICENSES) directory.

| File in this repository | Component | Version | SPDX | Copyright |
| --- | --- | --- | --- | --- |
| `pdfmake.min.js` | [pdfmake](https://github.com/bpampuch/pdfmake) | 0.2.10 | `MIT` | Bartosz Pampuch and pdfmake contributors |
| `pdfmake_vfs_fonts.js` | [Roboto](https://github.com/googlefonts/roboto) (standard fonts bundled with pdfmake) | — | `Apache-2.0` | Google Inc. / The Roboto Project Authors |
| `jsQR.min.js` | [jsQR](https://github.com/cozmo/jsQR) | — | `Apache-2.0` | Cosmo Wolfe |
| `jszip.min.js` | [JSZip](https://github.com/Stuk/jszip) | 3.10.1 | `MIT` | 2009–2016 Stuart Knightley and JSZip contributors |
| `lucide.min.js` | [Lucide](https://github.com/lucide-icons/lucide) | — | `ISC` (some icons `MIT`) | Lucide Icons and Contributors; Cole Bemis (Feather-derived icons) |
| `qrcode.min.js` | [QRCode.js](https://github.com/davidshimjs/qrcodejs) | — | `MIT` | Sangmin Shim (davidshimjs) |
| `jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) | 2.5.1 | `MIT` | 2010–2021 James Hall; 2015–2021 yWorks GmbH |
| `html2canvas.min.js` | [html2canvas](https://github.com/niklasvh/html2canvas) | 1.4.1 | `MIT` | 2012 Niklas von Hertzen |

A dash in the *Version* column means the bundled build carries no version
string; the component was identified from its upstream source.

---

## pdfmake — MIT

Identified from the file header: `/*! pdfmake v0.2.10, @license MIT, @link http://pdfmake.org */`.

License text: [`LICENSES/MIT.txt`](LICENSES/MIT.txt), with
`Copyright (c) 2014 bpampuch`.

## Roboto (pdfmake standard fonts) — Apache-2.0

`pdfmake_vfs_fonts.js` is pdfmake's virtual file system containing the
embedded font files `Roboto-Regular.ttf`, `Roboto-Italic.ttf`,
`Roboto-Medium.ttf` and `Roboto-MediumItalic.ttf`. The Roboto typeface is
licensed under the Apache License, Version 2.0.

License text: [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt).

## jsQR — Apache-2.0

License text: [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt),
with `Copyright 2018 Cosmo Wolfe`.

## JSZip — MIT

The upstream file header states the library is dual-licensed: *"Dual licenced
under the MIT license or GPLv3."* This project takes it under the **MIT**
option.

License text: [`LICENSES/MIT.txt`](LICENSES/MIT.txt), with
`Copyright (c) 2009-2016 Stuart Knightley and contributors`.

## QRCode.js — MIT

Identified from the upstream source as `davidshimjs/qrcodejs`.

License text: [`LICENSES/MIT.txt`](LICENSES/MIT.txt), with
`Copyright (c) 2012 davidshimjs`.

## jsPDF — MIT

Bundled build `dist/jspdf.umd.min.js` from the npm package `jspdf@2.5.1`; its SHA-384
matches the Subresource Integrity hash previously used for the cdnjs copy.

License text: [`LICENSES/MIT.txt`](LICENSES/MIT.txt), with
`Copyright (c) 2010-2021 James Hall, https://github.com/MrRio/jsPDF` and
`(c) 2015-2021 yWorks GmbH, https://www.yworks.com/`.

## html2canvas — MIT

Bundled build `dist/html2canvas.min.js` from the npm package `html2canvas@1.4.1`; its SHA-384
matches the Subresource Integrity hash previously used for the cdnjs copy.

License text: [`LICENSES/MIT.txt`](LICENSES/MIT.txt), with
`Copyright (c) 2012 Niklas von Hertzen`.

## Lucide — ISC, with MIT for Feather-derived icons

The upstream `LICENSE` file is reproduced verbatim below.

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Clinical reference data

Growth references, LMS tables, bone-age and adult-height prediction tables and
similar clinical reference material reproduced or derived from published
sources are not original work of Vilda Clinic sp. z o.o. The Apache-2.0 grant
covers this project's source code; it does not grant rights in third-party
reference data. The provenance of each algorithm and data set is documented in
[`docs/clinical/ALGORITHMS.md`](docs/clinical/ALGORITHMS.md).
