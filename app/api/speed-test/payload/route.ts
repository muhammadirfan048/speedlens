import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MIN_BYTES = 64_000;
const MAX_BYTES = 40_000_000;
const CHUNK_BYTES = 64_000;
const payloadChunk = createPayloadChunk(CHUNK_BYTES);

export function GET(request: NextRequest) {
  const bytes = normalizeByteCount(request.nextUrl.searchParams.get("bytes"));
  let sentBytes = 0;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const remainingBytes = bytes - sentBytes;

      if (remainingBytes <= 0) {
        controller.close();
        return;
      }

      const chunkLength = Math.min(remainingBytes, payloadChunk.byteLength);
      controller.enqueue(payloadChunk.slice(0, chunkLength));
      sentBytes += chunkLength;
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      "Content-Encoding": "identity",
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes),
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizeByteCount(value: string | null): number {
  const requestedBytes = Number(value ?? "250000");

  if (!Number.isFinite(requestedBytes)) {
    return MIN_BYTES;
  }

  return Math.min(Math.max(Math.floor(requestedBytes), MIN_BYTES), MAX_BYTES);
}

function createPayloadChunk(bytes: number): Uint8Array {
  const chunk = new Uint8Array(bytes);

  for (let index = 0; index < chunk.byteLength; index += 1) {
    chunk[index] = (index * 31 + 17) % 256;
  }

  return chunk;
}
