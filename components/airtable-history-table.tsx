"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Building2, CheckCircle2, Download, UploadCloud } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/floating-toast';
import { AirtableTransferEditor } from '@/components/airtable-transfer-editor';
import { AirtableRecordsView } from '@/components/airtable-records-view';
import type { Deposit, TransferRecord } from '@/components/airtable-records-view';

type Budget = {
  totalReceived: number;
  totalPaid: number;
  companyRemaining: number;
  accountName?: string;
};

interface AirtableHistoryTableProps {
  onBudgetUpdate?: (budget: Budget | null) => void;
  refreshKey?: number;
}

const todayInAmman = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export function AirtableHistoryTable({ onBudgetUpdate, refreshKey = 0 }: AirtableHistoryTableProps = {}) {
  // البيانات
  const [records, setRecords] = useState<TransferRecord[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);

  const [loading, setLoading] = useState(true);
  const [editingRecord, setEditingRecord] = useState<TransferRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  // نافذة معاينة صورة الوصل (Lightbox)
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // نافذة إضافة إيداع جديد للشركة
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositDate, setDepositDate] = useState<string>(todayInAmman);
  const [depositSlipBase64, setDepositSlipBase64] = useState<string>('');
  const [depositSlipFilename, setDepositSlipFilename] = useState<string>('');
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);

  useEffect(() => {
    const onMobileBack = (event: Event) => {
      const back = event as CustomEvent<{ scope: string; handled: boolean }>;
      if (back.detail.scope !== 'dashboard' || back.detail.handled) return;
      if (previewImage) setPreviewImage(null);
      else if (editingRecord) setEditingRecord(null);
      else if (isDepositModalOpen) setIsDepositModalOpen(false);
      else return;
      back.detail.handled = true;
    };
    window.addEventListener('hawalat-mobile-back', onMobileBack);
    return () => window.removeEventListener('hawalat-mobile-back', onMobileBack);
  }, [previewImage, editingRecord, isDepositModalOpen]);

  // جلب كافة البيانات من أيرتيبل (الحوالات + الميزانية + الإيداعات)
  const fetchData = useCallback(async (force = false) => {
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/transfers/airtable${force ? '?refresh=1' : ''}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setRecords(data.records || []);
        if (data.deposits) {
          setDeposits(data.deposits);
        }
        if (data.budget) {
          setBudget(data.budget);
          if (onBudgetUpdate) {
            onBudgetUpdate(data.budget);
          }
        }
      } else {
        setError(data.error || 'تعذر جلب البيانات من أيرتيبل');
        setRecords([]);
        setDeposits([]);
        setBudget(null);
        onBudgetUpdate?.(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'خطأ في الاتصال بسيرفر أيرتيبل');
      setRecords([]);
      setDeposits([]);
      setBudget(null);
      onBudgetUpdate?.(null);
    } finally {
      setLoading(false);
    }
  }, [onBudgetUpdate]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  useEffect(() => {
    if (refreshKey === 0) return;
    const timer = window.setTimeout(() => void fetchData(true), 0);
    return () => window.clearTimeout(timer);
  }, [fetchData, refreshKey]);

  // معالجة اختيار صورة الوصل للإيداع الجديد
  const handleDepositFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDepositSlipFilename(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      setDepositSlipBase64(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const openNewDeposit = () => {
    setEditingDeposit(null);
    setDepositAmount('');
    setDepositDate(todayInAmman());
    setDepositSlipBase64('');
    setDepositSlipFilename('');
    setIsDepositModalOpen(true);
  };

  const openEditDeposit = (deposit: Deposit) => {
    setEditingDeposit(deposit);
    setDepositAmount(String(deposit.amount ?? ''));
    setDepositDate(String(deposit.date || todayInAmman()));
    setDepositSlipBase64('');
    setDepositSlipFilename('');
    setIsDepositModalOpen(true);
  };

  // حفظ أو تعديل إيداع للشركة
  const handleSaveDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(depositAmount);
    if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
      toast.error('يرجى كتابة مبلغ إيداع صحيح أكبر من صفر.', 'تنبيه');
      return;
    }

    setIsSubmittingDeposit(true);
    try {
      const res = await fetch('/api/transfers/airtable/deposits', {
        method: editingDeposit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId: editingDeposit?.id,
          amount: amountNum,
          date: depositDate,
          receiptBase64: depositSlipBase64 || undefined,
          receiptFilename: depositSlipFilename || undefined,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(editingDeposit ? 'تم تعديل الإيداع في أيرتيبل' : `تم توثيق إيداع مبلغ ${amountNum} JOD للشركة`, 'إيداعات الشركة');
        setIsDepositModalOpen(false);
        setEditingDeposit(null);
        setDepositAmount('');
        setDepositSlipBase64('');
        setDepositSlipFilename('');
        // تحديث البيانات
        void fetchData();
      } else {
        toast.error(json.error || 'فشل حفظ الإيداع في أيرتيبل', 'خطأ في الحفظ');
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'حدث خطأ في الاتصال', 'خطأ');
    } finally {
      setIsSubmittingDeposit(false);
    }
  };

  const statusOptions = useMemo(() => Array.from(new Set(records.map((record) => String(record.fields?.['الحالة'] || '')).filter(Boolean))), [records]);

  const handleRecordSaved = () => {
    setEditingRecord(null);
    toast.success('تم حفظ التعديلات في Airtable', 'تعديل الحوالة');
    void fetchData();
  };

  return (
    <div dir="rtl">
      <AirtableRecordsView
        records={records}
        deposits={deposits}
        loading={loading}
        error={error}
        onRefresh={() => void fetchData(true)}
        onNewDeposit={openNewDeposit}
        onEditDeposit={openEditDeposit}
        onEditTransfer={setEditingRecord}
        onPreview={setPreviewImage}
        backBlocked={Boolean(previewImage || editingRecord || isDepositModalOpen)}
      />
      {editingRecord && (
        <AirtableTransferEditor
          key={editingRecord.id}
          record={editingRecord}
          statusOptions={statusOptions}
          onClose={() => setEditingRecord(null)}
          onSaved={handleRecordSaved}
        />
      )}

      {/* نافذة معاينة صورة الوصل المكبرة (Lightbox Modal) */}
      {/* ============================================================== */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[99999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[92vh] bg-[#161718] border border-[#2e3133] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ترويسة نافذة المعاينة */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2e3133] bg-[#1a1c1d]">
              <span className="text-xs font-bold text-[#fafafa]">{previewImage.title}</span>
              <div className="flex items-center gap-2">
                <a
                  href={previewImage.url}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="px-2.5 py-1 bg-[#242729] hover:bg-[#2f3235] text-xs font-semibold text-white rounded-lg flex items-center gap-1 border border-[#3a3d40]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تنزيل</span>
                </a>
                <button
                  onClick={() => setPreviewImage(null)}
                  className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 flex items-center justify-center font-bold text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* الصورة بحجمها الكامل */}
            <div className="p-3 overflow-auto flex items-center justify-center max-h-[calc(92vh-60px)] bg-[#0d0e0e]">
              <img
                src={previewImage.url}
                alt="معاينة الوصل"
                className="max-h-[82vh] w-auto object-contain rounded-lg shadow-md"
              />
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* نافذة تسجيل إيداع جديد للشركة (New Company Deposit Modal) */}
      {/* ============================================================== */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-[9999999] flex items-end justify-center bg-black/80 p-0 backdrop-blur-md select-none sm:items-center sm:p-4">
          <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-2xl border border-[#2e3133] bg-[#161e21] shadow-2xl sm:rounded-2xl">
            {/* الترويسة */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2e3133] bg-gradient-to-r from-[#181a1b] to-[#202324]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/40 flex items-center justify-center font-bold">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#fafafa]">{editingDeposit ? 'تعديل إيداع الشركة' : 'تسجيل إيداع جديد'}</h3>
                  <p className="text-[11px] text-[#9ca3af]">المبلغ والتاريخ والوصل في مكان واحد</p>
                </div>
              </div>
              <button
                onClick={() => setIsDepositModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-[#9ca3af] flex items-center justify-center text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* النموذج */}
            <form onSubmit={handleSaveDeposit} className="p-5 flex flex-col gap-4">
              {/* مبلغ الإيداع */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#f3f4f6] flex flex-wrap items-center justify-between gap-1">
                  <span>المبلغ المودع (JOD) *</span>
                  <span className="text-[11px] font-normal text-amber-400">
                    المتبقي للشركة: {budget ? `${budget.companyRemaining.toFixed(2)} JOD` : 'غير متاح'}
                  </span>
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="اكتب المبلغ المودع بالأردني (مثلاً 170 أو 500)..."
                    className="h-11 bg-[#121314] border-[#2e3133] text-sm font-mono font-bold text-[#f3f4f6] rounded-xl pr-3 pl-12 focus-visible:ring-1 focus-visible:ring-[#3b82f6]"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#9ca3af] pointer-events-none">
                    JOD
                  </span>
                </div>

                {!editingDeposit && budget && budget.companyRemaining > 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setDepositAmount(budget.companyRemaining.toFixed(2))}
                      className="min-h-9 rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 text-xs font-bold text-amber-300"
                    >
                      كامل المتبقي ({budget.companyRemaining.toFixed(2)} JOD)
                    </button>
                  </div>
                )}
              </div>

              {/* تاريخ الإيداع */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#f3f4f6]">تاريخ الإيداع *</label>
                <Input
                  type="date"
                  required
                  value={depositDate}
                  onChange={(e) => setDepositDate(e.target.value)}
                  className="h-10 bg-[#121314] border-[#2e3133] text-xs font-mono text-[#f3f4f6] rounded-xl focus-visible:ring-1 focus-visible:ring-[#3b82f6]"
                />
              </div>

              {/* صورة وصل أو إشعار الإيداع */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#f3f4f6] flex items-center justify-between">
                  <span>صورة إشعار الإيداع البنكي (اختياري)</span>
                  {depositSlipBase64 && (
                    <button
                      type="button"
                      onClick={() => setDepositSlipBase64('')}
                      className="text-[11px] text-rose-400 hover:underline cursor-pointer"
                    >
                      إزالة الصورة
                    </button>
                  )}
                </label>

                {editingDeposit?.receipt?.url && !depositSlipBase64 && (
                  <button type="button" onClick={() => {
                    const receipt = editingDeposit.receipt;
                    if (!receipt?.url) return;
                    if (receipt.type === 'application/pdf' || /\.pdf(?:$|\?)/i.test(receipt.filename || receipt.url)) window.open(receipt.url, '_blank', 'noopener,noreferrer');
                    else setPreviewImage({ url: receipt.url, title: 'الوصل الحالي للإيداع' });
                  }} className="flex min-h-11 items-center gap-2 rounded-xl border border-[#344947] bg-[#1d2c2d] p-2 text-right text-xs text-[#c5e4d4]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#10191a]">{editingDeposit.receipt.type === 'application/pdf' ? 'PDF' : <img src={editingDeposit.receipt.thumbnails?.large?.url || editingDeposit.receipt.url} alt="" className="h-full w-full object-contain" />}</span>
                    الوصل الحالي محفوظ · اضغط للعرض أو اختر صورة جديدة لاستبداله
                  </button>
                )}
                {depositSlipBase64 ? (
                  <div className="relative w-full h-32 rounded-xl overflow-hidden border border-[#2e3133] bg-[#0f1011] flex items-center justify-center">
                    <img
                      src={depositSlipBase64}
                      alt="وصل الإيداع"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-[#2e3133] hover:border-[#3b82f6] rounded-xl bg-[#121314] hover:bg-[#181a1c] transition-colors cursor-pointer p-4 text-center">
                    <UploadCloud className="w-7 h-7 text-[#9ca3af] mb-1.5" />
                    <span className="text-xs font-bold text-[#cbd5e1]">اضغط لاختيار صورة إشعار الإيداع</span>
                    <span className="text-[10.5px] text-[#6b7280] mt-0.5">JPG أو PNG</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleDepositFileChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* أزرار الإرسال */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#2e3133]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="text-xs h-10 px-4 text-[#9ca3af] hover:text-[#f3f4f6] rounded-xl cursor-pointer"
                >
                  إلغاء
                </Button>

                <Button
                  type="submit"
                  disabled={isSubmittingDeposit || !depositAmount}
                  className="h-10 gap-2 rounded-xl bg-emerald-500 px-5 text-xs font-bold text-[#082019] hover:bg-emerald-400 disabled:opacity-40"
                >
                  {isSubmittingDeposit ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>جارٍ الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{editingDeposit ? 'حفظ التعديل' : 'تسجيل الإيداع'}</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
