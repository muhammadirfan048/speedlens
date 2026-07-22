# SpeedLens Architecture

## Purpose

SpeedLens is a minimal, dark-first internet speed test application. It runs an automatic browser-based speed test, displays download speed as the primary metric, and shows upload, ping, jitter, packet loss, advanced network diagnostics, and local hardware diagnostics after or during the test.

The current implementation measures the network path between the user's browser and the same Next.js server that serves the app. It does not currently use an external speed-test provider, external test-node network, database, authentication system, analytics service, or AI service.

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
  | same-origin fetch calls
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

The backend is implemented with Next.js App Router route handlers under `app/api/speed-test`. These endpoints are same-origin APIs used only by the browser speed-test service.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/speed-test/ping` | `GET` | Returns server time and basic server identity for discovery and latency samples. |
| `/api/speed-test/payload` | `GET` | Streams a deterministic binary payload for download measurement. Requested byte count is clamped between 64 KB and 40 MB. |
| `/api/speed-test/upload` | `POST` | Reads an octet-stream upload sample and returns received byte count. Upload size is capped at 20 MB. |

All three endpoints set `dynamic = "force-dynamic"` and disable caching with `Cache-Control: no-store, no-transform` so browser and intermediary caches do not distort measurements.

There is no separate backend server, database, queue, scheduled worker, or persistent storage layer.

## Speed Test Service

`services/SpeedTestService.ts` is the main domain/service layer. It manages the full test lifecycle:

1. Connect to the local app server.
2. Discover server identity through `/api/speed-test/ping`.
3. Measure latency using multiple ping samples.
4. Measure download speed by fetching binary payloads of increasing size.
5. Measure upload speed by posting generated binary payloads.
6. Estimate jitter and packet loss from latency samples.
7. Collect browser/network diagnostics.
8. Emit progress snapshots and final results to React subscribers.

The service uses `AbortController` so retries and component unmounts can stop in-flight work. Results are kept only in memory inside the service instance.

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

IPv4 and IPv6 values currently show placeholder text: `Detect via edge endpoint`. There is no implemented IP detection endpoint yet.

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

No external service is currently used by the app code.

Current service usage:

| Service type | Current usage |
| --- | --- |
| External APIs | None. |
| API keys | None required. |
| Database | None. |
| Authentication | None. |
| Object/file storage | None. |
| Analytics/monitoring | None. |
| AI provider | None. The UI labels AI diagnosis as disabled. |
| Speed-test provider | None. Measurements use the deployed app server. |

The only `fetch()` calls in the source point to same-origin routes under `/api/speed-test/*`.

## Environment Variables and API Keys

The current code does not read `process.env`, `NEXT_PUBLIC_*`, or any secret/API-key variables. No `.env` file is required to run the app locally.

Required today:

```text
No API keys required.
No environment variables required.
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

- Speed results measure the connection between the browser and the deployed app server.
- Hosting bandwidth limits can affect results and cost because the app intentionally transfers binary data.
- Serverless/body-size limits may affect upload samples. The current upload endpoint caps samples at 20 MB.
- CDN or proxy caching should stay disabled for speed-test endpoints.
- Compression should not be applied to the download payload route. The endpoint sets `Content-Encoding: identity`.

## Current Limitations

- Results are not a global "nearest server" speed test; they are app-server-relative.
- Packet loss is estimated from latency variance, not measured through packet-level loss telemetry.
- DNS lookup time is estimated from ping, not measured directly.
- IPv4 and IPv6 detection are placeholders.
- No historical result tracking exists.
- No auth, accounts, sharing, PDF export, ISP comparison, or AI diagnosis is implemented yet.

## Run Commands

```bash
npm install
npm run dev
npm run build
npm run typecheck
```
