'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  // زر إجراء داخل الإشعار (مثل "تراجع" بعد الحذف)
  action?: { label: string; onClick: () => void };
}

interface ToastContextType {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

// دالة مساعدة عامة يمكن استدعاؤها من أي مكان حتى خارج مكونات React وبشكل غير متزامن لتفادي أخطاء Render
export function showToast(toast: Omit<ToastItem, 'id'>) {
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: toast }));
    }, 0);
  }
}

export const toast = {
  success: (message: string, title: string = 'تمت العملية بنجاح') =>
    showToast({ type: 'success', title, message, duration: 4500 }),
  error: (message: string, title: string = 'تنبيه - خطأ في العملية') =>
    showToast({ type: 'error', title, message, duration: 8500 }),
  warning: (message: string, title: string = 'تحذير') =>
    showToast({ type: 'warning', title, message, duration: 6000 }),
  info: (message: string, title: string = 'إشعار') =>
    showToast({ type: 'info', title, message, duration: 5000 }),
  // إشعار مع زر "تراجع" (بديل عن نوافذ التأكيد المنبثقة في منتصف الشاشة)
  undoable: (message: string, onUndo: () => void, title: string = 'تم الحذف', duration: number = 6000) =>
    showToast({ type: 'info', title, message, duration, action: { label: 'تراجع', onClick: onUndo } }),
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const recentToastsRef = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toastData: Omit<ToastItem, 'id'>) => {
    const key = `${toastData.type}:${toastData.title || ''}:${toastData.message}`;
    const now = Date.now();
    const lastSeen = recentToastsRef.current.get(key) || 0;

    // منع تكرار نفس الإشعار إذا صدر مرتين خلال 5 ثوانٍ (لتفادي تكرار إشعارات الخلفية)
    if (now - lastSeen < 5000) {
      return;
    }

    // تنظيف السجلات القديمة لتفادي زيادة حجم الذاكرة
    if (recentToastsRef.current.size > 50) {
      for (const [k, time] of recentToastsRef.current.entries()) {
        if (now - time > 15000) {
          recentToastsRef.current.delete(k);
        }
      }
    }

    setToasts((prev) => {
      // إذا كان هناك إشعار متطابق تماماً معروض حالياً على الشاشة، نرفض إضافته
      if (prev.some((t) => t.message === toastData.message && t.type === toastData.type)) {
        return prev;
      }

      recentToastsRef.current.set(key, now);
      const id = `${now}_${Math.random().toString(36).substring(2, 7)}`;
      const duration = toastData.duration ?? (toastData.type === 'error' ? 8500 : 4500);
      const newToast: ToastItem = { ...toastData, id, duration };

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return [newToast, ...prev.slice(0, 2)]; // بحد أقصى 3 إشعارات متزامنة لتجنب ملء الشاشة
    });
  }, [removeToast]);

  const success = useCallback((msg: string, title: string = 'تمت العملية بنجاح') => {
    addToast({ type: 'success', title, message: msg });
  }, [addToast]);

  const error = useCallback((msg: string, title: string = 'تنبيه - خطأ في العملية') => {
    addToast({ type: 'error', title, message: msg });
  }, [addToast]);

  const warning = useCallback((msg: string, title: string = 'تحذير') => {
    addToast({ type: 'warning', title, message: msg });
  }, [addToast]);

  const info = useCallback((msg: string, title: string = 'إشعار') => {
    addToast({ type: 'info', title, message: msg });
  }, [addToast]);

  // الاستماع للحدث المخصص العام
  useEffect(() => {
    const handleGlobalToast = (e: Event) => {
      const customEvent = e as CustomEvent<Omit<ToastItem, 'id'>>;
      if (customEvent.detail) {
        addToast(customEvent.detail);
      }
    };

    window.addEventListener('app:toast', handleGlobalToast);
    return () => window.removeEventListener('app:toast', handleGlobalToast);
  }, [addToast]);

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, success, error, warning, info }}
    >
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      success: toast.success,
      error: toast.error,
      warning: toast.warning,
      info: toast.info,
      addToast: showToast,
      removeToast: () => {},
      toasts: [],
    };
  }
  return context;
}

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      dir="rtl"
      className="fixed top-5 left-1/2 -translate-x-1/2 z-[99999] flex flex-col items-center gap-2.5 pointer-events-none w-full max-w-lg px-4"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onClose={() => onRemove(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onClose,
}: {
  toast: ToastItem;
  onClose: () => void;
}) {
  const typeStyles = {
    success: {
      bg: 'bg-[#12231e]/95 border-emerald-500/50 shadow-emerald-950/40 text-emerald-100',
      iconBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      icon: CheckCircle2,
      accent: 'bg-emerald-500',
    },
    error: {
      bg: 'bg-[#291419]/95 border-rose-500/60 shadow-rose-950/40 text-rose-100',
      iconBg: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      icon: AlertCircle,
      accent: 'bg-rose-500',
    },
    warning: {
      bg: 'bg-[#261d11]/95 border-amber-500/50 shadow-amber-950/40 text-amber-100',
      iconBg: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      icon: AlertTriangle,
      accent: 'bg-amber-500',
    },
    info: {
      bg: 'bg-[#10202d]/95 border-cyan-500/50 shadow-cyan-950/40 text-cyan-100',
      iconBg: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      icon: Info,
      accent: 'bg-cyan-500',
    },
  }[toast.type];

  const Icon = typeStyles.icon;

  return (
    <div
      className={`pointer-events-auto w-full relative overflow-hidden flex items-start gap-3.5 p-4 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${typeStyles.bg}`}
      style={{
        boxShadow: '0 20px 40px -15px rgba(0,0,0,0.7), 0 0 25px -5px rgba(0,0,0,0.5)',
      }}
    >
      {/* شريط الإشارة الجانبي */}
      <div className={`absolute top-0 bottom-0 right-0 w-1.5 ${typeStyles.accent}`} />

      {/* أيقونة الحالة */}
      <div
        className={`w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center mt-0.5 shadow-sm ${typeStyles.iconBg}`}
      >
        <Icon className="w-5 h-5" />
      </div>

      {/* نصوص الإشعار */}
      <div className="flex-1 min-w-0 pr-0.5">
        {toast.title && (
          <h4 className="text-sm font-bold tracking-tight mb-1 text-white flex items-center gap-2">
            {toast.title}
          </h4>
        )}
        <div className="text-xs leading-relaxed text-zinc-200/90 whitespace-pre-line font-medium break-words">
          {toast.message}
        </div>
      </div>

      {/* زر الإجراء (مثل "تراجع") */}
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.onClick();
            onClose();
          }}
          className="shrink-0 self-center px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
        >
          {toast.action.label}
        </button>
      )}

      {/* زر الإغلاق السريع */}
      <button
        onClick={onClose}
        className="shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        title="إغلاق"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
