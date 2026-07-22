# SpeedLens Architecture

## Purpose

SpeedLens is a minimal, dark-first internet speed test application. It runs an automatic browser-based speed test, displays download speed as the primary metric, and shows upload, ping, jitter, advanced network diagnostics, and local hardware diagnostics after or during the test.

The current implementation measures the network path between the user's browser and Fast.com/Netflix speed-test targets by default. This keeps SpeedLens close to Fast.com results while avoiding the common local-development bug where the app measures `localhost`/loopback speed and reports unrealistically high Mbps values.

The app does not currently use a database, authentication system, analytics service, or AI service.

## Technology Stack

| Area | Technology |
| --- | --- |
| App framework | Next.js App Router |
| UI framework | React |
| Language | TypeScript |
| Styling | Tailwind CSS v4 through PostCSS |
| Animation | Framer Motion |
| Icons | Lucide React |
| Backend runtime | Next.js route handlers |
| Package manager | npm |

## High-Level Architecture

```text
Browser
  |
  | renders
  v
app/page.tsx
  |
  v
components/SpeedTestApp.tsx
  |
  | uses
  v
hooks/useSpeedTest.ts
  |
  | creates and subscribes to
  v
services/SpeedTestService.ts
  |
  | fetches target list
  v
app/api/speed-test/fast-targets/route.ts
  |
  | returns Netflix Open Connect target URLs
  v
*.nflxvideo.net/speedtest
  |
  | optional local fallback when NEXT_PUBLIC_SPEED_TEST_PROVIDER=local
  v
app/api/speed-test/ping/route.ts
app/api/speed-test/payload/route.ts
app/api/speed-test/upload/route.ts
  |
  v
Results displayed through MetricGrid, AdvancedPanel, and HardwarePanel
```

## Frontend

The frontend is a single-page speed-test experience served from `app/page.tsx`. That route renders `components/SpeedTestApp.tsx`, which is the main client component.

Key frontend pieces:

| Path | Responsibility |
| --- | --- |
| `app/layout.tsx` | Root HTML layout, metadata, viewport, and global CSS import. |
| `app/page.tsx` | Home route. Renders `SpeedTestApp`. |
| `app/globals.css` | Tailwind import, theme tokens, dark background, typography, and speed-number sizing. |
| `components/SpeedTestApp.tsx` | Main UI, animated speed readout, progress bar, retry control, panel toggles, and lazy-loaded panels. |
| `components/MetricGrid.tsx` | Completed speed-test metric cards for download, upload, ping, jitter, and packet loss. |
| `components/AdvancedPanel.tsx` | Network and environment diagnostics from completed test results. |
| `components/HardwarePanel.tsx` | Local hardware diagnostics collected from browser APIs. |
| `hooks/useSpeedTest.ts` | React state bridge around `SpeedTestService`. Starts the test on mount and exposes retry. |
| `utils/format.ts` | Display formatting helpers. |
| `utils/browser.ts` | Browser, OS, navigator, connection, and storage helpers. |

`AdvancedPanel` and `HardwarePanel` are dynamically imported with server-side rendering disabled because they depend on browser-only APIs and are not needed for the initial render.

## Backend

The backend is implemented with Next.js App Router route handlers under `app/api/speed-test`.

`/api/speed-test/fast-targets` is used by the default Fast.com provider to fetch Netflix target URLs server-side and return them to the browser as same-origin JSON.

On deployed hosts, that server-side discovery can return Netflix URLs selected for the hosting platform rather than the end user's browser connection. If those Fast.com/Netflix targets fail during discovery, latency, download, or upload, `SpeedTestService` switches to Cloudflare's public speed-test endpoints and reruns the test.

The other endpoints are same-origin APIs used only when the app is configured for local provider mode with `NEXT_PUBLIC_SPEED_TEST_PROVIDER=local`.

They are useful for app-server development checks, but they should not be used for real internet speed results because local development can measure loopback traffic.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/speed-test/fast-targets` | `GET` | Fetches Fast.com target metadata from `https://api.fast.com/netflix/speedtest/v2`. |
| `/api/speed-test/ping` | `GET` | Returns server time and basic server identity for discovery and latency samples. |
| `/api/speed-test/payload` | `GET` | Streams a deterministic binary payload for download measurement. Requested byte count is clamped between 64 KB and 40 MB. |
| `/api/speed-test/upload` | `POST` | Reads an octet-stream upload sample and returns received byte count. Upload size is capped at 20 MB. |

All speed-test endpoints set `dynamic = "force-dynamic"` and disable caching with `Cache-Control: no-store, no-transform` so browser and intermediary caches do not distort measurements.

There is no separate backend server, database, queue, scheduled worker, or persistent storage layer.

## Speed Test Service

`services/SpeedTestService.ts` is the main domain/service layer. It manages the full test lifecycle:

1. Select the configured speed-test provider.
2. Fetch Fast.com/Netflix target URLs from `/api/speed-test/fast-targets` when using the default provider.
3. Measure latency using small ranged probes against a selected Netflix target.
4. Measure download speed by fetching ranged binary payloads of increasing size.
5. Measure upload speed by posting generated binary payloads to a selected Netflix target.
6. Calculate jitter from latency samples.
7. Collect browser/network diagnostics.
8. Emit progress snapshots and final results to React subscribers.

If a Fast.com/Netflix request fails, the service resets provider metadata, swaps to Cloudflare, and reruns the same lifecycle against Cloudflare endpoints.

The service uses `AbortController` so retries and component unmounts can stop in-flight work. Results are kept only in memory inside the service instance.

The download timer starts before `fetch()` so the measurement includes the full network request instead of only the response-body read phase.

## Diagnostics

Network diagnostics are collected in `SpeedTestService.collectDiagnostics()` using browser-exposed hints such as:

- `navigator.connection`
- `navigator.deviceMemory`
- `navigator.hardwareConcurrency`
- `navigator.userAgent`
- `navigator.userAgentData`
- screen resolution
- timezone and language

Hardware diagnostics are collected in `lib/hardwareDiagnostics.ts` and include:

- CPU thread count
- approximate RAM
- WebGL renderer
- estimated screen refresh rate
- battery summary when available
- touch support
- media-device API availability
- Bluetooth and WebGPU support flags
- localStorage, IndexedDB, and cookie availability

IPv4 or IPv6 can be populated from the default provider metadata when available. DNS lookup time, loaded latency, and packet loss are shown as unavailable unless a real measurement path is added. They are not estimated from unrelated values.

## Future Modules

The `lib/future` directory contains typed status placeholders for planned features. These modules are not currently integrated into the runtime behavior.

| Module | Current status | Likely future dependency |
| --- | --- | --- |
| `aiDiagnosis.ts` | `disabled` | AI provider API key if real AI diagnosis is added. |
| `history.ts` | `planned` | Database, browser storage, or user-account storage. |
| `ispComparison.ts` | `planned` | ISP/geolocation data provider or internal dataset. |
| `shareResult.ts` | `planned` | Share-link backend, database, or object storage. |
| `userAccounts.ts` | `planned` | Authentication provider and user database. |
| `exportPdf.ts` | `planned` | Client PDF library or server-side PDF rendering service. |
| `serverSelection.ts` | `planned` | External speed-test server list, custom server registry, or LibreSpeed-style server network. |

## External Services

Fast.com/Netflix speed-test targets are used by default. Cloudflare's public speed-test endpoints are available as an optional provider mode and as the automatic fallback when Fast.com/Netflix targets are not usable.

Current service usage:

| Service type | Current usage |
| --- | --- |
| External APIs | `https://api.fast.com/netflix/speedtest/v2` and returned `*.nflxvideo.net/speedtest` targets by default. Optional Cloudflare mode uses `https://speed.cloudflare.com/__down`, `https://speed.cloudflare.com/__up`, and `https://speed.cloudflare.com/meta`. |
| API keys | None required. |
| Database | None. |
| Authentication | None. |
| Object/file storage | None. |
| Analytics/monitoring | None. |
| AI provider | None. The UI labels AI diagnosis as disabled. |
| Speed-test provider | Fast.com/Netflix by default. Cloudflare is the automatic fallback and can also be selected directly. Local Next.js endpoints are optional development mode. |

The default provider can be changed with `NEXT_PUBLIC_SPEED_TEST_PROVIDER`.

## Environment Variables and API Keys

Required today:

```text
No API keys required.
No environment variables required.
```

Optional provider variables:

```text
NEXT_PUBLIC_SPEED_TEST_PROVIDER=fast
NEXT_PUBLIC_SPEED_TEST_PROVIDER_NAME="Fast.com / Netflix"
NEXT_PUBLIC_FAST_TARGETS_URL="/api/speed-test/fast-targets"
```

Cloudflare provider variables:

```text
NEXT_PUBLIC_SPEED_TEST_PROVIDER=cloudflare
NEXT_PUBLIC_SPEED_TEST_PROVIDER_NAME="Cloudflare Speed Test"
NEXT_PUBLIC_SPEED_TEST_DOWNLOAD_URL="https://speed.cloudflare.com/__down"
NEXT_PUBLIC_SPEED_TEST_UPLOAD_URL="https://speed.cloudflare.com/__up"
NEXT_PUBLIC_SPEED_TEST_METADATA_URL="https://speed.cloudflare.com/meta"
```

To force the old app-server measurement mode:

```text
NEXT_PUBLIC_SPEED_TEST_PROVIDER=local
```

If future features are implemented, expected environment variables might include items such as:

```text
AI_PROVIDER_API_KEY=
AUTH_SECRET=
DATABASE_URL=
PUBLIC_APP_URL=
SPEED_TEST_SERVER_REGISTRY_URL=
```

Those variables are not used today and should not be added unless the corresponding feature is implemented.

## Data and Persistence

The app currently has no persistence. Test results exist in React state and in the `SpeedTestService` instance while the page is loaded. Refreshing the page clears the result.

There is no user profile, saved history, shared result ID, server-side session, or database schema.

## Deployment Notes

SpeedLens can run anywhere that supports a standard Next.js app with App Router route handlers.

Important deployment considerations:

- Default speed results measure the connection between the browser and selected Netflix Open Connect speed-test targets.
- The default provider requires server access to `https://api.fast.com` and browser access to returned `*.nflxvideo.net` target URLs.
- Different providers can report different values because server location, peering, congestion, and methodology vary.
- If local provider mode is enabled, hosting bandwidth limits can affect results and cost because the app intentionally transfers binary data.
- If local provider mode is enabled, serverless/body-size limits may affect upload samples. The current upload endpoint caps samples at 20 MB.
- If local provider mode is enabled, CDN or proxy caching should stay disabled for speed-test endpoints.
- If local provider mode is enabled, compression should not be applied to the download payload route. The endpoint sets `Content-Encoding: identity`.

## Current Limitations

- Results should be closer to Fast.com than Cloudflare mode because they use Netflix targets, but exact values can still vary because Fast.com can change connection count, duration, target choice, and smoothing behavior.
- Packet loss is unavailable until a real packet-loss measurement path, such as a TURN/WebRTC-based test, is added.
- DNS lookup time and loaded latency are unavailable until they are measured directly.
- No historical result tracking exists.
- No auth, accounts, sharing, PDF export, ISP comparison, or AI diagnosis is implemented yet.

## Run Commands

```bash
npm install
npm run dev
npm run build
npm run typecheck
```
