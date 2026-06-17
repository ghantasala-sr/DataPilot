import { NextRequest, NextResponse } from 'next/server';

const backendUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export async function POST(request: NextRequest) {
  try {
    const response = await fetch(`${backendUrl.replace(/\/$/, '')}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('Authorization') || 'Bearer test-mock-token',
      },
      body: await request.text(),
    });

    const text = await response.text();
    const contentType = response.headers.get('Content-Type') || '';

    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        {
          status: 'error',
          message: text || `Backend returned HTTP ${response.status}.`,
          fallback_used: true,
          fallback_type: 'frontend_proxy_non_json',
        },
        { status: response.status },
      );
    }

    return new NextResponse(text, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend request failed.';

    return NextResponse.json(
      {
        status: 'error',
        message,
      },
      { status: 502 },
    );
  }
}
