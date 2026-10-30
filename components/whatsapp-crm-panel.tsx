"use client";

import React, { useState } from 'react';
import {
  Tag as TagIcon,
  Plus,
  X,
  Lock,
  FileText,
  User,
  Building,
  Phone,
  Clock,
  Trash2,
  Sparkles,
  ChevronRight,
  Check,
} from 'lucide-react';
import { CrmTag, CrmNote, ChatCrmRecord } from '@/lib/chat-crm';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/floating-toast';

interface WhatsappCrmPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chatKey: string;
  chatName: string;
  chatPhone?: string;
  isGroup?: boolean;
  avatarUrl?: string;
  crmRecord?: ChatCrmRecord;
  availableTags: CrmTag[];
  onToggleTag: (tagId: string) => void;
  onAddCustomTag: (name: string, color: string) => void;
  onAddNote: (noteText: string) => void;
  onDeleteNote: (noteId: string) => void;
}

export const WhatsappCrmPanel = React.memo(function WhatsappCrmPanel({
  isOpen,
  onClose,
  chatKey,
  chatName,
  chatPhone,
  isGroup,
  avatarUrl,
  crmRecord,
  availableTags,
  onToggleTag,
  onAddCustomTag,
  onAddNote,
  onDeleteNote,
}: WhatsappCrmPanelProps) {
  const [newNoteText, setNewNoteText] = useState<string>('');
  const [isAddingCustomTag, setIsAddingCustomTag] = useState<boolean>(false);
  const [customTagName, setCustomTagName] = useState<string>('');
  const [customTagColor, setCustomTagColor] = useState<string>('#10b981');
  const [tagPickerOpen, setTagPickerOpen] = useState<boolean>(false);

  if (!isOpen) return null;

  const activeTagIds = crmRecord?.tags || [];
  const activeTags = availableTags.filter((t) => activeTagIds.includes(t.id));
  const notes = crmRecord?.notes || [];

  const handleSaveNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    onAddNote(newNoteText.trim());
    setNewNoteText('');
    toast.success('تم حفظ الملاحظة الداخلية السرية بنجاح', 'حفظ الملاحظة');
  };

  const handleCreateCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTagName.trim()) return;
    onAddCustomTag(customTagName.trim(), customTagColor);
    setCustomTagName('');
    setIsAddingCustomTag(false);
    toast.success('تم إنشاء الوسم الجديد بنجاح', 'وسم جديد');
  };

  return (
    <div
      dir="rtl"
      className="w-80 lg:w-96 bg-[#161717] border-r border-[#2e2f2f] flex flex-col h-full shrink-0 shadow-2xl z-30 select-none animate-in slide-in-from-right-3 duration-200"
    >
      {/* رأس لوحة الـ CRM */}
      <div className="px-4 py-3 bg-[#242626] border-b border-[#2e2f2f] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#21c063]/20 border border-[#21c063]/40 flex items-center justify-center text-[#21c063]">
            <TagIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#fafafa]">ملف العميل والـ CRM</h3>
            <span className="text-[10px] text-[#a5a5a5]">بيانات وملاحظات سرية خاصة بالموظف</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 text-[#a5a5a5] hover:text-white hover:bg-[#2e2f2f] rounded-full transition-colors cursor-pointer"
          title="إغلاق اللوحة"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* محتوى اللوحة القابل للتمرير */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin scrollbar-thumb-[#3b3d3d]">
        {/* 1. بطاقة بروفايل العميل */}
        <div className="bg-[#1d1f1f] border border-[#2e2f2f] rounded-2xl p-3.5 flex flex-col items-center text-center relative overflow-hidden">
          <div className="w-16 h-16 rounded-full bg-[#242626] border-2 border-[#21c063]/40 flex items-center justify-center text-[#fafafa] font-bold text-lg mb-2 shadow-md overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt={chatName} className="w-full h-full object-cover" />
            ) : isGroup ? (
              <Building className="w-7 h-7 text-emerald-400" />
            ) : (
              <User className="w-7 h-7 text-sky-400" />
            )}
          </div>

          <h4 className="text-sm font-bold text-[#fafafa] truncate max-w-[240px]" title={chatName}>
            {chatName}
          </h4>

          {chatPhone && (
            <div className="text-xs text-emerald-400/90 font-mono mt-0.5 dir-ltr flex items-center gap-1">
              <Phone className="w-3 h-3 text-[#a5a5a5]" />
              <span>{chatPhone}</span>
            </div>
          )}

          <div className="mt-2 text-[10px] text-[#a5a5a5] bg-[#242626] px-2.5 py-0.5 rounded-full border border-[#2e2f2f]">
            {isGroup ? 'مجموعة واتساب' : 'محادثة خاصة'}
          </div>
        </div>

        {/* 2. قسم الوسوم والتصنيفات (CRM Tags) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#fafafa]">
              <TagIcon className="w-3.5 h-3.5 text-[#21c063]" />
              <span>وسوم وتصنيفات المحادثة</span>
            </div>

            <button
              type="button"
              onClick={() => setTagPickerOpen((prev) => !prev)}
              className="text-[11px] font-bold text-[#21c063] hover:text-[#21c063] flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#21c063]/15 hover:bg-[#21c063]/25 transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>إضافة وسم</span>
            </button>
          </div>

          {/* قائمة الوسوم الحالية المطبقة */}
          <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-[#1d1f1f] border border-[#2e2f2f] rounded-xl items-center">
            {activeTags.length === 0 ? (
              <span className="text-[11px] text-[#a5a5a5] italic px-1">
                لا توجد وسوم مضافة لهذه المحادثة بعد
              </span>
            ) : (
              activeTags.map((tag) => (
                <span
                  key={tag.id}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border shadow-xs animate-in zoom-in-95 duration-100 ${tag.bgClass} ${tag.textClass} ${tag.borderClass}`}
                >
                  <span>{tag.name}</span>
                  <button
                    type="button"
                    onClick={() => onToggleTag(tag.id)}
                    className="hover:opacity-100 opacity-60 hover:text-white p-0.5 cursor-pointer rounded-full"
                    title="إزالة الوسم"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>

          {/* القائمة المنبثقة لاختيار الوسوم */}
          {tagPickerOpen && (
            <div className="p-3 bg-[#242626] border border-[#2e2f2f] rounded-xl space-y-3 shadow-xl animate-in fade-in slide-in-from-top-2">
              <div className="text-[11px] font-bold text-[#a5a5a5] flex items-center justify-between">
                <span>اختر وسم لإضافته أو إزالته:</span>
                <button
                  type="button"
                  onClick={() => setIsAddingCustomTag((prev) => !prev)}
                  className="text-[#21c063] hover:underline"
                >
                  {isAddingCustomTag ? 'إلغاء' : '+ وسم مخصص'}
                </button>
              </div>

              {/* إنشاء وسم مخصص */}
              {isAddingCustomTag && (
                <form onSubmit={handleCreateCustomTag} className="p-2.5 bg-[#1d1f1f] border border-[#2e2f2f] rounded-lg space-y-2">
                  <input
                    type="text"
                    required
                    value={customTagName}
                    onChange={(e) => setCustomTagName(e.target.value)}
                    placeholder="اسم الوسم الجديد..."
                    className="w-full bg-[#242626] border border-[#2e2f2f] rounded-lg px-2.5 py-1 text-xs text-[#fafafa] focus:outline-none focus:border-[#21c063]"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {['#f59e0b', '#f97316', '#0ea5e9', '#10b981', '#f43f5e', '#8b5cf6'].map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setCustomTagColor(color)}
                          style={{ backgroundColor: color }}
                          className={`w-5 h-5 rounded-full border cursor-pointer ${
                            customTagColor === color ? 'ring-2 ring-white' : 'border-transparent'
                          }`}
                        />
                      ))}
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      className="h-7 px-3 bg-[#21c063] hover:bg-[#1daa55] text-white text-[11px] font-bold rounded-lg cursor-pointer"
                    >
                      إنشاء
                    </Button>
                  </div>
                </form>
              )}

              {/* أزرار الوسوم المتاحة */}
              <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                {availableTags.map((tag) => {
                  const isSelected = activeTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => onToggleTag(tag.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold text-right transition-all flex items-center justify-between border cursor-pointer ${
                        isSelected
                          ? `${tag.bgClass} ${tag.textClass} ${tag.borderClass} ring-1`
                          : 'bg-[#1d1f1f] text-[#a5a5a5] hover:text-[#fafafa] border-[#2e2f2f]'
                      }`}
                    >
                      <span className="truncate">{tag.name}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 3. قسم الملاحظات الداخلية السرية (Private Internal Notes) */}
        <div className="space-y-3 pt-3 border-t border-[#2e2f2f]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#fafafa]">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>الملاحظات الداخلية السرية</span>
            </div>
            <span className="text-[10px] text-[#a5a5a5] bg-[#242626] px-2 py-0.5 rounded-full font-mono">
              {notes.length} ملاحظات
            </span>
          </div>

          {/* شريط الأمان والسرية */}
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-start gap-2 text-[11px] text-amber-300 leading-relaxed">
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>
              <strong>ملاحظات داخلية للموظفين فقط:</strong> أي نص يُكتب هنا يُحفظ في النظام الداخلي ولا يظهر إطلاقاً للعميل على تطبيق واتساب.
            </span>
          </div>

          {/* نموذج كتابة ملاحظة جديدة */}
          <form onSubmit={handleSaveNote} className="space-y-2">
            <textarea
              rows={3}
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="اكتب ملاحظة داخلية خاصة بهذا العميل أو الحوالة..."
              className="w-full bg-[#1d1f1f] border border-[#2e2f2f] rounded-xl p-2.5 text-xs text-[#fafafa] placeholder-[#a5a5a5] focus:outline-none focus:border-[#21c063] leading-relaxed resize-none"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={!newNoteText.trim()}
                className="h-8 px-3.5 bg-[#21c063] hover:bg-[#1daa55] text-white text-xs font-bold rounded-xl gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>حفظ الملاحظة</span>
              </Button>
            </div>
          </form>

          {/* سجل الملاحظات السابقة */}
          <div className="space-y-2">
            {notes.length === 0 ? (
              <div className="py-6 text-center text-[#a5a5a5] text-xs bg-[#1d1f1f]/50 rounded-xl border border-[#2e2f2f]/60">
                لا توجد ملاحظات داخلية سابقة لهذا العميل.
              </div>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  className="p-3 bg-[#1d1f1f] border border-[#2e2f2f] rounded-xl space-y-1.5 relative group shadow-xs"
                >
                  <div className="flex items-center justify-between text-[10px] text-[#a5a5a5]">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                      <span>بواسطة: {note.author || 'أنا'}</span>
                    </div>
                    <div className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" />
                      <span>
                        {new Date(note.createdAt).toLocaleDateString('ar-EG', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteNote(note.id)}
                        className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-0.5 transition-opacity cursor-pointer mr-1"
                        title="حذف الملاحظة"
                      >
                        <Trash2 className="w-3 h-3 text-rose-400" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-[#e0e0e0] leading-relaxed whitespace-pre-wrap text-right">
                    {note.text}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
