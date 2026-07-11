import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ models: [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = body.token || '';

    if (!token) {
      return NextResponse.json({ models: [] });
    }

    const url = 'http://127.0.0.1:18789/v1/models';
    const resp = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token },
    });

    if (!resp.ok) return NextResponse.json({ models: [] });
    const data = await resp.json();
    const models = (data.data || []).map((m: any) => m.id).filter(Boolean);
    return NextResponse.json({ models });
  } catch (e: any) {
    console.error('[models] error:', e?.message);
    return NextResponse.json({ models: [] });
  }
}
