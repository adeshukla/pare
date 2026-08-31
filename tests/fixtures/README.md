# Fixtures

Real image files, committed as binaries rather than generated at test time. A
generated fixture would change whenever the generator changed, which is exactly
when a codec regression is easiest to miss.

| File | What it is | Why it exists |
|---|---|---|
| `photo.jpg` | 1200×800, JPEG q92, smooth gradients plus per-pixel noise | Stands in for a photograph: lossy source, lossy target |
| `flat.png` | 640×480, four flat colours on a light ground | The case OxiPNG wins on, and where lossless has to stay lossless |
| `broken.jpg` | A valid JPEG header followed by 70 bytes of text | Proves one damaged file is skipped with a warning rather than failing the run |

`photo.jpg` and `flat.png` were produced once with `System.Drawing` on Windows;
`broken.jpg` was written by hand. Regenerating them is not part of the test run.

**`photo.jpg` is synthetic and flatters the encoders.** Its gradients are exactly
what AVIF is best at, so it compresses far harder than a real photograph would.
The tests assert direction and bounds — smaller, decodable, correct dimensions —
never a specific ratio. Do not quote numbers measured on it as product claims.

EXIF-bearing and metadata-bearing variants are built inside `tests/unit/metadata.test.ts`
by splicing real segments into these files, so the exact bytes under test are
visible in the test rather than hidden in a binary.
