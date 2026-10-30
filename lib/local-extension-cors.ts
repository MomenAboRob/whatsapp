import type { NextRequest } from 'next/server';

export function localExtensionCors(req: NextRequest, methods: string): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}
