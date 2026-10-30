"use client";

import React, { useState, useMemo } from 'react';
import {
  X,
  Building,
  User,
  Pencil,
  Check,
  Search,
  Phone,
  Calendar,
  Volume2,
  VolumeX,
  Pin,
  PinOff,
  Heart,
  FileText,
  Image as ImageIcon,
  Trash2,
  LogOut,
  Maximize2,
  Loader2,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import {
  handleMediaDragStart,
  handleMediaDragEnd,
  isMediaCurrentlyDragging,
} from '@/lib/drag-drop-media';
import { Button } from '@/components/ui/button';

export interface GroupInfoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  chatInfo: any | null;
  isLoading: boolean;
  activeGroup: string;
  isPinned: boolean;
  isMuted: boolean;
  isFavorite: boolean;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onToggleFavorite: () => void;
  onZoomAvatar: (url: string, title: string, subtitle?: string) => void;
  onUpdateDescription: (desc: string) => Promise<void>;
  onClearChat: () => void;
  onExitOrDelete: () => void;
  onStartDirectChatWithParticipant?: (phone: string, name?: string) => void;
}

export function WhatsappGroupInfoDrawer({
  isOpen,
  onClose,
  chatInfo,
  isLoading,
  activeGroup,
  isPinned,
  isMuted,
  isFavorite,
  onTogglePin,
  onToggleMute,
  onToggleFavorite,
  onZoomAvatar,
  onUpdateDescription,
  onClearChat,
  onExitOrDelete,
  onStartDirectChatWithParticipant,
}: GroupInfoDrawerProps) {
  const [isEditingDesc, setIsEditingDesc] = useState<boolean>(false);
  const [descValue, setDescValue] = useState<string>('');
  const [isSavingDesc, setIsSavingDesc] = useState<boolean>(false);
  const [participantSearch, setParticipantSearch] = useState<string>('');

  // تهيئة نص الوصف عند تحميل البيانات
  React.useEffect(() => {
    if (chatInfo?.description !== undefined) {
      setDescValue(chatInfo.description || '');
    }
  }, [chatInfo?.description]);

  const isGroup = chatInfo ? chatInfo.isGroup : true;
  const participants = chatInfo?.participants || [];

  const filteredParticipants = useMemo(() => {
    if (!participantSearch.trim()) return participants;
    const q = participantSearch.trim().toLowerCase();
    return participants.filter(
      (p: any) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.phone && p.phone.toLowerCase().includes(q))
    );
  }, [participants, participantSearch]);

  if (!isOpen) return null;

  const handleSaveDescription = async () => {
    setIsSavingDesc(true);
    try {
      await onUpdateDescription(descValue);
      setIsEditingDesc(false);
    } finally {
      setIsSavingDesc(false);
    }
  };

  const creationFormatted = chatInfo?.creationDate
    ? new Date(chatInfo.creationDate).toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <div
      dir="rtl"
      className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 md:w-[400px] bg-[#111b21] border-l border-[#2e2f2f] flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-200 select-none font-sans"
    >
      {/* رأس اللوحة العلوي */}
      <div className="px-4 py-3 bg-[#202c33] border-b border-[#2a3942] flex items-center justify-between shrink-0 h-14">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-[#aebac1] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-sm font-bold text-[#e9edef]">
            {isGroup ? 'معلومات المجموعة' : 'بيانات جهة الاتصال'}
          </h3>
        </div>
      </div>

      {/* محتوى اللوحة القابل للتمرير */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#202c33] bg-[#111b21] scrollbar-thin scrollbar-thumb-[#2a3942]">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-[#8696a0] gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#00a884]" />
            <span className="text-xs font-semibold">جاري تحميل بيانات المحادثة...</span>
          </div>
        ) : (
          <>
            {/* 1. قسم البروفايل والصورة الكبيرة */}
            <div className="p-6 flex flex-col items-center text-center bg-[#111b21]">
              <div
                onClick={() => {
                  if (isMediaCurrentlyDragging()) return;
                  if (chatInfo?.avatarUrl) {
                    onZoomAvatar(
                      chatInfo.avatarUrl,
                      chatInfo?.name || activeGroup,
                      chatInfo?.phone || (isGroup ? 'مجموعة واتساب' : 'محادثة خاصة')
                    );
                  }
                }}
                draggable={Boolean(chatInfo?.avatarUrl)}
                onDragStart={(e) => {
                  if (chatInfo?.avatarUrl) {
                    handleMediaDragStart(e, chatInfo.avatarUrl, {
                      fallbackName: `${chatInfo.name || activeGroup}_avatar`,
                    });
                  }
                }}
                onDragEnd={handleMediaDragEnd}
                className={`w-32 h-32 rounded-full bg-[#202c33] border-2 border-[#2a3942] flex items-center justify-center text-[#8696a0] shadow-xl overflow-hidden relative group transition-transform hover:scale-105 ${
                  chatInfo?.avatarUrl ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                }`}
                title={chatInfo?.avatarUrl ? "اسحب الصورة لسطح المكتب أو انقر للتكبير" : "صورة البروفايل"}
              >
                {chatInfo?.avatarUrl ? (
                  <img
                    src={chatInfo.avatarUrl}
                    alt={chatInfo.name || activeGroup}
                    className="w-full h-full object-cover select-none pointer-events-none"
                    draggable={false}
                  />
                ) : isGroup ? (
                  <Building className="w-14 h-14 text-emerald-400" />
                ) : (
                  <User className="w-14 h-14 text-sky-400" />
                )}
                {/* طبقة أيقونة التكبير الشفافة عند التحويم */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <Maximize2 className="w-8 h-8" />
                </div>
              </div>

              <h2 className="text-lg font-bold text-[#e9edef] mt-4 max-w-[320px] truncate" dir="auto">
                <bdi>{chatInfo?.name || activeGroup}</bdi>
              </h2>

              {chatInfo?.phone && (
                <div className="text-xs text-emerald-400 font-mono mt-1" dir="ltr">
                  {chatInfo.phone}
                </div>
              )}

              <div className="text-xs text-[#8696a0] mt-1">
                {isGroup ? `مجموعة • ${participants.length} مشارك` : 'محادثة فردية خاصة'}
              </div>
            </div>

            {/* 2. قسم الإجراءات السريعة (تثبيت، كتم، مفضلة) */}
            <div className="p-4 grid grid-cols-3 gap-2 bg-[#111b21]">
              <button
                type="button"
                onClick={onTogglePin}
                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border transition-all cursor-pointer ${
                  isPinned
                    ? 'bg-[#00a884]/15 border-[#00a884]/40 text-[#00a884]'
                    : 'bg-[#202c33] border-[#2a3942] text-[#8696a0] hover:text-[#e9edef]'
                }`}
              >
                {isPinned ? <PinOff className="w-5 h-5" /> : <Pin className="w-5 h-5" />}
                <span className="text-[11px] font-semibold">{isPinned ? 'مثبتة' : 'تثبيت'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleMute}
                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border transition-all cursor-pointer ${
                  isMuted
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                    : 'bg-[#202c33] border-[#2a3942] text-[#8696a0] hover:text-[#e9edef]'
                }`}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                <span className="text-[11px] font-semibold">{isMuted ? 'مكتومة' : 'كتم'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleFavorite}
                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border transition-all cursor-pointer ${
                  isFavorite
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                    : 'bg-[#202c33] border-[#2a3942] text-[#8696a0] hover:text-[#e9edef]'
                }`}
              >
                <Heart className={`w-5 h-5 ${isFavorite ? 'fill-rose-400' : ''}`} />
                <span className="text-[11px] font-semibold">{isFavorite ? 'بالمفضلة' : 'مفضلة'}</span>
              </button>
            </div>

            {/* 3. قسم وصف المجموعة والمعلومات */}
            <div className="p-4 bg-[#111b21] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#8696a0] tracking-wide">
                  {isGroup ? 'وصف المجموعة' : 'الوصف والحالة'}
                </span>
                {isGroup && !isEditingDesc && (
                  <button
                    type="button"
                    onClick={() => setIsEditingDesc(true)}
                    className="text-[#00a884] hover:text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </button>
                )}
              </div>

              {isEditingDesc ? (
                <div className="space-y-2 animate-in fade-in duration-100">
                  <textarea
                    rows={3}
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    placeholder="اكتب وصف المجموعة هنا..."
                    className="w-full bg-[#202c33] border border-[#00a884] rounded-xl p-2.5 text-xs text-[#e9edef] focus:outline-none placeholder-[#8696a0]"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsEditingDesc(false)}
                      disabled={isSavingDesc}
                      className="h-7 text-xs border-[#2a3942] text-[#8696a0] hover:text-white"
                    >
                      إلغاء
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveDescription}
                      disabled={isSavingDesc}
                      className="h-7 text-xs bg-[#00a884] hover:bg-[#008f6f] text-white gap-1"
                    >
                      {isSavingDesc ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>حفظ</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#d1d7db] leading-relaxed whitespace-pre-wrap">
                  {descValue || (isGroup ? 'لا يوجد وصف للمجموعة بعد.' : 'متوفر على واتساب.')}
                </p>
              )}

              {creationFormatted && (
                <div className="pt-2 text-[11px] text-[#8696a0] flex items-center gap-1.5 border-t border-[#202c33]">
                  <Calendar className="w-3.5 h-3.5 text-[#8696a0]" />
                  <span>
                    تم إنشاء المجموعة في {creationFormatted}
                    {chatInfo?.createdBy?.name ? ` بواسطة ${chatInfo.createdBy.name}` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* 4. قسم الوسائط والمستندات المشتركة */}
            <div className="p-4 bg-[#111b21] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#8696a0] tracking-wide">
                  الوسائط والمستندات المشتركة
                </span>
                <span className="text-xs text-[#00a884] font-bold">
                  {chatInfo?.mediaSummary?.totalMedia || 0} ملفات
                </span>
              </div>

              {chatInfo?.mediaSummary?.recentMedia && chatInfo.mediaSummary.recentMedia.length > 0 ? (
                <div className="grid grid-cols-4 gap-2">
                  {chatInfo.mediaSummary.recentMedia.slice(0, 8).map((media: any) => (
                    <div
                      key={media.id}
                      draggable={Boolean(media.mediaUrl)}
                      onDragStart={(e) => {
                        if (media.mediaUrl) {
                          handleMediaDragStart(e, media.mediaUrl, {
                            fallbackName: media.fileName || 'shared_media',
                          });
                        }
                      }}
                      onDragEnd={handleMediaDragEnd}
                      onClick={() => {
                        if (isMediaCurrentlyDragging()) return;
                        onZoomAvatar(media.mediaUrl, media.fileName || 'ملف وسائط');
                      }}
                      className="aspect-square rounded-xl bg-[#202c33] border border-[#2a3942] overflow-hidden cursor-grab active:cursor-grabbing relative group flex items-center justify-center"
                      title="اسحب الصورة لسطح المكتب أو انقر للتكبير"
                    >
                      {media.mediaType === 'image' ? (
                        <img
                          src={media.mediaUrl}
                          alt="وسائط"
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform select-none pointer-events-none"
                          draggable={false}
                        />
                      ) : media.mediaType === 'document' ? (
                        <FileText className="w-6 h-6 text-[#00a884]" />
                      ) : (
                        <ImageIcon className="w-6 h-6 text-[#8696a0]" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <Maximize2 className="w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-[#8696a0]">
                  لا توجد صور أو مستندات مشتركة في هذه المحادثة
                </div>
              )}
            </div>

            {/* 5. قسم المشاركون في المجموعة (للمجموعات فقط) */}
            {isGroup && (
              <div className="p-4 bg-[#111b21] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#8696a0] tracking-wide">
                    المشاركون ({participants.length})
                  </span>
                </div>

                {/* حقل البحث في المشاركين */}
                <div className="relative">
                  <input
                    type="text"
                    value={participantSearch}
                    onChange={(e) => setParticipantSearch(e.target.value)}
                    placeholder="بحث في أسماء أو أرقام المشاركين..."
                    className="w-full bg-[#202c33] border border-[#2a3942] rounded-xl px-3 py-1.5 text-xs text-[#e9edef] placeholder-[#8696a0] focus:outline-none focus:border-[#00a884]"
                  />
                  <Search className="w-3.5 h-3.5 text-[#8696a0] absolute left-3 top-2.5" />
                </div>

                {/* قائمة المشاركين */}
                <div className="space-y-1 max-h-64 overflow-y-auto divide-y divide-[#202c33]/50">
                  {filteredParticipants.map((p: any) => (
                    <div
                      key={p.jid}
                      className="py-2 flex items-center justify-between gap-2 hover:bg-[#202c33]/60 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          onClick={() => onZoomAvatar(p.avatarUrl || '', p.name, p.phone)}
                          className="w-9 h-9 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#8696a0] shrink-0 overflow-hidden cursor-pointer"
                        >
                          {p.avatarUrl ? (
                            <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-4 h-4 text-[#8696a0]" />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-semibold text-[#e9edef] truncate" dir="auto">
                            <bdi>{p.name}</bdi>
                          </span>
                          {p.phone && (
                            <span className="text-[10px] text-[#8696a0] font-mono" dir="ltr">
                              {p.phone}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {p.isAdmin && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#00a884]/15 border border-[#00a884]/40 text-[#00a884] flex items-center gap-0.5">
                            <ShieldCheck className="w-3 h-3" />
                            <span>مشرف</span>
                          </span>
                        )}
                        {onStartDirectChatWithParticipant && p.phone && (
                          <button
                            type="button"
                            onClick={() => onStartDirectChatWithParticipant(p.phone, p.name)}
                            className="p-1 rounded-lg text-[#8696a0] hover:text-[#00a884] hover:bg-[#202c33] cursor-pointer"
                            title="محادثة خاصة مع هذا العضو"
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 6. قسم الإجراءات الخطرة (مسح، مغادرة، حذف) */}
            <div className="p-4 bg-[#111b21] space-y-2">
              <button
                type="button"
                onClick={onClearChat}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-xl transition-colors cursor-pointer font-bold"
              >
                <Trash2 className="w-4 h-4" />
                <span>مسح محتوى هذه المحادثة</span>
              </button>

              <button
                type="button"
                onClick={onExitOrDelete}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer font-bold"
              >
                {isGroup ? <LogOut className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                <span>{isGroup ? 'مغادرة المجموعة' : 'حذف المحادثة'}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
