import { NextRequest, NextResponse } from 'next/server';

// Serve SVG as favicon when browsers request /favicon.ico
export async function GET(request: NextRequest) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32" height="32">
  <text y=".9em" font-size="90" font-family="Arial, sans-serif">🎧</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
