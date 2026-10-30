"use client";

import { useEffect, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type AirtableRecord = { id: string; fields: Record<string, unknown> };

const fieldDefinitions = [
  { key: 'اسم المشترك', label: 'اسم المشترك', required: true },
  { key: 'اسم المرسل', label: 'اسم المرسل', required: true },
  { key: 'رقم الحوالة', label: 'رقم الحوالة' },
  { key: 'بريد الاكتروني', label: 'البريد الإلكتروني', type: 'email' },
  { key: 'التاريخ', label: 'تاريخ الحوالة', type: 'date' },
  { key: 'المبلغ الأصلي (قبل العمولة)', label: 'المبلغ الأصلي', type: 'number' },
  { key: 'المبلغ المودع (بعد العمولة)', label: 'المبلغ بعد العمولة', type: 'number' },
] as const;

function initialDraft(fields: Record<string, unknown>) {
  const draft: Record<string, string> = {};
  for (const { key } of fieldDefinitions) draft[key] = String(fields[key] ?? '');
  for (const key of ['المحفظة/الاستلام', 'الحالة', 'ملاحظات']) draft[key] = String(fields[key] ?? '');
  return draft;
}

export function AirtableTransferEditor({ record, statusOptions, onClose, onSaved }: {
  record: AirtableRecord;
  statusOptions: string[];
  onClose: () => void;
  onSaved: (record: AirtableRecord) => void;
}) {
  const [draft, setDraft] = useState(() => initialDraft(record.fields));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  const update = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const changed: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(draft)) {
      if (value.trim() === String(record.fields[key] ?? '').trim()) continue;
      changed[key] = key.startsWith('المبلغ') ? Number(value) : value.trim();
    }
    if (Object.keys(changed).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/transfers/airtable/${encodeURIComponent(record.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: changed }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'تعذر حفظ التعديل');
      onSaved(result.record);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ التعديل');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm" dir="rtl" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form onSubmit={save} className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[#3b4340] bg-[#181d1b] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-emerald-500/15 p-2 text-emerald-400"><Pencil className="h-5 w-5" /></span>
            <div><h2 className="text-base font-bold text-white">تعديل سجل الحوالة</h2><p className="text-xs text-slate-400">التعديلات تُحفظ مباشرة في Airtable</p></div>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="إغلاق" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          {fieldDefinitions.map(({ key, label, ...options }) => (
            <label key={key} className="flex flex-col gap-1.5 text-xs font-semibold text-slate-300">
              <span>{label}</span>
              <Input
                type={'type' in options ? options.type : 'text'}
                required={'required' in options && options.required}
                min={'type' in options && options.type === 'number' ? '0' : undefined}
                step={'type' in options && options.type === 'number' ? '0.01' : undefined}
                value={draft[key]}
                onChange={(event) => update(key, event.target.value)}
                className="h-11 border-white/10 bg-[#101412] text-sm text-white"
                dir={key === 'بريد الاكتروني' || key === 'رقم الحوالة' ? 'ltr' : undefined}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-300">
            <span>طريقة الاستلام</span>
            <select value={draft['المحفظة/الاستلام']} onChange={(event) => update('المحفظة/الاستلام', event.target.value)} className="h-11 rounded-md border border-white/10 bg-[#101412] px-3 text-sm text-white">
              <option value="">غير محددة</option><option value="كاش (يدوي)">كاش يدوي</option><option value="زين كاش">زين كاش</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-300">
            <span>الحالة</span>
            <select value={draft['الحالة']} onChange={(event) => update('الحالة', event.target.value)} className="h-11 rounded-md border border-white/10 bg-[#101412] px-3 text-sm text-white">
              <option value="">غير محددة</option>
              {statusOptions.filter(Boolean).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-300 sm:col-span-2">
            <span>ملاحظات</span>
            <textarea value={draft['ملاحظات']} onChange={(event) => update('ملاحظات', event.target.value)} rows={3} className="rounded-md border border-white/10 bg-[#101412] p-3 text-sm text-white" />
          </label>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
          <span role="alert" className="text-xs text-rose-400">{error}</span>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button><Button type="submit" disabled={saving} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"><Check className="h-4 w-4" />{saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}</Button></div>
        </div>
      </form>
    </div>
  );
}
