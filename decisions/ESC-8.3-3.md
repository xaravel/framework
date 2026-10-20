---
decision: approved
decided_by: Maintainer
date: 2026-10-20
escalation_sha256: "f692df6a1b2bd9b65957267b5da6b91542f5f02772ff00f0768b64306d112cdb"
---

# ESC-8.3-3: approved, option 1, `Bun.Image` plus TypeScript for the gaps

`@xaravel/image` uses `Bun.Image` for what it carries: resize, scale, orient, grayscale, the flips, WebP, JPEG and PNG encoding, and dimensions. It implements the other operations in TypeScript on decoded RGBA pixels: crop, cover, contain, rotation by any angle with a background, blur, sharpen and dominantColor, plus GIF and BMP encoders. These are slower than a native library but comparable to Laravel's own GD backend, and keep the full Laravel 13 Image API.

AVIF, HEIC and JPEG XL output need codecs Bun does not ship on Linux, so they become the deferred item `image-avif-heic-jxl`, now listed in PRD §7.2's post-alpha scope and in `conformance/deferred-items` (XT-conformance-252 pins the list to the PRD). Option 2 (porting only what `Bun.Image` carries) would ship a partial API; option 3 (an npm image library) adds a dependency the Stack does not list.
