// Airtable limits requests per base. Space requests from this server process and
// honor its cooldown when it responds with 429.
const REQUEST_SPACING_MS = 250;
const DEFAULT_RETRY_MS = 30_000;
const MAX_RETRY_MS = 120_000;
type RateState = { nextRequestAt: number; rateLimitUntil: number; billingLimitUntil: number };
const globalRate = globalThis as typeof globalThis & { hawalatAirtableRateState?: RateState };
const rate = globalRate.hawalatAirtableRateState ||= { nextRequestAt: 0, rateLimitUntil: 0, billingLimitUntil: 0 };
rate.billingLimitUntil ||= 0;

function billingLimitResponse(): Response {
  return new Response(JSON.stringify({ errors: [{ error: 'PUBLIC_API_BILLING_LIMIT_EXCEEDED' }] }), {
    status: 429,
    headers: { 'Content-Type': 'application/json' },
  });
}

function retryDelay(response: Response): number {
  const header = response.headers.get('Retry-After');
  if (!header) return DEFAULT_RETRY_MS;
  const seconds = Number(header);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(delay) ? Math.min(MAX_RETRY_MS, Math.max(0, delay)) : DEFAULT_RETRY_MS;
}

async function errorType(response: Response): Promise<string | null> {
  const body = await response.clone().json().catch(() => null);
  const error = body?.error ?? body?.errors?.[0]?.error;
  return typeof error === 'string' ? error : typeof error?.type === 'string' ? error.type : null;
}

export async function airtableReadError(response: Response, context: string): Promise<Error> {
  if (response.status === 429) {
    const type = await errorType(response);
    return new Error(type === 'PUBLIC_API_BILLING_LIMIT_EXCEEDED'
      ? 'نفدت حصة طلبات Airtable الشهرية للمساحة التي تحتوي على هذه القاعدة. تحقق من الاستهلاك والخطة في Airtable.'
      : 'تجاوز Airtable حد الطلبات مؤقتاً. حاول بعد قليل.');
  }
  return new Error(`${context}: ${response.statusText || response.status}`);
}

async function waitForSlot(): Promise<void> {
  while (true) {
    const now = Date.now();
    const delay = Math.max(rate.nextRequestAt - now, rate.rateLimitUntil - now);
    if (delay <= 0) {
      rate.nextRequestAt = now + REQUEST_SPACING_MS;
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}

export async function airtableFetch(url: string, init?: RequestInit): Promise<Response> {
  const canRetry = !init?.method || init.method.toUpperCase() === 'GET';
  for (let attempt = 0; ; attempt++) {
    if (Date.now() < rate.billingLimitUntil) return billingLimitResponse();
    await waitForSlot();
    if (Date.now() < rate.billingLimitUntil) return billingLimitResponse();
    const response = await fetch(url, init);
    if (response.status !== 429) return response;
    if (await errorType(response) === 'PUBLIC_API_BILLING_LIMIT_EXCEEDED') {
      rate.billingLimitUntil = Date.now() + 5 * 60_000;
      return response;
    }
    rate.rateLimitUntil = Math.max(rate.rateLimitUntil, Date.now() + retryDelay(response));
    if (!canRetry || attempt >= 2) return response;
  }
}
