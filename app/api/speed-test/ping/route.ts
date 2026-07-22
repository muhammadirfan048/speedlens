import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const isLocal = isLocalHostname(request.nextUrl.hostname);

  return NextResponse.json(
    {
      serverTime: Date.now(),
      server: isLocal
        ? {
            name: "SpeedLens Local",
            location: "This device",
            region: "Loopback",
          }
        : {
            name: "SpeedLens App Server",
            location: "Current deployment",
            region: "Auto",
          },
    },
    {
      headers: {
        "Cache-Control": "no-store, no-transform",
      },
    },
  );
}

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
