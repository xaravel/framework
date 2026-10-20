---
test_ids:
  - XT-conformance-156
trigger: open-question
proposed: >-
  Option 1 (recommended): a workaround inside `@xaravel/image`. Keep
  `Bun.Image` for what it does (resize, scale, orient, grayscale, flips,
  WebP/JPEG/PNG encoding, dimensions) and implement the rest in TypeScript on
  decoded RGBA pixels: crop, cover (resize then centre crop), contain (resize
  inside then pad with the background), arbitrary-angle rotate with a
  background, blur, sharpen and dominantColor, plus PNG/BMP/GIF encoders where
  Bun has none. AVIF, HEIC and JPEG XL output, which need codecs Bun does not
  ship on Linux, become `deferred:` items (a new slug such as
  `deferred:image-avif-heic-jxl` in conformance/deferred-items, a Maintainer
  change). Option 2: defer every gap operation (`deferred:` items per
  operation) and port only what `Bun.Image` carries. Option 3: depend on an
  npm image library for the gaps, which the spine's Stack does not list.
evidence: >-
  `bun run probes:run` on Bun 1.4.3 with `Bun.Image.backend = "bun"` (the
  portable backend, byte-identical to Linux; conformance/probes/probes.ts):
  `bun-image.laravel-api: unsupported: gaps (12): cover: resize(w, h, { fit:
  "cover" }) throws TypeError: fit must be one of 'fill' or 'inside'; no
  Bun.Image.prototype.crop/extract; contain: resize(2, 2, { fit: "inside" })
  gives 2×1, not the padded 2×2 canvas; no Bun.Image.prototype.extend; crop:
  no Bun.Image.prototype.crop/extract; rotate: rotate(90) works; rotate(45)
  (Laravel takes any float angle) throws TypeError: rotate: only multiples of
  90 are supported; blur: no Bun.Image.prototype.blur; sharpen: no
  Bun.Image.prototype.sharpen; toGif: no Bun.Image.prototype.gif; toAvif:
  ERR_IMAGE_FORMAT_UNSUPPORTED: Error: Image: format not supported on this
  machine (HEIC/AVIF/TIFF require the OS codec; AVIF encode needs an AV1
  encoder); toHeic: ERR_IMAGE_FORMAT_UNSUPPORTED: Error: Image: format not
  supported on this machine (HEIC/AVIF/TIFF require the OS codec; AVIF encode
  needs an AV1 encoder); toJxl: no Bun.Image.prototype.jxl; toBmp: no
  Bun.Image.prototype.bmp; dominantColor: no
  Bun.Image.prototype.dominantColor; Bun.Image.backend "bun"; supported (10):
  resize, scale, orient, grayscale, flipVertically, flipHorizontally, toWebp,
  toJpeg, toPng, dimensions`.
---

# ESC-8.3-3: `Bun.Image` carries 10 of Laravel's 22 Image operations

Covers the probe `bun-image.laravel-api` (Story 8.3, OQ-11, FR-84).

FR-84 says App Developers use Laravel 13's Image API "through `Bun.Image`". The probe runs each operation that Upstream `src/Illuminate/Image/Image.php` exposes on a raw RGBA image and checks the output. `Bun.Image` performs 10 of them. The other 12 are gaps: it has no crop, so neither `crop` nor `cover`; no padding, so no `contain`; rotation only by multiples of 90°, while Laravel takes any angle with a background; no blur, sharpen or dominant colour; no GIF, BMP or JPEG XL encoder; and AVIF and HEIC output need OS codecs that the Linux build (and the portable `"bun"` backend) do not have.

Closing the gap means either writing image operations outside `Bun.Image`, which goes beyond FR-84's wording, or narrowing what Xaravel ports through `deferred:` items, which `conformance/deferred-items` does not list yet. Both are the Maintainer's decision, so this Escalation stays open. Nothing in Phase 0 depends on it; the Image Component's Story will need the ruling.
