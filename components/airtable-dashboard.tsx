'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AirtableHistoryTable } from '@/components/airtable-history-table';
import { AirtableBatchArchive } from '@/components/airtable-batch-archive';

type Budget = {
  totalReceived: number;
  totalPaid: number;
  companyRemaining: number;
  accountName?: string;
};

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AirtableDashboard({
  budget,
  loading,
  onRefresh,
  onBudgetUpdate,
}: {
  budget: Budget | null;
  loading: boolean;
  onRefresh: () => void;
  onBudgetUpdate: (budget: Budget | null) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refreshAll = () => {
    onRefresh();
    setRefreshKey((value) => value + 1);
  };
  const metrics = [
    { label: 'إجمالي المستلم من المشتركين', value: budget?.totalReceived, tone: 'before:bg-emerald-400', hint: 'المبالغ المسجلة' },
    { label: 'إجمالي المدفوع للشركة', value: budget?.totalPaid, tone: 'before:bg-amber-300', hint: 'الإيداعات المسجلة' },
    { label: 'المتبقي بذمتك للشركة', value: budget?.companyRemaining, tone: 'before:bg-pink-400', hint: 'المستلم ناقص المدفوع' },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 select-text" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-xs text-[#91a7a4]">المالية / {budget?.accountName || 'الحساب الرئيسي'}</p>
          <h1 className="text-xl font-bold text-[#f0f6f3] sm:text-2xl">الميزانية العامة</h1>
          <p className="mt-1 text-xs text-[#9cafaa] sm:text-sm">الحوالات والمدفوعات في مكان واحد، والأحدث يظهر أولاً.</p>
        </div>
        <button type="button" onClick={refreshAll} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#34423f] bg-[#1a2424] px-3 text-xs font-bold text-[#d6e4de] transition hover:bg-[#243230] disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث البيانات
        </button>
      </header>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3" aria-label="ملخص الميزانية">
        {metrics.map((metric, index) => (
          <div key={metric.label} className={`relative min-w-0 overflow-hidden rounded-xl border border-[#2c3b3c] bg-[#182125] px-3 py-3.5 before:absolute before:bottom-3 before:right-0 before:top-3 before:w-[3px] before:rounded-l ${metric.tone} ${index === 2 ? 'col-span-2 md:col-span-1' : ''} sm:px-4`}>
            <div className="text-[11px] font-semibold leading-5 text-[#abc0ba] sm:text-xs">{metric.label}</div>
            <div className="mt-2 flex flex-wrap items-baseline gap-1.5" dir="ltr">
              <strong className="text-xl font-bold tabular-nums tracking-tight text-[#f4f8f5] sm:text-2xl">{metric.value == null ? '—' : money.format(metric.value)}</strong>
              {metric.value != null && <span className="text-[11px] font-bold text-[#a5b9b5]">JOD</span>}
            </div>
            <div className="mt-1 text-[11px] text-[#829a95]">{metric.hint}</div>
          </div>
        ))}
      </div>

      <AirtableHistoryTable onBudgetUpdate={onBudgetUpdate} refreshKey={refreshKey} />
      <AirtableBatchArchive onCleared={() => { onRefresh(); window.location.reload(); }} />
    </div>
  );
}
