import { NextResponse } from 'next/server';
import { getAirtableOverview, getAirtableRegistrationRecords } from '@/lib/airtable';

export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.get('registration') === '1') {
      const registrationRecords = await getAirtableRegistrationRecords();
      return NextResponse.json({ success: true, registrationRecords });
    }
    const { records, registrationRecords, budget, deposits } = await getAirtableOverview(new URL(request.url).searchParams.get('refresh') === '1');
    return NextResponse.json({ success: true, records, registrationRecords, budget, deposits });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
