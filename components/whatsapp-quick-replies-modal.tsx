"use client";

import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Zap,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Search,
  Check,
  X,
  Sparkles,
  Info,
  Hash,
  Eye,
} from 'lucide-react';
import {
  QuickReplyTemplate,
  DEFAULT_QUICK_REPLIES,
  saveStoredQuickReplies,
  interpolateQuickReply,
} from '@/lib/quick-replies';
import { toast } from '@/components/ui/floating-toast';

interface QuickRepliesModalProps {
  isOpen: boolean;
  onClose: () => void;
  templates: QuickReplyTemplate[];
  onUpdateTemplates: (updated: QuickReplyTemplate[]) => void;
  activeChatName?: string;
}

export const QuickRepliesModal = React.memo(function QuickRepliesModal({
  isOpen,
  onClose,
  templates,
  onUpdateTemplates,
  activeChatName = 'المشترك',
}: QuickRepliesModalProps) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // حقول النموذج
  const [formData, setFormData] = useState<{
    title: string;
    shortcut: string;
    category: QuickReplyTemplate['category'];
    content: string;
  }>({
    title: '',
    shortcut: '',
    category: 'استلام وتدقيق',
    content: '',
  });

  const categories: Array<QuickReplyTemplate['category']> = [
    'استلام وتدقيق',
    'إنجاز وصرف',
    'حالات واستفسار',
    'عام',
  ];

  const filteredTemplates = useMemo(() => {
    return templates.filter((tpl) => {
      if (activeTab !== 'all' && tpl.category !== activeTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          tpl.title.toLowerCase().includes(q) ||
          tpl.shortcut.toLowerCase().includes(q) ||
          tpl.content.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [templates, activeTab, searchQuery]);

  const handleStartAdd = () => {
    setIsEditing(true);
    setEditingId(null);
    setFormData({
      title: '',
      shortcut: '',
      category: 'استلام وتدقيق',
      content: '',
    });
  };

  const handleStartEdit = (tpl: QuickReplyTemplate) => {
    setIsEditing(true);
    setEditingId(tpl.id);
    setFormData({
      title: tpl.title,
      shortcut: tpl.shortcut,
      category: tpl.category,
      content: tpl.content,
    });
  };

  const handleCancelForm = () => {
    setIsEditing(false);
    setEditingId(null);
  };

  const handleInsertVariable = (variableTag: string) => {
    setFormData((prev) => ({
      ...prev,
      content: `${prev.content} ${variableTag}`.trim(),
    }));
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.shortcut.trim() || !formData.content.trim()) {
      toast.warning('يرجى تعبئة جميع الحقول المطلوبة (العنوان، الاختصار، ونص القالب).', 'تنبيه');
      return;
    }

    const cleanShortcut = formData.shortcut.trim().replace(/^[\/\#]/, '');

    if (editingId) {
      // تعديل قالب قائم
      const updated = templates.map((t) =>
        t.id === editingId
          ? {
              ...t,
              title: formData.title.trim(),
              shortcut: cleanShortcut,
              category: formData.category,
              content: formData.content.trim(),
            }
          : t
      );
      onUpdateTemplates(updated);
      saveStoredQuickReplies(updated);
      toast.success('تم تحديث القالب بنجاح', 'تم الحفظ');
    } else {
      // إضافة قالب جديد
      const newTpl: QuickReplyTemplate = {
        id: `qr_${Date.now()}`,
        title: formData.title.trim(),
        shortcut: cleanShortcut,
        category: formData.category,
        content: formData.content.trim(),
        usageCount: 0,
      };
      const updated = [newTpl, ...templates];
      onUpdateTemplates(updated);
      saveStoredQuickReplies(updated);
      toast.success('تم إنشاء القالب الجديد بنجاح ويمكنك استخدامه فوراً بكتابة /' + cleanShortcut, 'تمت الإضافة');
    }

    setIsEditing(false);
    setEditingId(null);
  };

  // حذف مع إمكانية التراجع (بدل نافذة التأكيد المنبثقة)
  const handleDelete = (id: string, title: string) => {
    const previous = templates;
    const updated = templates.filter((t) => t.id !== id);
    onUpdateTemplates(updated);
    saveStoredQuickReplies(updated);
    toast.undoable(`تم حذف قالب "${title}".`, () => {
      onUpdateTemplates(previous);
      saveStoredQuickReplies(previous);
    });
  };

  // استعادة القوالب الافتراضية مع إمكانية التراجع (بدل نافذة التأكيد المنبثقة)
  const handleResetDefaults = () => {
    const previous = templates;
    onUpdateTemplates(DEFAULT_QUICK_REPLIES);
    saveStoredQuickReplies(DEFAULT_QUICK_REPLIES);
    toast.undoable(
      'تمت استعادة القوالب الافتراضية.',
      () => {
        onUpdateTemplates(previous);
        saveStoredQuickReplies(previous);
      },
      'استعادة'
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-3xl bg-[#161717] border border-[#2e2f2f] text-[#fafafa] p-0 overflow-hidden shadow-2xl rounded-2xl select-none"
        dir="rtl"
      >
        {/* رأس النافذة */}
        <DialogHeader className="px-6 py-4 bg-[#242626] border-b border-[#2e2f2f] flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#21c063]/20 border border-[#21c063]/40 flex items-center justify-center text-[#21c063]">
              <Zap className="w-5 h-5 fill-[#21c063]" />
            </div>
            <div className="text-right">
              <DialogTitle className="text-base font-bold text-[#fafafa] flex items-center gap-2">
                <span>إدارة القوالب والردود السريعة</span>
                <span className="text-xs font-normal text-[#a5a5a5] bg-[#161717] px-2 py-0.5 rounded-full">
                  اختصارات /
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-[#a5a5a5] mt-0.5">
                تخصيص الردود الجاهزة التي تظهر عند كتابة الرمز (/) في المحادثة واستبدال المتغيرات تلقائياً
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <Button
                size="sm"
                onClick={handleStartAdd}
                className="bg-[#21c063] hover:bg-[#1daa55] text-white font-bold text-xs gap-1.5 rounded-xl shadow-md cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة قالب جديد</span>
              </Button>
            )}
          </div>
        </DialogHeader>

        {isEditing ? (
          /* نموذج إضافة / تعديل قالب */
          <form onSubmit={handleSaveForm} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#a5a5a5] mb-1.5">
                  عنوان القالب (لتمييزه في القائمة) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="مثال: طلب صورة الوصل"
                  className="w-full bg-[#242626] border border-[#2e2f2f] rounded-xl px-3 py-2 text-xs text-[#fafafa] focus:outline-none focus:border-[#21c063] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#a5a5a5] mb-1.5">
                  اختصار القالب (يُكتب بعد /) *
                </label>
                <div className="flex items-center bg-[#242626] border border-[#2e2f2f] rounded-xl px-3 py-2 focus-within:border-[#21c063] transition-colors">
                  <span className="text-[#21c063] font-bold text-sm font-mono mr-1">/</span>
                  <input
                    type="text"
                    required
                    value={formData.shortcut}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        shortcut: e.target.value.replace(/\s+/g, '_'),
                      })
                    }
                    placeholder="مثال: وصل أو تم_الاستلام"
                    className="w-full bg-transparent text-xs text-[#fafafa] focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#a5a5a5] mb-1.5">التصنيف *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFormData({ ...formData, category: cat })}
                    className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                      formData.category === cat
                        ? 'bg-[#21c063]/20 border-[#21c063] text-[#21c063] shadow-xs'
                        : 'bg-[#242626] border-[#2e2f2f] text-[#a5a5a5] hover:text-[#fafafa]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-[#a5a5a5]">نص الرسالة والقالب *</label>
                <div className="flex items-center gap-1 text-[11px] text-[#a5a5a5]">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>انقر لإدراج متغير ذكي:</span>
                  <button
                    type="button"
                    onClick={() => handleInsertVariable('{{name}}')}
                    className="px-1.5 py-0.5 rounded bg-[#242626] hover:bg-[#2e2f2f] text-amber-300 font-mono text-[10px] cursor-pointer border border-[#2e2f2f]"
                    title="اسم المشترك في المحادثة"
                  >
                    &#123;&#123;name&#125;&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertVariable('{{time}}')}
                    className="px-1.5 py-0.5 rounded bg-[#242626] hover:bg-[#2e2f2f] text-sky-300 font-mono text-[10px] cursor-pointer border border-[#2e2f2f]"
                    title="الوقت الحالي"
                  >
                    &#123;&#123;time&#125;&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInsertVariable('{{date}}')}
                    className="px-1.5 py-0.5 rounded bg-[#242626] hover:bg-[#2e2f2f] text-emerald-300 font-mono text-[10px] cursor-pointer border border-[#2e2f2f]"
                    title="التاريخ الحالي"
                  >
                    &#123;&#123;date&#125;&#125;
                  </button>
                </div>
              </div>

              <textarea
                required
                rows={4}
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="اكتب نص القالب هنا... يمكنك استخدام {{name}} ليتم استبداله باسم المشترك تلقائياً."
                className="w-full bg-[#242626] border border-[#2e2f2f] rounded-xl p-3 text-xs text-[#fafafa] focus:outline-none focus:border-[#21c063] transition-colors leading-relaxed"
              />
            </div>

            {/* معاينة حية للقالب مع المتغيرات */}
            {formData.content && (
              <div className="p-3 bg-[#1d1f1f] border border-[#2e2f2f] rounded-xl flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400">
                  <Eye className="w-3.5 h-3.5" />
                  <span>معاينة حية للرسالة كما ستصل للعميل:</span>
                </div>
                <div className="text-xs text-[#fafafa] bg-[#144d37]/30 p-2.5 rounded-lg border border-[#144d37]/50 leading-relaxed">
                  {interpolateQuickReply(formData.content, { name: activeChatName || 'العميل' })}
                </div>
              </div>
            )}

            {/* أزرار الحفظ والإلغاء */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2e2f2f]">
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancelForm}
                className="text-xs text-[#a5a5a5] hover:text-[#fafafa] hover:bg-[#242626] rounded-xl cursor-pointer"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                className="bg-[#21c063] hover:bg-[#1daa55] text-white font-bold text-xs px-5 rounded-xl cursor-pointer gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{editingId ? 'حفظ التعديلات' : 'إضافة القالب'}</span>
              </Button>
            </div>
          </form>
        ) : (
          /* عرض قائمة القوالب وإدارتها */
          <div className="p-6 space-y-4 max-h-[75vh] flex flex-col">
            {/* شريط البحث والتصنيفات */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-[#a5a5a5] absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث في العناوين أو الاختصارات..."
                  className="w-full bg-[#242626] border border-[#2e2f2f] rounded-xl pr-9 pl-3 py-1.5 text-xs text-[#fafafa] placeholder-[#a5a5a5] focus:outline-none focus:border-[#21c063]"
                />
              </div>

              {/* تبويبات الفئات */}
              <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 cursor-pointer ${
                    activeTab === 'all'
                      ? 'bg-[#21c063] text-white'
                      : 'bg-[#242626] text-[#a5a5a5] hover:text-[#fafafa]'
                  }`}
                >
                  الكل ({templates.length})
                </button>
                {categories.map((cat) => {
                  const count = templates.filter((t) => t.category === cat).length;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveTab(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 cursor-pointer ${
                        activeTab === cat
                          ? 'bg-[#21c063] text-white'
                          : 'bg-[#242626] text-[#a5a5a5] hover:text-[#fafafa]'
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* قائمة القوالب المحفوظة */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[420px] scrollbar-thin scrollbar-thumb-[#3b3d3d]">
              {filteredTemplates.length === 0 ? (
                <div className="py-12 text-center text-[#a5a5a5]">
                  <Info className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <div className="text-xs font-bold">لا توجد قوالب مطابقة للبحث</div>
                </div>
              ) : (
                filteredTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="p-3.5 bg-[#242626] border border-[#2e2f2f] hover:border-[#21c063]/40 rounded-xl flex flex-col gap-2 transition-all shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#21c063] bg-[#21c063]/15 px-2 py-0.5 rounded-md border border-[#21c063]/30 flex items-center gap-0.5">
                          <Hash className="w-3 h-3 text-[#21c063]" />
                          {tpl.shortcut}
                        </span>
                        <span className="text-xs font-bold text-[#fafafa]">{tpl.title}</span>
                        <span className="text-[10px] text-[#a5a5a5] px-2 py-0.5 rounded-full bg-[#161717]">
                          {tpl.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(tpl)}
                          className="p-1.5 rounded-lg text-[#a5a5a5] hover:text-[#21c063] hover:bg-[#161717] transition-colors cursor-pointer"
                          title="تعديل القالب"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tpl.id, tpl.title)}
                          className="p-1.5 rounded-lg text-[#a5a5a5] hover:text-rose-400 hover:bg-[#161717] transition-colors cursor-pointer"
                          title="حذف القالب"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-[#e0e0e0] bg-[#1d1f1f] p-2.5 rounded-lg border border-[#2e2f2f]/60 leading-relaxed text-right">
                      {tpl.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* الشريط السفلي: استعادة القوالب وإغلاق */}
            <div className="pt-3 border-t border-[#2e2f2f] flex items-center justify-between">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="text-xs text-[#a5a5a5] hover:text-amber-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="استعادة القوالب الافتراضية الثمانية للحوالات"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>استعادة القوالب الافتراضية</span>
              </button>

              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="text-xs bg-[#242626] border-[#2e2f2f] text-[#fafafa] hover:bg-[#2e2f2f] rounded-xl cursor-pointer"
              >
                إغلاق النافذة
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});
