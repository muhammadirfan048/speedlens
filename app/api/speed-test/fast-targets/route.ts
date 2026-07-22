import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FAST_API_URL = "https://api.fast.com/netflix/speedtest/v2";
const FAST_TOKEN = "YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm";
const TARGET_COUNT = 5;

export async function GET() {
  const url = new URL(FAST_API_URL);
  url.searchParams.set("https", "true");
  url.searchParams.set("token", FAST_TOKEN);
  url.searchParams.set("urlCount", String(TARGET_COUNT));

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Unable to load Fast.com targets" },
      { status: 502 },
    );
  }

  const body = await response.json();

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
