# Third-Party Notices

Inbox Buddy is proprietary software of Wright AI Solutions LLC. It is not licensed for
redistribution, and it is offered only as a hosted service: the code and its dependencies
are not distributed to users. Only the compiled browser bundle (Next.js, React, and the
client components listed below) is sent to browsers.

The runtime dependencies (from `package-lock.json`, excluding development-only tools) are
under these licenses:

| License | Packages | Notes |
|---|---|---|
| MIT | 170 | Including Next.js, React, NextAuth, react-markdown, lucide-react, zod |
| Apache-2.0 | 28 | Including googleapis, @google/genai |
| BSD-3-Clause, BSD, 0BSD, ISC | 21 | |
| LGPL-3.0-or-later | `@img/sharp-libvips-*` 1.3.3 and the platform builds of `@img/sharp-*` 0.35.4 (Apache-2.0 AND LGPL-3.0-or-later) | Optional prebuilt image-processing binaries that Next.js may load on the server for image optimisation. Used unmodified, on the server only; never sent to browsers. Source: https://github.com/lovell/sharp-libvips and https://github.com/libvips/libvips |
| CC-BY-4.0 | `caniuse-lite` 1.0.30001810 | Browser-support data used at build time. Attribution: data from caniuse.com by Alexis Deveria, https://caniuse.com, licensed CC BY 4.0 |
| SIL Open Font License 1.1 | `geist` 1.7.2 | The Geist and Geist Mono fonts by Vercel, served to browsers. Copyright (c) 2023 Vercel, in collaboration with basement.studio. The fonts are used unmodified and not sold on their own |

Development-only tools (tests, linting, type checking) are not part of the service and
include some MPL-2.0 packages, which are used unmodified.

Whether the LGPL-3.0 components carry any obligation for hosted-only use is one of the
open questions for counsel (see the Legal Check report); the working assumption is that
no obligation is triggered because nothing is distributed.

To regenerate the counts: read `packages` in `package-lock.json`, skip entries marked
`dev`, and group by `license`.
