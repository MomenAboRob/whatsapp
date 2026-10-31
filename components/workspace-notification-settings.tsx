"use client";

import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Loader2, Mail, Save, ShieldCheck } from 'lucide-react';
import type { WorkspaceSettings } from '@/lib/whatsapp-workspace';

export function WorkspaceNotificationSettings() {
  const [settings, setSettings] = useState<WorkspaceSettings>({ emailTo: '', emailEnabled: true, browserEnabled: true });
  const [smtpPassword, setSmtpPassword] = useState('');
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/whatsapp/workspace', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => {
        if (active && data.success) {
          setSettings(data.settings);
          setConfigured(Boolean(data.smtpConfigured));
        }
      })
      .catch(() => { if (active) setError('تعذر تحميل إعدادات التنبيهات'); });
    return () => { active = false; };
  }, []);

  const save = async (clearSmtp = false) => {
    setBusy(true); setError(''); setSaved(false);
    try {
      const response = await fetch('/api/whatsapp/workspace', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'settings', ...settings, smtpPassword, clearSmtp }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'تعذر حفظ الإعدادات');
      setSettings(data.settings);
      setConfigured(Boolean(data.smtpConfigured));
      setSmtpPassword('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الإعدادات');
    } finally { setBusy(false); }
  };

  const enableBrowser = async () => {
    if (!('Notification' in window)) { setError('هذا المتصفح لا يدعم إشعارات سطح المكتب'); return; }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { setError('اسمح بالإشعارات من إعدادات المتصفح أولًا'); return; }
    setSettings((current) => ({ ...current, browserEnabled: true }));
  };
  const verify = async () => {
    setVerifying(true); setError(''); setVerified(false);
    try {
      const response = await fetch('/api/whatsapp/workspace', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_smtp' }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'تعذر اختبار اتصال الإيميل');
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر اختبار اتصال الإيميل');
    } finally { setVerifying(false); }
  };

  return <div className="space-y-5 text-sm">
    <div className="rounded-2xl border border-[#2e2f2f] bg-[#1c1d1d] p-4">
      <div className="mb-4 flex items-center gap-2 font-bold"><Bell className="h-5 w-5 text-[#21c063]" />تنبيهات المنشنات</div>
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-[#161717] p-3"><span>إشعار من التطبيق عند وصول منشن جديد</span><input type="checkbox" checked={settings.browserEnabled} onChange={(event) => setSettings((current) => ({ ...current, browserEnabled: event.target.checked }))} className="h-4 w-4 accent-[#21c063]" /></label>
      <button type="button" onClick={() => void enableBrowser()} className="mt-2 text-xs font-semibold text-[#21c063] hover:underline">السماح بإشعارات المتصفح</button>
      <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-[#161717] p-3"><span>إرسال إيميل عند وصول منشن جديد</span><input type="checkbox" checked={settings.emailEnabled} onChange={(event) => setSettings((current) => ({ ...current, emailEnabled: event.target.checked }))} className="h-4 w-4 accent-[#21c063]" /></label>
      <label className="mt-3 block text-xs text-[#a5a5a5]">الإيميل المستلم<input type="email" value={settings.emailTo} onChange={(event) => setSettings((current) => ({ ...current, emailTo: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#39443c] bg-[#111716] p-2.5 text-sm text-white outline-none" /></label>
    </div>
    <div className="rounded-2xl border border-[#2e2f2f] bg-[#1c1d1d] p-4">
      <div className="mb-1 flex items-center gap-2 font-bold"><Mail className="h-5 w-5 text-[#21c063]" />ربط الإيميل للإرسال</div>
      <p className="mb-4 text-xs leading-5 text-[#a5a5a5]">أدخل بيانات SMTP لحسابك. إذا كان Gmail، استخدم كلمة مرور تطبيق مخصصة. تُحفظ كلمة المرور مشفرة على الخادم ولا تُعرض مرة أخرى.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-[#a5a5a5]">خادم SMTP<input value={settings.smtpHost || ''} onChange={(event) => setSettings((current) => ({ ...current, smtpHost: event.target.value }))} placeholder="smtp.gmail.com" className="mt-1 w-full rounded-lg border border-[#39443c] bg-[#111716] p-2.5 text-sm text-white outline-none" /></label>
        <label className="text-xs text-[#a5a5a5]">المنفذ<select value={settings.smtpPort || 465} onChange={(event) => setSettings((current) => ({ ...current, smtpPort: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-[#39443c] bg-[#111716] p-2.5 text-sm text-white outline-none"><option value={465}>465 (SSL)</option><option value={587}>587 (STARTTLS)</option></select></label>
        <label className="text-xs text-[#a5a5a5]">حساب الإرسال<input type="email" value={settings.smtpUser || ''} onChange={(event) => setSettings((current) => ({ ...current, smtpUser: event.target.value }))} placeholder="you@gmail.com" className="mt-1 w-full rounded-lg border border-[#39443c] bg-[#111716] p-2.5 text-sm text-white outline-none" /></label>
        <label className="text-xs text-[#a5a5a5]">كلمة مرور التطبيق<input type="password" autoComplete="new-password" value={smtpPassword} onChange={(event) => setSmtpPassword(event.target.value)} placeholder={configured ? 'محفوظة — اتركها فارغة للإبقاء عليها' : 'أدخل كلمة مرور التطبيق'} className="mt-1 w-full rounded-lg border border-[#39443c] bg-[#111716] p-2.5 text-sm text-white outline-none" /></label>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">{configured ? <><CheckCircle2 className="h-4 w-4 text-emerald-400" /><span className="text-emerald-300">الإرسال البريدي مُعدّ</span></> : <><ShieldCheck className="h-4 w-4 text-amber-400" /><span className="text-amber-300">أكمل الربط لتفعيل الإيميلات. إشعارات التطبيق تعمل بدونه.</span></>}</div>
    </div>
    {error && <p className="rounded-lg bg-rose-500/10 p-3 text-xs text-rose-300">{error}</p>}
    {saved && <p className="text-xs text-emerald-300">تم حفظ الإعدادات.</p>}
    {verified && <p className="text-xs text-emerald-300">اتصال SMTP ناجح. لم يُرسل أي إيميل اختبار.</p>}
    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#21c063] px-4 py-2.5 text-xs font-bold text-[#092116] disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ الإعدادات</button>{configured && <button type="button" onClick={() => void verify()} disabled={verifying} className="rounded-xl border border-[#3b5445] px-4 py-2.5 text-xs text-[#bfe0c6]">{verifying ? 'جاري الفحص...' : 'فحص الاتصال بدون إرسال'}</button>}{configured && <button type="button" onClick={() => void save(true)} disabled={busy} className="rounded-xl border border-rose-500/30 px-4 py-2.5 text-xs text-rose-300">فصل حساب الإرسال</button>}</div>
  </div>;
}
