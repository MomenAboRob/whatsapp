import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/auth';
import { getWhatsAppManager } from '@/lib/whatsapp-client';
import { addNumberBranchMember, addNumberFiles, allocateNumbers, allocationMessageText, createNumberBranch, deleteNumberBranch, deleteNumberFile, numberCenterSummary, readNumberCenter, removeNumberBranchMember, renameNumberBranch } from '@/lib/number-center';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET(req: NextRequest) {
  const user = getAuthUserFromRequest(req);
  if (!user) return bad('غير مصرح', 401);
  const data = readNumberCenter(user.id);
  const draftId = req.nextUrl.searchParams.get('draft');
  if (draftId) {
    const allocation = data.allocations.find((item) => item.id === draftId);
    if (!allocation) return bad('التوزيع غير موجود', 404);
    return NextResponse.json({ success: true, text: allocationMessageText(allocation), personJid: allocation.personJid, personName: allocation.personName }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  const downloadId = req.nextUrl.searchParams.get('download');
  if (downloadId) {
    const allocation = data.allocations.find((item) => item.id === downloadId);
    if (!allocation) return bad('التوزيع غير موجود', 404);
    const body = `\uFEFF${allocationMessageText(allocation)}\n`;
    return new Response(body, { headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="numbers-${allocation.id}.txt"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  }
  const wa = getWhatsAppManager(req);
  const contacts = wa.getUserGroups()
    .filter((chat) => chat.name && /@(s\.whatsapp\.net|lid)$/.test(chat.id))
    .map((chat) => ({ id: chat.id, name: chat.name, phone: chat.phone }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  return NextResponse.json({ success: true, ...numberCenterSummary(data), contacts });
}

export async function POST(req: NextRequest) {
  const user = getAuthUserFromRequest(req);
  if (!user) return bad('غير مصرح', 401);
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) return bad('مصدر الطلب غير صالح', 403);
  if (req.headers.get('content-type')?.includes('multipart/form-data')) {
    const form = await req.formData();
    const files = form.getAll('files');
    if (!files.length || files.length > 20) return bad('اختر من ملف واحد إلى 20 ملفًا');
    const uploads: Array<{ name: string; text: string }> = [];
    for (const file of files) {
      if (!(file instanceof File) || !/\.(txt|csv)$/i.test(file.name) || file.size < 1 || file.size > 20 * 1024 * 1024) return bad('استخدم ملفات TXT أو CSV بحجم لا يتجاوز 20 ميغابايت للملف');
      uploads.push({ name: file.name, text: await file.text() });
    }
    try { return NextResponse.json({ success: true, uploaded: addNumberFiles(user.id, uploads) }); }
    catch (error) { return bad(error instanceof Error ? error.message : 'تعذر قراءة الملفات'); }
  }
  let body: { action?: string; fileId?: string; branchId?: string; name?: string; memberId?: string; recipientIds?: unknown; perPerson?: unknown };
  try { body = await req.json(); } catch { return bad('طلب غير صالح'); }
  if (body.action === 'delete_file') {
    try { return NextResponse.json({ success: true, deleted: deleteNumberFile(user.id, String(body.fileId || '')) }); }
    catch (error) { return bad(error instanceof Error ? error.message : 'تعذر حذف الملف'); }
  }
  if (body.action === 'create_branch' || body.action === 'rename_branch' || body.action === 'remove_branch_member' || body.action === 'delete_branch') {
    try {
      const branch = body.action === 'create_branch' ? createNumberBranch(user.id, String(body.name || ''))
        : body.action === 'rename_branch' ? renameNumberBranch(user.id, String(body.branchId || ''), String(body.name || ''))
        : body.action === 'remove_branch_member' ? removeNumberBranchMember(user.id, String(body.branchId || ''), String(body.memberId || ''))
        : deleteNumberBranch(user.id, String(body.branchId || ''));
      return NextResponse.json({ success: true, branch });
    } catch (error) { return bad(error instanceof Error ? error.message : 'تعذر تعديل الفرع'); }
  }
  if (body.action === 'add_branch_member') {
    const memberId = String(body.memberId || '');
    const contact = getWhatsAppManager(req).getUserGroups().find((chat) => chat.id === memberId && chat.name && /@(s\.whatsapp\.net|lid)$/.test(chat.id));
    if (!contact) return bad('الشخص غير موجود في جهات الاتصال');
    try { return NextResponse.json({ success: true, branch: addNumberBranchMember(user.id, String(body.branchId || ''), { id: contact.id, name: contact.name }) }); }
    catch (error) { return bad(error instanceof Error ? error.message : 'تعذر إضافة الشخص'); }
  }
  if (body.action !== 'allocate') return bad('إجراء غير صالح');
  const branch = readNumberCenter(user.id).branches.find((item) => item.id === body.branchId);
  if (!branch) return bad('اختر فرعًا محفوظًا أولًا');
  const recipients = branch.members;
  try {
    const allocations = allocateNumbers(user.id, String(body.fileId || ''), recipients, Number(body.perPerson));
    return NextResponse.json({ success: true, allocations: allocations.map((item) => ({ id: item.id, personName: item.personName, count: item.numbers.length })) });
  } catch (error) { return bad(error instanceof Error ? error.message : 'تعذر توزيع الأرقام'); }
}
