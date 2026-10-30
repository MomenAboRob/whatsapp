import { NextRequest, NextResponse } from 'next/server';
import { getCompanyDeposits, createCompanyDeposit, updateCompanyDeposit } from '@/lib/airtable';
import { getAuthUserFromRequest } from '@/lib/auth';

export async function GET() {
  try {
    const deposits = await getCompanyDeposits(100);
    return NextResponse.json({ success: true, deposits });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const amount = Number(body.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: 'يرجى إدخال مبلغ إيداع صحيح أكبر من صفر.' }, { status: 400 });
    }

    const date = body.date || new Date().toISOString().split('T')[0];

    const result = await createCompanyDeposit({
      amount,
      date,
      receiptUrl: body.receiptUrl,
      receiptBase64: body.receiptBase64,
      receiptFilename: body.receiptFilename,
      notes: body.notes,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      record: result.record,
      budget: result.budget,
      message: `تم توثيق إيداع مبلغ ${amount} JOD للشركة بنجاح في أيرتيبل!`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!getAuthUserFromRequest(req)) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000 || typeof body.date !== 'string') {
      return NextResponse.json({ success: false, error: 'بيانات الإيداع غير صالحة' }, { status: 400 });
    }
    const { record, budget } = await updateCompanyDeposit(String(body.recordId || ''), {
      amount,
      date: body.date,
      receiptBase64: typeof body.receiptBase64 === 'string' ? body.receiptBase64 : undefined,
      receiptFilename: typeof body.receiptFilename === 'string' ? body.receiptFilename : undefined,
    });
    return NextResponse.json({ success: true, record, budget });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'تعذر تعديل الإيداع';
    const status = /غير صالح|غير مكتملة/.test(message) ? 400 : 502;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
