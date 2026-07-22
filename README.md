# SpeedLens

A minimal, dark-first internet speed test built with Next.js App Router, React, TypeScript, TailwindCSS, Framer Motion, and Lucide Icons.

SpeedLens measures against Fast.com/Netflix speed-test targets by default so results line up with Fast.com more closely and local development does not accidentally benchmark `localhost`/loopback speed. If those targets are not usable in a deployed environment, the app automatically retries against Cloudflare's public speed-test endpoints.

## Run

```bash
npm install
npm run dev
```

The test starts automatically on page load. The speed engine lives in `services/SpeedTestService.ts` and can be pointed at Cloudflare or local app-server endpoints with optional environment variables.

On hosts such as Vercel, Fast.com target discovery runs from the deployed server route. If Netflix returns target URLs that the browser cannot use, SpeedLens falls back to Cloudflare instead of leaving the test stuck at latency analysis.

## Optional Environment

No API key is required for the default setup.

```bash
NEXT_PUBLIC_SPEED_TEST_PROVIDER=fast
NEXT_PUBLIC_SPEED_TEST_PROVIDER_NAME="Fast.com / Netflix"
NEXT_PUBLIC_FAST_TARGETS_URL="/api/speed-test/fast-targets"
```

For Cloudflare speed-test endpoints, set:

```bash
NEXT_PUBLIC_SPEED_TEST_PROVIDER=cloudflare
NEXT_PUBLIC_SPEED_TEST_PROVIDER_NAME="Cloudflare Speed Test"
NEXT_PUBLIC_SPEED_TEST_DOWNLOAD_URL="https://speed.cloudflare.com/__down"
NEXT_PUBLIC_SPEED_TEST_UPLOAD_URL="https://speed.cloudflare.com/__up"
NEXT_PUBLIC_SPEED_TEST_METADATA_URL="https://speed.cloudflare.com/meta"
```

For app-server-only development testing, set:

```bash
NEXT_PUBLIC_SPEED_TEST_PROVIDER=local
```
