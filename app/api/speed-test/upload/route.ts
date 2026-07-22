import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 20_000_000;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");

  if (contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Upload sample is too large" }, { status: 413 });
  }

  const body = await request.arrayBuffer();

  if (body.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Upload sample is too large" }, { status: 413 });
  }

  return NextResponse.json(
    {
      receivedBytes: body.byteLength,
      serverTime: Date.now(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
