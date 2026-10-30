'use client';

import React, { useState } from 'react';
import { ShieldCheck, Mail, Lock, Eye, EyeOff, LogIn, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'تعذر تسجيل الدخول، تأكد من صحة البيانات');
        setIsLoading(false);
        return;
      }

      // تم تسجيل الدخول بنجاح - مهلة 200ms لضمان استقرار الكوكي في متصفحات الجوال
      setTimeout(() => {
        window.location.replace('/');
      }, 200);
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMsg('حدث خطأ في الاتصال بالسيرفر، يرجى المحاولة لاحقاً');
      setIsLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full bg-[#161717] text-[#fafafa] flex items-center justify-center p-4 relative overflow-hidden select-none"
    >
      {/* تأثيرات إضاءة خلفية ناعمة */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-[#21c063]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-emerald-600/5 rounded-full blur-3xl pointer-events-none" />

      {/* بطاقة تسجيل الدخول الرئيسية */}
      <div className="w-full max-w-md bg-[#161717] border border-[#2e2f2f] rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 flex flex-col gap-6 backdrop-blur-md">
        {/* الترويسة والشعار */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#21c063]/20 to-emerald-950/40 border border-[#21c063]/40 flex items-center justify-center shadow-[0_0_25px_rgba(33,192,99,0.25)] p-2 overflow-hidden">
            <img src="/icons/icon-192.png?v=5" alt="شعار واتساب" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl sm:text-2xl font-black text-[#fafafa] tracking-tight">
              نظام إدارة وأتمتة الحوالات
            </h1>
            <p className="text-xs sm:text-sm text-[#a5a5a5]">
              تسجيل الدخول للموظفين والإداريين المعتمدين
            </p>
          </div>
        </div>

        {/* رسالة الخطأ إن وجدت */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-medium">{errorMsg}</span>
          </div>
        )}

        {/* نموذج تسجيل الدخول */}
        <form onSubmit={handleLogin} action="javascript:void(0);" method="POST" className="flex flex-col gap-4">
          {/* حقل البريد الإلكتروني */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#a5a5a5]">البريد الإلكتروني</label>
            <div className="flex items-center bg-[#242626] border border-[#2e2f2f] focus-within:border-[#21c063] rounded-xl px-3.5 py-2.5 transition-colors gap-2.5">
              <Mail className="w-4 h-4 text-[#a5a5a5] shrink-0" />
              <input
                type="email"
                dir="ltr"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@domain.com"
                className="w-full bg-transparent text-sm text-[#fafafa] placeholder-[#a5a5a5]/50 outline-none"
              />
            </div>
          </div>

          {/* حقل كلمة المرور */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#a5a5a5]">كلمة المرور</label>
            <div className="flex items-center bg-[#242626] border border-[#2e2f2f] focus-within:border-[#21c063] rounded-xl px-3.5 py-2.5 transition-colors gap-2.5">
              <Lock className="w-4 h-4 text-[#a5a5a5] shrink-0" />
              <input
                type={showPassword ? 'text' : 'password'}
                dir="ltr"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent text-sm text-[#fafafa] placeholder-[#a5a5a5]/50 outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[#a5a5a5] hover:text-[#fafafa] p-1 cursor-pointer transition-colors"
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* زر تسجيل الدخول */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 mt-2 bg-[#21c063] hover:bg-[#1daa55] text-white font-bold text-sm rounded-xl shadow-lg transition-all active:scale-[0.99] cursor-pointer gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري تسجيل الدخول...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>تسجيل الدخول</span>
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
