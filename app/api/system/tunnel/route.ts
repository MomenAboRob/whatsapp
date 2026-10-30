import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tailscaleAccess(): { url: string; mode: 'funnel' | 'tailscale' } | null {
  const executable = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Tailscale', 'tailscale.exe');
  if (!fs.existsSync(executable)) return null;
  try {
    const config = JSON.parse(execFileSync(executable, ['serve', 'status', '--json'], {
      encoding: 'utf8', timeout: 3000, windowsHide: true,
    })) as { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>; AllowFunnel?: Record<string, boolean> };
    const match = Object.entries(config.Web || {}).find(([name, entry]) =>
      /^[a-z0-9.-]+\.ts\.net:443$/i.test(name) &&
      (entry.Handlers?.['/']?.Proxy === 'http://127.0.0.1:3011' || entry.Handlers?.['/']?.Proxy === 'http://127.0.0.1:3010'));
    if (!match) return null;
    const [host, entry] = match;
    const isPublic = config.AllowFunnel?.[host] === true && entry.Handlers?.['/']?.Proxy === 'http://127.0.0.1:3011';
    if (config.AllowFunnel?.[host] && !isPublic) return null;
    return { url: `https://${host.replace(/:443$/, '')}`, mode: isPublic ? 'funnel' : 'tailscale' };
  } catch { return null; }
}

export async function GET() {
  try {
    const access = tailscaleAccess();
    if (access) return NextResponse.json({
      active: true, url: access.url, mode: access.mode,
      message: access.mode === 'funnel' ? 'رابط عام ثابت؛ افتحه من الهاتف دون Tailscale بعد تسجيل الدخول' : 'رابط خاص ثابت؛ افتحه من هاتف متصل بنفس حساب Tailscale',
    });

    return NextResponse.json({
      active: false,
      url: null,
      mode: null,
      message: 'لم يجهز رابط الهاتف بعد',
    });
  } catch (error: unknown) {
    return NextResponse.json({ active: false, url: null, error: error instanceof Error ? error.message : 'تعذر قراءة رابط الهاتف' }, { status: 500 });
  }
}
