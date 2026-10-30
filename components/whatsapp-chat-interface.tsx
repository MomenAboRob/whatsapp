"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import NextImage from 'next/image';
import {
  Search,
  CheckCheck,
  Check,
  MoreVertical,
  QrCode,
  Share2,
  Building,
  UserCheck,
  CheckCircle2,
  Database,
  ExternalLink,
  Globe,
  RotateCw,
  FileText,
  Clock,
  Sparkles,
  Layers,
  ChevronDown,
  Upload,
  ArrowRight,
  Smile,
  Paperclip,
  Mic,
  SendHorizontal,
  Trash2,
  CheckSquare,
  Copy,
  X,
  Forward,
  Square,
  AlertCircle,
  Eye,
  EyeOff,
  User,
  Image as ImageIcon,
  Plus,
  Pencil,
  MessageSquare,
  ShieldCheck,
  Lock,
  Link2,
  Settings,
  Reply,
  Play,
  Pause,
  Download,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Music,
  Film,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Zap,
  Tag as TagIcon,
  Info,
  PawPrint,
  Coffee,
  Trophy,
  Car,
  Lightbulb,
  Percent,
  Flag,
  Star,
  Pin,
  PinOff,
  Archive,
  Volume2,
  VolumeX,
  Heart,
  ListFilter,
  LogOut,
  Calendar,
  Briefcase,
  ArrowLeft,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/floating-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { normalizeDateToISO } from '@/lib/date-utils';
import { ParsedTransfer, parseTransferText, cleanPhoneNumber, toEnglishDigits } from '@/lib/parser';
import { generateReceiptCardDataUrl } from '@/lib/receipt-generator';
import { useCurrentBatch } from '@/hooks/use-current-batch';
import { combineTwoImages } from '@/lib/image-combiner';
import { WhatsAppStickerPicker } from '@/components/whatsapp-sticker-picker';
import { WhatsAppSticker } from '@/lib/sticker-store';
import {
  QuickReplyTemplate,
  getStoredQuickReplies,
  interpolateQuickReply,
} from '@/lib/quick-replies';
import { QuickRepliesMenu } from '@/components/whatsapp-quick-replies-menu';
import { QuickRepliesModal } from '@/components/whatsapp-quick-replies-modal';
import {
  CrmTag,
  CrmNote,
  ChatCrmRecord,
  PRESET_CRM_TAGS,
  getStoredCrmData,
  saveStoredCrmData,
  getStoredTags,
  saveStoredTags,
} from '@/lib/chat-crm';
import { WhatsappCrmPanel } from '@/components/whatsapp-crm-panel';
import { WhatsappAvatarLightbox } from '@/components/whatsapp-avatar-lightbox';
import { WhatsappChatContextMenu } from '@/components/whatsapp-chat-context-menu';
import { WhatsappGroupInfoDrawer } from '@/components/whatsapp-group-info-drawer';
import {
  handleMediaDragStart,
  handleMediaDragEnd,
  isMediaCurrentlyDragging,
} from '@/lib/drag-drop-media';

// كاش فائق السرعة لمنع تكرار معالجة الرسائل بالتعبيرات النمطية (Regex) في كل دورة رسم
const parsedTransferCache = new Map<string, ParsedTransfer>();
function getCachedParsedTransfer(text: string, msg?: any): ParsedTransfer {
  if (!text) return parseTransferText('', msg);
  const cacheKey = msg?.id ? `${msg.id}_${msg.timestampMs || ''}_${text}` : text;
  const cached = parsedTransferCache.get(cacheKey);
  if (cached) return cached;
  const parsed = parseTransferText(text, msg);
  if (parsedTransferCache.size > 4000) parsedTransferCache.clear();
  parsedTransferCache.set(cacheKey, parsed);
  return parsed;
}

interface WhatsAppChatInterfaceProps {
  onOpenReview: (data: ParsedTransfer, imageUrl?: string, msgId?: string) => void;
  onOpenQRModal: () => void;
  onOpenSettings?: () => void;
  onActiveChatChange?: (isOpen: boolean) => void;
  isPopoutMode?: boolean;
  initialChat?: string;
  initialChatName?: string;
  initialMessageId?: string;
}

// دالة استخراج وتوحيد التوقيت الفعلي للرسالة بالميلي ثانية (مع كاش فوري O(1) لتسريع الفرز والبحث)
function getMessageTimestampMs(msg: any): number {
  if (!msg) return 0;
  if (msg._cachedTs !== undefined) return msg._cachedTs;
  let ts = 0;
  if (msg.timestampMs && typeof msg.timestampMs === 'number' && msg.timestampMs > 0) {
    ts = msg.timestampMs;
  } else {
    const rawSec = Number(msg.rawBaileysMessage?.messageTimestamp);
    if (rawSec && !isNaN(rawSec) && rawSec > 0) {
      ts = rawSec > 1e11 ? rawSec : rawSec * 1000;
    } else if (typeof msg.id === 'string' && msg.id.startsWith('msg_real_')) {
      const parts = msg.id.split('_');
      const p = Number(parts[2]);
      if (p && !isNaN(p)) ts = p;
    } else if (msg.timestamp && typeof msg.timestamp === 'string') {
      const parsedIso = Date.parse(msg.timestamp);
      if (!isNaN(parsedIso) && parsedIso > 1e11) {
        ts = parsedIso;
      } else {
        ts = parseArabicTimeToTimestampMs(msg.timestamp);
      }
    }
  }
  msg._cachedTs = ts;
  return ts;
}

// دالة فك تشفير وتنسيق الوقت العربي للرسائل القديمة
function parseArabicTimeToTimestampMs(timeStr?: string): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const normalized = timeStr.replace(/[٠-٩]/g, (w) => String(arabicDigits.indexOf(w))).trim();
  const match = normalized.match(/(\d{1,2}):(\d{1,2})\s*(ص|م|am|pm)?/i);
  if (!match) return 0;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3]?.toLowerCase();

  if (period === 'م' || period === 'pm') {
    if (hours < 12) hours += 12;
  } else if (period === 'ص' || period === 'am') {
    if (hours === 12) hours = 0;
  }

  // استخدام تاريخ 4 سبتمبر 2026 لأن كافة الرسائل المستوردة سُجلت في هذا اليوم
  const d = new Date(2026, 8, 4, hours, minutes, 0, 0);
  return d.getTime();
}

// دالة تنسيق توقيت وتاريخ المحادثة في القائمة الجانبية مثل واتساب ويب الرسمي
function formatWhatsAppChatTime(timestampMs: number, fallbackStr?: string): string {
  if (!timestampMs || timestampMs <= 1000) {
    return fallbackStr || '';
  }

  const msgDate = new Date(timestampMs);
  const now = new Date();

  // التحقق إن كانت الرسالة أُرسلت اليوم
  const isToday =
    msgDate.getDate() === now.getDate() &&
    msgDate.getMonth() === now.getMonth() &&
    msgDate.getFullYear() === now.getFullYear();

  if (isToday) {
    return msgDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  }

  // التحقق إن كانت بالأمس
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    msgDate.getDate() === yesterday.getDate() &&
    msgDate.getMonth() === yesterday.getMonth() &&
    msgDate.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    const timeOnly = msgDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    return `أمس ${timeOnly}`;
  }

  // إذا كانت الرسالة أقدم من ذلك: إظهار اليوم/الشهر مع الوقت (مثلاً: 04/09 09:29 م)
  const day = String(msgDate.getDate()).padStart(2, '0');
  const month = String(msgDate.getMonth() + 1).padStart(2, '0');
  const timeOnly = msgDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  return `${day}/${month} ${timeOnly}`;
}

// تنسيق تواريخ وأوقات البحث مثل واتساب تماماً (اليوم مع الوقت، أمس مع الوقت، أو التاريخ مع الوقت)
export function formatSearchDate(timestampMs: number, fallbackStr?: string): string {
  if (!timestampMs || timestampMs <= 1000) {
    return fallbackStr || '';
  }

  const msgDate = new Date(timestampMs);
  const now = new Date();
  const timeOnly = msgDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  const isToday =
    msgDate.getDate() === now.getDate() &&
    msgDate.getMonth() === now.getMonth() &&
    msgDate.getFullYear() === now.getFullYear();
  if (isToday) {
    return timeOnly;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    msgDate.getDate() === yesterday.getDate() &&
    msgDate.getMonth() === yesterday.getMonth() &&
    msgDate.getFullYear() === yesterday.getFullYear();
  if (isYesterday) {
    return `أمس ${timeOnly}`;
  }

  const day = String(msgDate.getDate()).padStart(2, '0');
  const month = String(msgDate.getMonth() + 1).padStart(2, '0');
  const year = msgDate.getFullYear();
  if (year === now.getFullYear()) {
    return `${day}/${month} ${timeOnly}`;
  }
  return `${day}/${month}/${year} ${timeOnly}`;
}

export function renderHighlightedSnippet(text: string, query: string): React.ReactNode {
  if (!text || !query) return text;
  const q = query.trim();
  if (!q) return text;
  const normQ = normalizeSearchText(q);
  const normText = normalizeSearchText(text);
  const idx = normText.indexOf(normQ);
  if (idx === -1) return text;

  const actualStart = idx;
  const actualEnd = Math.min(text.length, actualStart + q.length);
  const before = text.slice(0, actualStart);
  const match = text.slice(actualStart, actualEnd);
  const after = text.slice(actualEnd);

  return (
    <>
      <span>{before}</span>
      <span className="text-[#fafafa] font-bold bg-[#ffd279]/30 text-amber-200 px-0.5 rounded">
        {match}
      </span>
      <span>{after}</span>
    </>
  );
}

const normalizeTextCache = new Map<string, string>();
export function normalizeSearchText(str: string): string {
  if (!str) return '';
  const cached = normalizeTextCache.get(str);
  if (cached !== undefined) return cached;
  const res = str
    .toLowerCase()
    .trim()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632 + 48))
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1776 + 48))
    .replace(/[\s\-_]+/g, ' ');
  if (normalizeTextCache.size > 3000) normalizeTextCache.clear();
  normalizeTextCache.set(str, res);
  return res;
}

// نمط تعبيري شامل يتعرف بالترتيب على: البريد، أرقام الهواتف (الإنجليزية والعربية)، المنشن
const MENTIONS_EMAIL_PHONE_REGEX = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|((?:\+|00)?[\d٠-٩۰-۹]{1,4}(?:[\s\-]?[\d٠-٩۰-۹]+){2,5}|(?:05[968420]|07[789]|٠٥[٩٦٨٤٢٠]|٠٧[٧٨٩]|۰۵[۹۶۸۴۲۰]|۰۷[۷۸۹])[\s\-]?[\d٠-٩۰-۹]{3}[\s\-]?[\d٠-٩۰-۹]{3,4})|((?<=^|[\s\n])@[\w\u0600-\u06FF]+)/g;

function renderMessageTextWithMentions(
  text?: string,
  handlers?: { onPhoneClick?: (phone: string, e: React.MouseEvent) => void; highlightQuery?: string }
) {
  if (!text || typeof text !== 'string') return text || '';

  const q = handlers?.highlightQuery?.trim();
  const normQ = q ? normalizeSearchText(q) : '';

  const renderHighlightedString = (rawStr: string, baseKey: string) => {
    if (!normQ || normQ.length < 2) return rawStr;
    const normRaw = normalizeSearchText(rawStr);
    const idx = normRaw.indexOf(normQ);
    if (idx === -1) return rawStr;

    const parts: React.ReactNode[] = [];
    let curIdx = 0;
    while (curIdx < rawStr.length) {
      const remainingNorm = normalizeSearchText(rawStr.slice(curIdx));
      const matchIdx = remainingNorm.indexOf(normQ);
      if (matchIdx === -1) {
        parts.push(rawStr.slice(curIdx));
        break;
      }
      const actualStart = curIdx + matchIdx;
      const actualEnd = Math.min(rawStr.length, actualStart + (q?.length || normQ.length));
      if (actualStart > curIdx) {
        parts.push(rawStr.slice(curIdx, actualStart));
      }
      parts.push(
        <mark
          key={`hl-${baseKey}-${curIdx}`}
          className="bg-amber-400/40 text-amber-200 px-0.5 rounded font-bold shadow-2xs"
        >
          {rawStr.slice(actualStart, actualEnd)}
        </mark>
      );
      curIdx = Math.max(actualEnd, actualStart + 1);
    }
    return parts.length > 0 ? parts : rawStr;
  };

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const elements: React.ReactNode[] = [];
  let keyIdx = 0;

  MENTIONS_EMAIL_PHONE_REGEX.lastIndex = 0;
  while ((match = MENTIONS_EMAIL_PHONE_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(renderHighlightedString(text.substring(lastIndex, match.index), `txt-${keyIdx++}`));
    }
    if (match[1]) {
      // البريد الإلكتروني: رابط أخضر مثل واتساب، النقر عليه يفتح برنامج الإيميل لإرسال رسالة
      const email = match[1];
      const isEmailMatch = Boolean(normQ && email.toLowerCase().includes(normQ));
      elements.push(
        <a
          key={`email-${keyIdx++}`}
          href={`mailto:${email}`}
          dir="ltr"
          onClick={(e) => e.stopPropagation()}
          className={`text-[#21c063] underline underline-offset-2 hover:text-[#4ade80] break-all cursor-pointer ${
            isEmailMatch ? 'bg-amber-400/35 text-amber-200 px-1 rounded font-bold' : ''
          }`}
          title={`إرسال إيميل إلى ${email}`}
        >
          <bdi dir="ltr">{email}</bdi>
        </a>
      );
    } else if (match[2]) {
      // رقم الهاتف: أخضر مثل واتساب، النقر عليه يعرض خيارات (محادثة مع الرقم / نسخ الرقم)
      // عزل LTR لمنع انقلاب إشارة + وكود الدولة داخل النص العربي
      const phone = match[2];
      const cleanDigitsQ = normQ.replace(/\D/g, '');
      const isPhoneMatch = Boolean(
        normQ && (phone.includes(q!) || (cleanDigitsQ.length >= 3 && phone.replace(/\D/g, '').includes(cleanDigitsQ)))
      );
      elements.push(
        <button
          key={`phone-${keyIdx++}`}
          type="button"
          dir="ltr"
          onClick={(e) => {
            e.stopPropagation();
            handlers?.onPhoneClick?.(phone, e);
          }}
          className={`inline text-[#21c063] font-medium hover:underline underline-offset-2 cursor-pointer ${
            isPhoneMatch ? 'bg-amber-400/35 text-amber-200 px-1 rounded font-bold' : ''
          }`}
          title="خيارات الرقم"
        >
          <bdi dir="ltr">{phone}</bdi>
        </button>
      );
    } else if (match[3]) {
      // المنشن للأشخاص
      const mention = match[3];
      elements.push(
        <span
          key={`mention-${keyIdx++}`}
          className="text-[#53bdeb] font-bold inline-block"
          dir="auto"
        >
          <bdi>{mention}</bdi>
        </span>
      );
    }
    lastIndex = MENTIONS_EMAIL_PHONE_REGEX.lastIndex;
  }

  if (lastIndex < text.length) {
    elements.push(renderHighlightedString(text.substring(lastIndex), `txt-end-${keyIdx++}`));
  }

  return elements.length > 0 ? elements : text;
}

// مكوّن مشغل الرسائل الصوتية التفاعلي كواتساب ويب (محفوظ بـ React.memo لتفادي إعادة الرسم)
const VoiceNotePlayer = React.memo(function VoiceNotePlayer({
  src,
  duration,
  isFromMe,
  isVoiceNote = true,
}: {
  src: string;
  duration?: number;
  isFromMe?: boolean;
  isVoiceNote?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setTotalDuration(audio.duration);
      }
      setIsLoaded(true);
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [src]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => console.warn('Audio play error:', err));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const toggleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const formatAudioTime = (sec: number) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      className={`flex items-center gap-3 py-1.5 px-2.5 rounded-xl select-none min-w-[240px] max-w-[340px] ${
        isFromMe ? 'bg-[#103e2c] border border-[#144d37]' : 'bg-[#1d1f1f] border border-[#2e2f2f]'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* زر التشغيل / الإيقاف المؤقت */}
      <button
        type="button"
        onClick={togglePlay}
        className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center cursor-pointer shadow-md transition-transform active:scale-95 ${
          isFromMe
            ? 'bg-emerald-400 text-[#144d37] hover:bg-emerald-300'
            : 'bg-[#21c063] text-white hover:bg-[#1daa55]'
        }`}
        title={isPlaying ? 'إيقاف مؤقت' : 'تشغيل الصوت'}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* شريط التقدم الزمني */}
      <div className="flex-1 flex flex-col justify-center gap-1">
        <div className="relative flex items-center h-4 cursor-pointer">
          <input
            type="range"
            min={0}
            max={totalDuration || 1}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-[#3b3d3d] accent-[#21c063] rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#a5a5a5] font-mono leading-none">
          <span>{formatAudioTime(currentTime || 0)}</span>
          <span>{formatAudioTime(totalDuration || 0)}</span>
        </div>
      </div>

      {/* أيقونة التسجيل الصوتي وسرعة التشغيل */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isLoaded && isPlaying && (
          <button
            type="button"
            onClick={toggleSpeed}
            className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#242626] text-emerald-400 hover:bg-[#2e2f2f] transition-colors cursor-pointer border border-[#2e2f2f]"
            title="تغيير سرعة التشغيل"
          >
            {playbackRate}x
          </button>
        )}
        {isVoiceNote ? (
          <Mic className={`w-4 h-4 ${isPlaying ? 'text-emerald-400 animate-pulse' : 'text-[#a5a5a5]'}`} />
        ) : (
          <Music className={`w-4 h-4 ${isPlaying ? 'text-emerald-400 animate-pulse' : 'text-[#a5a5a5]'}`} />
        )}
      </div>
    </div>
  );
});

// مكوّن بطاقة الفيديو المدمجة (محفوظ بـ React.memo لتفادي إعادة الرسم)
const VideoPlayerCard = React.memo(function VideoPlayerCard({
  src,
  duration,
  onOpenLightbox,
}: {
  src: string;
  duration?: number;
  onOpenLightbox: () => void;
}) {
  const formatDuration = (sec?: number) => {
    if (!sec) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      draggable={true}
      onDragStart={(e) => {
        handleMediaDragStart(e, src, { fallbackName: 'whatsapp_video' });
      }}
      onDragEnd={handleMediaDragEnd}
      className="relative rounded-xl overflow-hidden my-1 bg-black/60 border border-[#2e2f2f] group/video cursor-grab active:cursor-grabbing max-w-[320px] shadow-lg select-none"
      onClick={(e) => {
        if (isMediaCurrentlyDragging()) return;
        e.stopPropagation();
        onOpenLightbox();
      }}
      title="اسحب الفيديو لسطح المكتب أو انقر للتشغيل"
    >
      <video
        src={src}
        preload="metadata"
        className="w-full h-auto max-h-72 object-cover rounded-xl transition-transform group-hover/video:scale-[1.02] pointer-events-none"
      />

      {/* تراكب داكن وزر تشغيل كبير */}
      <div className="absolute inset-0 bg-black/30 flex items-center justify-center transition-all group-hover/video:bg-black/15">
        <div className="w-12 h-12 rounded-full bg-[#21c063]/95 text-white flex items-center justify-center shadow-xl transform transition-transform group-hover/video:scale-110">
          <Play className="w-6 h-6 fill-white ml-0.5" />
        </div>
      </div>

      {/* شارة مقطع فيديو مع المدة الزمنية */}
      <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 border border-white/10 shadow-xs">
        <Film className="w-3 h-3 text-emerald-400" />
        <span>{formatDuration(duration) || 'فيديو'}</span>
      </div>
    </div>
  );
});

// مكوّن الملصق الشفاف النظيف المطابق لواتساب الرسمي تماماً بدون أي أيقونات أو حواف (محفوظ بـ React.memo)
const StickerCard = React.memo(function StickerCard({
  src,
  onOpenLightbox,
}: {
  src: string;
  onOpenLightbox: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      draggable={true}
      onDragStart={(e) => {
        handleMediaDragStart(e, src, { fallbackName: 'whatsapp_sticker' });
      }}
      onDragEnd={handleMediaDragEnd}
      className="relative py-1 cursor-grab active:cursor-grabbing select-none group/sticker inline-block"
      onClick={(e) => {
        if (isMediaCurrentlyDragging()) return;
        e.stopPropagation();
        onOpenLightbox();
      }}
      title="اسحب الملصق لسطح المكتب أو انقر للتكبير"
    >
      <img
        src={src}
        alt="ملصق واتساب"
        className="w-32 h-32 sm:w-36 sm:h-36 object-contain transition-transform group-hover/sticker:scale-105 drop-shadow-md select-none pointer-events-none"
        loading="lazy"
        draggable={false}
      />
    </div>
  );
});

// مكوّن تنزيل الملصق التلقائي في الخلفية بدون حواف
function StickerAutoDownloader({
  msgId,
  isDownloading,
  onDownload,
  onManualDownload,
}: {
  msgId: string;
  isDownloading: boolean;
  onDownload: () => void;
  onManualDownload?: () => void;
}) {
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!triggeredRef.current) {
      triggeredRef.current = true;
      onDownload();
    }
  }, [onDownload]);

  return (
    <div
      className="w-32 h-32 sm:w-36 sm:h-36 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-white/10 transition-colors my-1 select-none"
      onClick={(e) => {
        e.stopPropagation();
        if (onManualDownload) {
          onManualDownload();
        } else {
          onDownload();
        }
      }}
      title="انقر لتنزيل الملصق"
    >
      {isDownloading ? (
        <>
          <Loader2 className="w-6 h-6 animate-spin text-[#21c063]" />
          <span className="text-[11px] text-[#a5a5a5]">جاري تحميل الملصق...</span>
        </>
      ) : (
        <>
          <Smile className="w-7 h-7 text-[#21c063]/70" />
          <span className="text-[11px] text-[#a5a5a5]">ملصق (انقر للتنزيل)</span>
        </>
      )}
    </div>
  );
}

// مكوّن بطاقة المستندات والملفات بتصميم واتساب الرسمي (محفوظ بـ React.memo)
const DocumentCard = React.memo(function DocumentCard({
  src,
  fileName,
  fileSize,
  isFromMe,
}: {
  src: string;
  fileName?: string;
  fileSize?: number;
  isFromMe?: boolean;
}) {
  const ext = fileName && fileName.includes('.') ? fileName.split('.').pop()?.toUpperCase() : 'FILE';
  const isPdf = ext === 'PDF';
  const isDoc = ext === 'DOC' || ext === 'DOCX';
  const isSheet = ext === 'XLS' || ext === 'XLSX' || ext === 'CSV';
  const isZip = ext === 'ZIP' || ext === 'RAR' || ext === '7Z';

  const formatSize = (bytes?: number) => {
    if (!bytes || isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formattedSize = formatSize(fileSize);

  return (
    <div
      draggable={true}
      onDragStart={(e) => {
        handleMediaDragStart(e, src, { fileName: fileName || `document.${ext}` });
      }}
      onDragEnd={handleMediaDragEnd}
      onClick={() => {
        if (isMediaCurrentlyDragging()) return;
        window.open(src, '_blank');
      }}
      className="my-1 max-w-[340px] rounded-xl overflow-hidden bg-[#242626]/95 border border-[#2e2f2f] hover:border-[#21c063]/70 hover:bg-[#2b2e2e] transition-all shadow-sm select-none cursor-grab active:cursor-grabbing group/doc"
      title="اسحب الملف إلى سطح المكتب أو انقر لفتحه"
    >
      <div className="p-3 flex items-center gap-3">
        {/* أيقونة نوع الملف */}
        <div
          className={`w-11 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 shadow-inner font-bold text-[10px] uppercase text-white group-hover/doc:scale-105 transition-transform ${
            isPdf
              ? 'bg-rose-600'
              : isDoc
              ? 'bg-blue-600'
              : isSheet
              ? 'bg-emerald-600'
              : isZip
              ? 'bg-amber-600'
              : 'bg-teal-600'
          }`}
        >
          <FileText className="w-5 h-5 mb-0.5" />
          <span className="leading-none text-[9px] truncate max-w-[38px]">{ext}</span>
        </div>

        {/* تفاصيل الملف */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-[#fafafa] group-hover/doc:text-[#21c063] transition-colors truncate dir-ltr text-right" title={fileName || 'مستند'}>
            {fileName || 'مستند بدون اسم'}
          </div>
          <div className="text-[11px] text-[#a5a5a5] mt-0.5 flex items-center gap-2">
            {formattedSize && <span>{formattedSize}</span>}
            {formattedSize && <span>•</span>}
            <span className="uppercase">{ext}</span>
            <span className="text-emerald-400/80 mr-auto text-[10px] group-hover/doc:underline font-bold">فتح ↗</span>
          </div>
        </div>

        {/* زر التنزيل أو الفتح */}
        <a
          href={src}
          download={fileName || `file.${ext?.toLowerCase()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 rounded-full bg-[#2e2f2f] group-hover/doc:bg-[#21c063] text-[#b8b9b9] group-hover/doc:text-white flex items-center justify-center transition-colors shrink-0 shadow-xs cursor-pointer"
          title="تنزيل أو فتح الملف"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
});

// دالة تحويل رمز الإيموجي إلى رابط صورته الأصلية بدقة فائقة من مجموعة إيموجيات واتساب / آبل الأصلية (مع كاش فوري)
const emojiUrlCache = new Map<string, string>();
function getWhatsAppEmojiUrl(emoji: string): string {
  if (!emoji || typeof emoji !== 'string') return '';
  const cached = emojiUrlCache.get(emoji);
  if (cached !== undefined) return cached;
  const r: string[] = [];
  let c = 0, p = 0, i = 0;
  while (i < emoji.length) {
    c = emoji.charCodeAt(i++);
    if (p) {
      r.push((0x10000 + ((p - 0xD800) << 10) + (c - 0xDC00)).toString(16));
      p = 0;
    } else if (0xD800 <= c && c <= 0xDBFF) {
      p = c;
    } else {
      r.push(c.toString(16));
    }
  }
  const hex = r.join('-');
  const url = `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/${hex}.png`;
  if (emojiUrlCache.size > 2000) emojiUrlCache.clear();
  emojiUrlCache.set(emoji, url);
  return url;
}

// مكوّن عرض إيموجي واتساب الأصلي بصور فائقة الدقة مع دعم الرجوع التلقائي للرمز عند انقطاع الاتصال (محفوظ بـ React.memo)
const WhatsAppEmoji = React.memo(function WhatsAppEmoji({
  emoji,
  size = 20,
  className = '',
}: {
  emoji: string;
  size?: number;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);
  const url = useMemo(() => getWhatsAppEmojiUrl(emoji), [emoji]);

  if (hasError || !url) {
    return <span className={`inline-block leading-none select-none ${className}`}>{emoji}</span>;
  }

  return (
    <img
      src={url}
      alt={emoji}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setHasError(true)}
      className={`inline-block object-contain select-none pointer-events-none align-middle ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  );
});

// تصنيفات الإيموجي الشاملة لمنتقي التفاعلات المتقدم كواتساب ويب (+ Emoji Picker)
const EMOJI_CATEGORIES = [
  {
    id: 'smileys',
    name: 'Smileys & People',
    arabicName: 'ابتسامات وأشخاص',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥲', '🥹', '😊', '😇',
      '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛',
      '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳', '😏', '😒',
      '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭',
      '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥',
      '😓', '🤗', '🤔', '🫣', '🤭', '🫢', '🫡', '🤫', '🫠', '🤥', '😶', '😐',
      '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪',
      '😵', '😵‍💫', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠',
      '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖',
      '👍', '👎', '👏', '🙌', '👐', '🤲', '🤝', '👊', '✊', '🤛', '🤜', '🤞',
      '✌️', '🫰', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️',
      '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '🫵', '✍️', '🤳', '🙏', '💅', '🦾',
      '🦿', '🦵', '🦶', '👂', '👃', '👀', '👁️', '👅', '👄', '🫦', '👤', '👥',
      '🫂', '👶', '👦', '👧', '👨', '👩', '👴', '👵'
    ],
  },
  {
    id: 'animals',
    name: 'Animals & Nature',
    arabicName: 'حيوانات وطبيعة',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮',
      '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🐴', '🦄',
      '🐝', '🐛', '🦋', '🐢', '🐍', '🐙', '🐬', '🐳', '🦈', '🌸', '🌹', '🌺',
      '🌻', '🌼', '🌷', '🌱', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '☀️', '🌙',
      '⭐', '☁️', '🌧️', '⛈️', '❄️', '⚡', '🌈', '🌊'
    ],
  },
  {
    id: 'food',
    name: 'Food & Drink',
    arabicName: 'طعام وشراب',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑',
      '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🥦', '🌽', '🥕', '🍞', '🥐', '🥖',
      '🧀', '🍗', '🥩', '🍔', '🍟', '🍕', '🥪', '🌮', '🌯', '🥗', '🍝', '🍜',
      '🍲', '🍛', '🍣', '🍱', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁',
      '🍫', '🍬', '🍭', '☕', '🫖', '🍵', '🧃', '🥤', '🍼', '🍺', '🍻'
    ],
  },
  {
    id: 'activity',
    name: 'Activity',
    arabicName: 'أنشطة ورياضة',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🎱', '🏓', '🏸', '🏒',
      '🥊', '🥋', '🎯', '🤿', '🎿', '🏂', '🏋️', '🤺', '🏇', '🧘', '🏄', '🏊',
      '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎫', '🎪', '🎭', '🎨', '🎬',
      '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🎮', '🎲', '♟️', '🎳'
    ],
  },
  {
    id: 'travel',
    name: 'Travel & Places',
    arabicName: 'سفر وأماكن',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚',
      '🚜', '🛵', '🏍️', '🚲', '🛴', '✈️', '🛫', '🛬', '🚀', '🛸', '🚁', '🛶',
      '⛵', '🚤', '🛳️', '⛴️', '🚢', '⚓', '⛽', '🏖️', '🏝️', '🏜️', '🌋', '⛰️',
      '🏔️', '🏕️', '🏠', '🏡', '🏢', '🏛️', '🕌', '🕍', '🕋', '⛩️', '🏰', '🗼',
      '🗽', '🗺️'
    ],
  },
  {
    id: 'objects',
    name: 'Objects',
    arabicName: 'أدوات وأشياء',
    emojis: [
      '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '📷', '📸', '📹', '🎥', '📞', '☎️',
      '⏱️', '⏰', '🕰️', '⌛', '💡', '🔦', '🕯️', '💸', '💵', '💰', '💳', '💎',
      '⚖️', '🔧', '🔨', '🛠️', '🧲', '🔫', '💣', '🛡️', '🔑', '🗝️', '🚪', '📦',
      '✉️', '📩', '📨', '📫', '📜', '📄', '📑', '🧾', '📊', '📈', '📌', '📍'
    ],
  },
  {
    id: 'symbols',
    name: 'Symbols',
    arabicName: 'رموز وقلوب',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '💯', '🔥', '✨',
      '🌟', '⭐', '💫', '💥', '💢', '💨', '💦', '💤', '🎉', '🎊', '✔️', '✅',
      '❌', '⭕', '⛔', '🚫', '⚠️', '❗', '❓', '‼️', '⁉️', '💬', '💭', '🔔',
      '🎵', '🎶', '💲', '➕', '➖', '➗', '✖️', '™️', '®️', '©️'
    ],
  },
  {
    id: 'flags',
    name: 'Flags',
    arabicName: 'أعلام',
    emojis: [
      '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🇯🇴', '🇵🇸', '🇸🇦', '🇦🇪', '🇪🇬', '🇸🇾',
      '🇱🇧', '🇮🇶', '🇰🇼', '🇶🇦', '🇧🇭', '🇴🇲', '🇾🇪', '🇹🇷', '🇺🇸', '🇬🇧', '🇩🇪', '🇫🇷',
      '🇮🇹', '🇪🇸'
    ],
  },
];

// قاموس للبحث السريع عن الإيموجي بالكلمات المفتاحية العربية والإنجليزية
const EMOJI_SEARCH_KEYWORDS: Record<string, string> = {
  '👍': 'like thumbs up اعجاب تم موافق نعم تمام ممتاز اوك',
  '👎': 'dislike thumbs down ديسلايك رفض لا سيء مش عاجبني',
  '❤️': 'love heart حب قلب احمر عشاق',
  '🧡': 'orange heart قلب برتقالي',
  '💛': 'yellow heart قلب اصفر',
  '💚': 'green heart قلب اخضر',
  '💙': 'blue heart قلب ازرق',
  '💜': 'purple heart قلب بنفسجي',
  '🖤': 'black heart قلب اسود',
  '🤍': 'white heart قلب ابيض',
  '💔': 'broken heart قلب مكسور حزن',
  '😂': 'laugh joy tears ضحك دموع ههه خخخ مضحك نكتة كركرة',
  '🤣': 'rofl rolling on the floor laughing فرط ضحك مات ضحك',
  '😍': 'heart eyes love حب اعجاب يجنن عيون قلوب عسل',
  '🥰': 'smiling face hearts حب حنان لطيف مشاعر دافئ',
  '😘': 'kiss قبلة بوسة حب محبة',
  '😭': 'sob crying tears بكاء صياح حزن شديد دموع نياح',
  '😢': 'cry sad حزين دمعة زعل متضايق',
  '🥺': 'pleading رجاء مسكنة بليز مشان الله كرمال',
  '😮': 'surprise open mouth تفاجؤ صدمة واو وااو فاتح فمه',
  '😱': 'screaming fear صدمة رعب خوف فزع يما مصدوم',
  '🔥': 'fire نار حريق رهيب مشعلل قوي فخم ولعانة توب',
  '💯': 'hundred 100 مية مئة صح تمام كامل فخم مية بالمية',
  '✔️': 'check mark صح تم منجز موافق اوك تأكيد تم الاستلام',
  '✅': 'check mark green صح تم اخضر تمام منجز تم التحويل',
  '❌': 'cross mark x خطا خطأ ممنوع الغاء لا مرفوض',
  '🙏': 'pray please شكرا رجاء دعاء امانة تسلم يديك يسلمو يارب',
  '👏': 'clap bravo تصفيق كفو ابطال احسنت زقفة',
  '🤝': 'handshake deal اتفاق مصافحة تم البيع شريك تم الاتفاق',
  '💪': 'muscle strong قوة بطل وحش حديد عضلات عاش',
  '🎉': 'party celebration مبروك احتفال حفلة تخرج مبارك الف مبروك',
  '🎊': 'confetti احتفال مبروك فرح اعراس',
  '✨': 'sparkles بريق لمعان فخامة مميز جديد سحر لميع',
  '⭐': 'star نجمة مميز مفضل',
  '🌟': 'glowing star نجمة ذهب لمعان متألق',
  '💰': 'money bag فلوس مصاري اموال كاش كنز حوالة ثروة دولار شيكل دينار',
  '💵': 'dollar bills دولارات فلوس مصاري نقود نقد كاش',
  '💸': 'money wings طيران مصاري مصاريف صرف فلوس راحت دفع',
  '💳': 'credit card بطاقة فيزا دفع بنك سداد بطاقة بنكية صراف',
  '🧾': 'receipt وصل فاتورة ايصال سند حوالة صورة وصل',
  '☕': 'coffee قهوة شاي كوفي صباح روقان كاسة',
  '🌹': 'rose وردة زهرة حب جميل احمر',
  '🌸': 'cherry blossom وردة زهر جميل ربيع',
  '🚗': 'car سيارة مواصلات طريق سفر تكسي',
  '🚀': 'rocket صاروخ سرعة طيران انطلاق ابداع سريع فوري',
  '📱': 'mobile phone هاتف جوال تليفون اتصال رسالة',
  '🔒': 'lock قفل مقفل حماية امان سرية مسجل مغلق',
  '🔓': 'unlock مفتوح فك القفل غير مقفل تعديل',
  '💡': 'light bulb فكرة لمبة اضاءة ذكاء حل إبداع',
  '⚠️': 'warning تحذير انتباه خطر تنبيه دير بالك',
  '⚡': 'lightning برق سرعة طاقة كهرباء سريع شرارة',
  '🥳': 'party face احتفال مبسوط حفلة فرحان عرس طبلة',
  '😎': 'cool sunglasses كول رائع كشخة نظارة شمسية',
  '🤔': 'thinking تفكير حيرة محتار شك سؤال',
  '🤫': 'shh secret سر سكوت هدوء لا تحكي',
  '😴': 'sleep نائم نوم تعبان نعسان',
  '🫡': 'salute تحية احترام حاضر سيدي تكرم عيونك',
};

// قائمة كافة الإيموجيات الفريدة محسوبة مسبقاً مرة واحدة لمنع استهلاك المعالج عند البحث
const ALL_UNIQUE_EMOJIS = Array.from(new Set(EMOJI_CATEGORIES.flatMap((c) => c.emojis)));

// ألوان أسماء المرسلين في القروبات (مثل واتساب: كل عضو له لون ثابت)
const SENDER_NAME_COLORS = ['#53bdeb', '#fc9775', '#06cf9c', '#e26ab6', '#ffbc38', '#7f66ff', '#a5b337', '#d88deb', '#ff7eb0', '#42c7b8'];

const getSenderKey = (m: any): string =>
  m?.senderJid || m?.rawBaileysMessage?.key?.participant || m?.sender || '';

const getSenderColor = (key: string): string => {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return SENDER_NAME_COLORS[hash % SENDER_NAME_COLORS.length];
};

// شاشة جوال (أقل من md في Tailwind)
const isMobileViewport = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

const isOwnMessage = (m: any): boolean =>
  Boolean(m && (m.sender === 'أنا' || m.senderName === 'أنا' || m.rawBaileysMessage?.key?.fromMe || m.isFromMe));

const localMessageDay = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

const formatMessageDay = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  const today = new Date();
  if (localMessageDay(timestampMs) === localMessageDay(today.getTime())) return 'اليوم';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (localMessageDay(timestampMs) === localMessageDay(yesterday.getTime())) return 'أمس';
  return date.toLocaleDateString('ar-JO', { day: 'numeric', month: 'long', year: 'numeric' });
};

export function WhatsAppChatInterface({
  onOpenReview,
  onOpenQRModal,
  onOpenSettings,
  onActiveChatChange,
  isPopoutMode = false,
  initialChat = '',
  initialChatName = '',
  initialMessageId,
}: WhatsAppChatInterfaceProps) {
  const currentBatch = useCurrentBatch();
  const [activeGroup, setActiveGroup] = useState<string>(() => initialChat || '');
  const [unreadDivider, setUnreadDivider] = useState<{ chatKey: string; unreadCount: number; openedAt: number } | null>(null);
  const hasSelectedChatRef = useRef(false);
  const activeGroupRef = useRef<string>(activeGroup);
  useEffect(() => {
    activeGroupRef.current = activeGroup;
    onActiveChatChange?.(Boolean(activeGroup));
  }, [activeGroup, onActiveChatChange]);
  useEffect(() => {
    if (!activeGroup) {
      hasSelectedChatRef.current = false;
      setUnreadDivider(null);
    }
  }, [activeGroup]);
  const uploadedCheckCache = useRef<Map<string, boolean>>(new Map());
  const airtableCheckCache = useRef<Map<string, boolean>>(new Map());
  const [airtableRecords, setAirtableRecords] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [actionStatus, setActionStatus] = useState<Record<string, {
    portal?: boolean;
    airtable?: boolean;
    forwardedTo?: string;
    isReceived?: boolean;
    registered?: boolean;
    read?: boolean;
    portalSubmitted?: boolean;
    airtableSaved?: boolean;
    autoLinkSuppressed?: boolean;
  }>>({});
  const [processingMsgId, setProcessingMsgId] = useState<string | null>(null);
  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    msg: any;
  } | null>(null);
  const [chatAreaContextMenu, setChatAreaContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  // قائمة خيارات رقم الجوال عند النقر عليه داخل رسالة (محادثة مع الرقم / نسخ الرقم)
  const [phoneMenu, setPhoneMenu] = useState<{
    phone: string;
    x: number;
    y: number;
    status: 'checking' | 'yes' | 'no';
  } | null>(null);
  // الجوال: قائمة الضغط المطوّل على الرسالة (تفاعلات + خيارات التسجيل + رد/حذف...)
  const [mobileSheet, setMobileSheet] = useState<{ msg: any; isTransfer: boolean } | null>(null);
  const mobileSheetOpenedAtRef = useRef<number>(0);
  const msgTouchRef = useRef<{
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
    el: HTMLElement;
    msg: any;
    isTransfer: boolean;
    swiping: boolean;
  } | null>(null);
  // نافذة "معلومات الرسالة": من استلم الرسالة ومن قرأها ومتى (مثل Message info في واتساب)
  // chatKey: المحادثة التي فُتحت منها النافذة (تختفي النافذة تلقائياً عند الانتقال لمحادثة أخرى)
  const [messageInfo, setMessageInfo] = useState<{ msg: any; chatKey: string; data: any | null; loading: boolean; error?: string } | null>(null);
  const messageInfoIdRef = useRef<string | null>(null);

  const fetchMessageInfo = async (msgId: string) => {
    try {
      const res = await fetch(`/api/whatsapp/messages?info=${encodeURIComponent(msgId)}`);
      const json = await res.json();
      if (messageInfoIdRef.current !== msgId) return;
      setMessageInfo((prev) =>
        prev ? { ...prev, loading: false, data: json.success ? json.info : null, error: json.success ? undefined : json.error } : prev
      );
    } catch {
      setMessageInfo((prev) => (prev ? { ...prev, loading: false, error: 'تعذر جلب معلومات الرسالة' } : prev));
    }
  };
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);
  const [bulkForwardDropdownOpen, setBulkForwardDropdownOpen] = useState<boolean>(false);

  // حالة شاشة التحويل المتقدمة الشبيهة بواتساب والقوائم المخصصة
  const [isForwardModalOpen, setIsForwardModalOpen] = useState<boolean>(false);
  const [forwardSearchQuery, setForwardSearchQuery] = useState<string>('');
  const [targetChatsToForward, setTargetChatsToForward] = useState<string[]>([]);
  const [activeForwardTab, setActiveForwardTab] = useState<string>('all');
  const [customForwardLists, setCustomForwardLists] = useState<Array<{ id: string; name: string; chatNames: string[] }>>([]);
  const [isManagingListsModalOpen, setIsManagingListsModalOpen] = useState<boolean>(false);
  const [editingList, setEditingList] = useState<{ id: string; name: string; chatNames: string[] } | null>(null);
  const [listFormName, setListFormName] = useState<string>('');
  const [listFormChats, setListFormChats] = useState<string[]>([]);
  const [listSearchQuery, setListSearchQuery] = useState<string>('');
  const [selectionMenuOpen, setSelectionMenuOpen] = useState<boolean>(false);
  const [isForwardingInProgress, setIsForwardingInProgress] = useState<boolean>(false);
  const [pendingPortalConfirm, setPendingPortalConfirm] = useState<{
    msg: any;
    parsed: any;
    targetPhone: string;
  } | null>(null);
  const [portalConfirmMessage, setPortalConfirmMessage] = useState<string>('');
  const [isSendingPortalCreds, setIsSendingPortalCreds] = useState<boolean>(false);
  const [realGroups, setRealGroups] = useState<any[]>([]);
  const [presenceByJid, setPresenceByJid] = useState<Record<string, Array<{ participant: string; state: string; lastSeen?: number; updatedAt: number }>>>({});
  const [presenceLoadingJid, setPresenceLoadingJid] = useState<string | null>(null);
  const [presenceNow, setPresenceNow] = useState(Date.now());
  const [waStatus, setWaStatus] = useState<{
    status: 'DISCONNECTED' | 'SCAN_QR' | 'CONNECTING' | 'CONNECTED';
    qrCode?: string | null;
    hasCreds?: boolean;
    user?: { name: string; phone: string; jid: string } | null;
    groupsCount?: number;
    messagesCount?: number;
    hasRealData?: boolean;
    hasDemoData?: boolean;
  }>({
    status: 'DISCONNECTED',
    hasCreds: false,
    hasDemoData: false,
    hasRealData: false,
  });
  const statusEventVersionRef = useRef(0);
  const liveConnectionStatusRef = useRef<string | null>(null);
  const lastMessageSnapshotAtRef = useRef(0);
  const lastFullMessageSyncAtRef = useRef(0);
  const [isClearingDemo, setIsClearingDemo] = useState<boolean>(false);
  const [isSyncingChats, setIsSyncingChats] = useState<boolean>(false);
  // نص حقل الكتابة يُحفظ داخل الحقل نفسه (بدون state) حتى لا تُعاد رسمة الشاشة كاملة مع كل حرف يُكتب
  // hasMessageText فقط لتبديل زر الإرسال/الميكروفون عند الانتقال بين حقل فارغ وغير فارغ
  const [hasMessageText, setHasMessageText] = useState<boolean>(false);
  // المنشن (@): قائمة أعضاء القروب، والنص المكتوب بعد @، والأعضاء الذين تم اختيارهم
  const [mentionMenu, setMentionMenu] = useState<{ start: number; query: string; index: number } | null>(null);
  const [mentionParticipants, setMentionParticipants] = useState<{ chatKey: string; list: any[]; loading: boolean }>({ chatKey: '', list: [], loading: false });
  const [pendingMentions, setPendingMentions] = useState<{ name: string; jid: string }[]>([]);
  const [isSendingMsg, setIsSendingMsg] = useState<boolean>(false);
  const [chatFilterTab, setChatFilterTab] = useState<string>('all');
  const [visibleChatCount, setVisibleChatCount] = useState(80);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hideReadMessages, setHideReadMessages] = useState<boolean>(false);
  // حالة معرفات الرسائل المخفية يدوياً وإمكانية استرجاعها عبر زر العين
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('hawalat_hidden_ids') : null;
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [showHiddenMessages, setShowHiddenMessages] = useState<boolean>(false);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [isSyncingReactions, setIsSyncingReactions] = useState<boolean>(false);
  const [historyBanner, setHistoryBanner] = useState<{
    text: string;
    type: 'info' | 'success' | 'warning' | 'error';
  } | null>(null);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState<boolean>(false);

  // 1. تثبيت المحادثات (Pinned Chats)
  const [pinnedChatKeys, setPinnedChatKeys] = useState<Set<string>>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('hawalat_pinned_chats') : null;
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // 2. أرشفة المحادثات (Archived Chats)
  const [archivedChatKeys, setArchivedChatKeys] = useState<Set<string>>(new Set());

  // 3. كتم الإشعارات (Muted Chats: key -> expireTimestampMs or -1 for always)
  const [mutedChats, setMutedChats] = useState<Record<string, number>>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('hawalat_muted_chats') : null;
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // 4. تحديد كغير مقروء يدوياً (Mark as Unread)
  const [markedUnreadChatKeys, setMarkedUnreadChatKeys] = useState<Set<string>>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('hawalat_marked_unread') : null;
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // 5. المفضلة (Favorites)
  const [favoriteChatKeys, setFavoriteChatKeys] = useState<Set<string>>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('hawalat_favorite_chats') : null;
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  // 6. قوائم واتساب المخصصة (Lists: listName -> string[])
  const [customLists, setCustomLists] = useState<Record<string, string[]>>(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('hawalat_custom_lists') : null;
      if (saved) return JSON.parse(saved);
      return { 'المفضلة': [], 'حوالات': [] };
    } catch {
      return { 'المفضلة': [], 'حوالات': [] };
    }
  });
  const [listsLoaded, setListsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadLists = async () => {
      try {
        const response = await fetch('/api/whatsapp/lists', { cache: 'no-store' });
        if (!response.ok) throw new Error('تعذرت قراءة القوائم');
        const data = await response.json();
        if (cancelled) return;
        if (data.exists && data.lists && typeof data.lists === 'object') {
          setCustomLists(data.lists);
        } else {
          const previousOwner = localStorage.getItem('hawalat_custom_lists_owner');
          const initialLists = !previousOwner || previousOwner === data.userId
            ? customLists
            : { 'المفضلة': [], 'حوالات': [] };
          setCustomLists(initialLists);
          localStorage.setItem('hawalat_custom_lists_owner', data.userId);
          await fetch('/api/whatsapp/lists', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lists: initialLists }),
          });
        }
        if (!cancelled) setListsLoaded(true);
      } catch {
        if (!cancelled) toast.warning('تعذرت مزامنة قوائم التطبيق الآن.');
      }
    };
    void loadLists();
    return () => { cancelled = true; };
  }, []);

  // 7. قائمة السياق للمحادثة (Chat Context Menu)
  const [chatContextMenu, setChatContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    chat: any;
  } | null>(null);

  // 8. معاينة الصورة بحجم كامل (Avatar Lightbox Modal)
  const [avatarLightbox, setAvatarLightbox] = useState<{
    isOpen: boolean;
    jid?: string;
    url: string;
    title: string;
    subtitle?: string;
    isGroup?: boolean;
  } | null>(null);

  const openAvatarLightbox = (jid: string | undefined, url: string, title: string, subtitle?: string, isGroup?: boolean) => {
    setAvatarLightbox({ isOpen: true, jid, url, title, subtitle, isGroup });
    if (!jid) return;
    void fetch(`/api/whatsapp/messages?avatarFull=${encodeURIComponent(jid)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data?.avatarUrl) return;
        const fullUrl = `${data.avatarUrl}?full=${Date.now()}`;
        setAvatarLightbox((current) => current?.isOpen && current.jid === jid ? { ...current, url: fullUrl } : current);
        setRealGroups((current) => current.map((group) => group.id === jid ? { ...group, avatarUrl: fullUrl } : group));
      })
      .catch(() => {});
  };

  // 9. بيانات المحادثة أو المجموعة (Group / Contact Info Drawer)
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState<boolean>(false);
  const [chatInfoData, setChatInfoData] = useState<any | null>(null);
  const [isLoadingChatInfo, setIsLoadingChatInfo] = useState<boolean>(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // حفظ التغييرات محلياً في localStorage
  useEffect(() => {
    try {
      localStorage.setItem('hawalat_pinned_chats', JSON.stringify(Array.from(pinnedChatKeys)));
    } catch {}
  }, [pinnedChatKeys]);

  useEffect(() => {
    try {
      localStorage.setItem('hawalat_muted_chats', JSON.stringify(mutedChats));
    } catch {}
  }, [mutedChats]);

  useEffect(() => {
    try {
      localStorage.setItem('hawalat_marked_unread', JSON.stringify(Array.from(markedUnreadChatKeys)));
    } catch {}
  }, [markedUnreadChatKeys]);

  useEffect(() => {
    try {
      localStorage.setItem('hawalat_favorite_chats', JSON.stringify(Array.from(favoriteChatKeys)));
    } catch {}
  }, [favoriteChatKeys]);

  useEffect(() => {
    try {
      localStorage.setItem('hawalat_custom_lists', JSON.stringify(customLists));
    } catch {}
  }, [customLists]);

  useEffect(() => {
    if (!listsLoaded) return;
    const timer = window.setTimeout(() => {
      void fetch('/api/whatsapp/lists', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lists: customLists }),
      }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(timer);
  }, [customLists, listsLoaded]);

  // خريطة ربط صور الإيصالات بحوالات البيانات (MsgId -> { receiptUrl, linkedMsgId, timestamp })
  const [linkedReceipts, setLinkedReceipts] = useState<
    Record<string, { receiptUrl: string; linkedMsgId?: string; timestamp?: string }>
  >({});


  const [newChatPhone, setNewChatPhone] = useState<string>('');
  const [newChatName, setNewChatName] = useState<string>('');
  const [isCreatingNewChat, setIsCreatingNewChat] = useState<boolean>(false);
  const [isEditingChatName, setIsEditingChatName] = useState<boolean>(false);
  const [editChatNameValue, setEditChatNameValue] = useState<string>('');
  const [downloadingMediaIds, setDownloadingMediaIds] = useState<string[]>([]);
  const [failedMediaIds, setFailedMediaIds] = useState<Set<string>>(new Set());
  const [loadedImageIds, setLoadedImageIds] = useState<Set<string>>(new Set());

  // حالة الرد على رسالة (Reply) وتحديد الرسالة المقتبسة والانتقال إليها
  const [replyingToMessage, setReplyingToMessage] = useState<any | null>(null);
  // حالة تعديل رسالة قائمة (Edit)
  const [editingMessage, setEditingMessage] = useState<any | null>(null);
  const [isEditingSaving, setIsEditingSaving] = useState<boolean>(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const getMessageText = () => messageInputRef.current?.value ?? '';
  const setMessageText = (value: string) => {
    if (messageInputRef.current) messageInputRef.current.value = value;
    setHasMessageText(Boolean(value.trim()));
  };

  // حالة القوالب والردود السريعة الذكية (/)
  const [quickReplies, setQuickReplies] = useState<QuickReplyTemplate[]>(() => getStoredQuickReplies());
  const [isQuickRepliesMenuOpen, setIsQuickRepliesMenuOpen] = useState<boolean>(false);
  const [quickRepliesQuery, setQuickRepliesQuery] = useState<string>('');
  const [quickRepliesSelectedIndex, setQuickRepliesSelectedIndex] = useState<number>(0);
  const [isQuickRepliesModalOpen, setIsQuickRepliesModalOpen] = useState<boolean>(false);

  // حالات نظام الـ CRM (الوسوم الملونة والملاحظات الداخلية السرية)
  const [crmData, setCrmData] = useState<Record<string, ChatCrmRecord>>(() => getStoredCrmData());
  const [crmTagsList, setCrmTagsList] = useState<CrmTag[]>(() => getStoredTags());
  const [isCrmPanelOpen, setIsCrmPanelOpen] = useState<boolean>(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  // المحادثات التي تم قراءتها ووصل المستخدم لأسفلها لإخفاء شارة الإشعار الخارجي فوراً
  const [readChatKeys, setReadChatKeys] = useState<Set<string>>(new Set());
  const [isAtBottom, setIsAtBottom] = useState<boolean>(true);

  // إدارة الملصقات والمفضلة ومتجر ستيكرات واتساب ⭐
  const [isStickerPickerOpen, setIsStickerPickerOpen] = useState<boolean>(false);
  const [favoriteStickers, setFavoriteStickers] = useState<WhatsAppSticker[]>([]);
  const [recentStickers, setRecentStickers] = useState<string[]>([]);

  // تحميل الملصقات المفضلة من السيرفر والأخيرة من التخزين المحلي
  useEffect(() => {
    const fetchFavoriteStickers = async () => {
      try {
        const res = await fetch('/api/whatsapp/stickers');
        if (res.ok) {
          const data = await res.json();
          if (data.favorites && Array.isArray(data.favorites)) {
            setFavoriteStickers(data.favorites);
          }
        }
      } catch (e) {
        console.error('Failed to load favorite stickers:', e);
      }
    };
    fetchFavoriteStickers();

    try {
      const savedRecent = localStorage.getItem('hawalat_recent_stickers');
      if (savedRecent) {
        setRecentStickers(JSON.parse(savedRecent));
      }
    } catch (e) {}
  }, []);

  // جلب ومزامنة بيانات الـ CRM مع السيرفر عند بدء التشغيل
  useEffect(() => {
    fetch('/api/whatsapp/crm')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data && typeof data.data === 'object') {
          setCrmData((prev) => {
            const merged = { ...prev, ...data.data };
            saveStoredCrmData(merged);
            return merged;
          });
        }
      })
      .catch(() => {});
  }, []);

  // مفتاح المحادثة الفعلي للـ CRM (معرّف فريد)
  const activeChatCrmKey = useMemo(() => {
    if (!activeGroup) return '';
    const targetGroup = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
    return targetGroup?.id || activeGroup;
  }, [activeGroup, realGroups]);

  const activeChatCrmRecord = useMemo(() => {
    if (!activeChatCrmKey) return undefined;
    return crmData[activeChatCrmKey] || { tags: [], notes: [] };
  }, [crmData, activeChatCrmKey]);

  // تبديل وسم لمحادثة (إضافة / إزالة)
  const handleToggleCrmTag = async (tagId: string) => {
    if (!activeChatCrmKey) return;
    const currentRecord = crmData[activeChatCrmKey] || { tags: [], notes: [] };
    const currentTags = currentRecord.tags || [];
    const nextTags = currentTags.includes(tagId)
      ? currentTags.filter((t) => t !== tagId)
      : [...currentTags, tagId];

    const updatedRecord: ChatCrmRecord = {
      ...currentRecord,
      tags: nextTags,
      updatedAt: new Date().toISOString(),
    };

    const updatedAll = {
      ...crmData,
      [activeChatCrmKey]: updatedRecord,
    };

    setCrmData(updatedAll);
    saveStoredCrmData(updatedAll);

    try {
      await fetch('/api/whatsapp/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_tags',
          chatKey: activeChatCrmKey,
          updates: { tags: nextTags },
        }),
      });
    } catch {}
  };

  // إضافة وسم مخصص جديد
  const handleAddCustomTag = (name: string, color: string) => {
    const newTag: CrmTag = {
      id: `tag_custom_${Date.now()}`,
      name,
      color,
      bgClass: 'bg-emerald-500/15',
      textClass: 'text-emerald-400',
      borderClass: 'border-emerald-500/30',
    };
    const updated = [...crmTagsList, newTag];
    setCrmTagsList(updated);
    saveStoredTags(updated);
    handleToggleCrmTag(newTag.id);
  };

  // إضافة ملاحظة داخلية سرية
  const handleAddCrmNote = async (text: string) => {
    if (!activeChatCrmKey || !text.trim()) return;
    const newNote: CrmNote = {
      id: `note_${Date.now()}`,
      text: text.trim(),
      author: 'أنا',
      createdAt: new Date().toISOString(),
    };

    const currentRecord = crmData[activeChatCrmKey] || { tags: [], notes: [] };
    const updatedRecord: ChatCrmRecord = {
      ...currentRecord,
      notes: [newNote, ...(currentRecord.notes || [])],
      updatedAt: new Date().toISOString(),
    };

    const updatedAll = {
      ...crmData,
      [activeChatCrmKey]: updatedRecord,
    };

    setCrmData(updatedAll);
    saveStoredCrmData(updatedAll);

    try {
      await fetch('/api/whatsapp/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_note',
          chatKey: activeChatCrmKey,
          updates: { note: newNote },
        }),
      });
    } catch {}
  };

  // حذف ملاحظة داخلية
  const handleDeleteCrmNote = async (noteId: string) => {
    if (!activeChatCrmKey) return;
    const currentRecord = crmData[activeChatCrmKey] || { tags: [], notes: [] };
    const updatedRecord: ChatCrmRecord = {
      ...currentRecord,
      notes: (currentRecord.notes || []).filter((n) => n.id !== noteId),
      updatedAt: new Date().toISOString(),
    };

    const updatedAll = {
      ...crmData,
      [activeChatCrmKey]: updatedRecord,
    };

    setCrmData(updatedAll);
    saveStoredCrmData(updatedAll);

    try {
      await fetch('/api/whatsapp/crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_note',
          chatKey: activeChatCrmKey,
          updates: { noteId },
        }),
      });
    } catch {}
  };

  // استخراج الاسم المخصص للمشترك لاستبداله في المتغيرات
  const resolvedActiveContactName = useMemo(() => {
    if (!activeGroup) return 'المشترك';
    const matched = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
    if (matched?.name) return matched.name;
    if (activeGroup === initialChat && initialChatName) return initialChatName;
    const messageName = messages.find((message) => message.chatJid === activeGroup && message.chatName && message.chatName !== activeGroup)?.chatName;
    if (messageName) return messageName;
    return activeGroup;
  }, [activeGroup, realGroups, initialChat, initialChatName, messages]);

  // معلومات المحادثة النشطة (الهاتف، الصورة، هل هي مجموعة) لدعم ملف الـ CRM
  const activeChatInfo = useMemo(() => {
    if (!activeGroup) return null;
    return realGroups.find((g) => g.name === activeGroup || g.id === activeGroup) || null;
  }, [activeGroup, realGroups]);

  // تثبيت / إلغاء تثبيت محادثة
  const togglePinChat = (chat: any) => {
    const key = chat.id || chat.name;
    setPinnedChatKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key) || next.has(chat.name)) {
        next.delete(key);
        next.delete(chat.name);
        toast.info('تم إلغاء تثبيت المحادثة.');
      } else {
        next.add(key);
        toast.success('تم تثبيت المحادثة في أعلى القائمة.');
      }
      return next;
    });
    setChatContextMenu(null);
  };

  // فتح المحادثة في نافذة متصفح مستقلة (Pop-out Window)
  const handlePopoutChat = useCallback((chat: any) => {
    setChatContextMenu(null);
    if (!chat) return;
    const chatName = chat.id || chat.name || (typeof chat === 'string' ? chat : '');
    if (!chatName) return;
    const width = 640;
    const height = 820;
    const left = typeof window !== 'undefined' ? Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2)) : 100;
    const top = typeof window !== 'undefined' ? Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2)) : 100;
    const features = `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no,location=no`;
    const win = window.open(`/?popoutChat=${encodeURIComponent(chatName)}`, `hawalat_popout_${encodeURIComponent(chatName)}`, features);
    if (win) {
      win.focus();
    }
  }, []);

  // أرشفة / إلغاء أرشفة محادثة بالتزامن مع واتساب
  const toggleArchiveChat = async (chat: any) => {
    const key = chat.id || chat.name;
    const isCurrentlyArchived = typeof chat.archived === 'boolean'
      ? chat.archived
      : Boolean(archivedChatKeys.has(key) || archivedChatKeys.has(chat.name));
    const newArchived = !isCurrentlyArchived;

    setRealGroups((prev) => prev.map((group) =>
      group.id === chat.id || (!chat.id && group.name === chat.name)
        ? { ...group, archived: newArchived }
        : group
    ));

    setArchivedChatKeys((prev) => {
      const next = new Set(prev);
      if (isCurrentlyArchived) {
        next.delete(key);
        if (chat.name) next.delete(chat.name);
        if (chat.id) next.delete(chat.id);
        toast.info('تم إلغاء أرشفة المحادثة.');
      } else {
        next.add(key);
        if (chat.name) next.add(chat.name);
        if (chat.id) next.add(chat.id);
        toast.success('تم نقل المحادثة إلى الأرشيف.');
      }
      return next;
    });
    setChatContextMenu(null);

    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'archive_chat',
          id: chat.id || chat.name,
          archive: newArchived,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setArchivedChatKeys((prev) => {
          const next = new Set(prev);
          for (const value of [key, chat.id, chat.name]) {
            if (!value) continue;
            if (isCurrentlyArchived) next.add(value);
            else next.delete(value);
          }
          return next;
        });
        setRealGroups((prev) => prev.map((group) =>
          group.id === chat.id || (!chat.id && group.name === chat.name)
            ? { ...group, archived: isCurrentlyArchived }
            : group
        ));
        toast.warning('تعذر مزامنة الأرشفة مع واتساب. حاول بعد عودة الاتصال.');
      } else if (data?.groups) {
        setRealGroups(data.groups);
      }
    } catch {
      setArchivedChatKeys((prev) => {
        const next = new Set(prev);
        for (const value of [key, chat.id, chat.name]) {
          if (!value) continue;
          if (isCurrentlyArchived) next.add(value);
          else next.delete(value);
        }
        return next;
      });
      setRealGroups((prev) => prev.map((group) =>
        group.id === chat.id || (!chat.id && group.name === chat.name)
          ? { ...group, archived: isCurrentlyArchived }
          : group
      ));
      toast.warning('تعذر مزامنة الأرشفة مع واتساب.');
    }
  };

  // كتم / إلغاء كتم الإشعارات
  const handleMuteChat = (chat: any, duration: '8h' | '1w' | 'always' | 'unmute') => {
    const key = chat.id || chat.name;
    setMutedChats((prev) => {
      const next = { ...prev };
      if (duration === 'unmute') {
        delete next[key];
        delete next[chat.name];
        toast.info('تم إلغاء كتم الإشعارات.');
      } else {
        let expire = -1;
        if (duration === '8h') expire = Date.now() + 8 * 3600 * 1000;
        else if (duration === '1w') expire = Date.now() + 7 * 24 * 3600 * 1000;
        next[key] = expire;
        toast.success(`تم كتم إشعارات المحادثة ${duration === '8h' ? 'لمدة 8 ساعات' : duration === '1w' ? 'لمدة أسبوع' : 'دائماً'}.`);
      }
      return next;
    });
    setChatContextMenu(null);
  };

  // تحديد كغير مقروءة / مقروءة
  const toggleMarkUnread = async (chat: any) => {
    const key = chat.id || chat.name;
    const isCurrentlyUnread =
      markedUnreadChatKeys.has(key) ||
      markedUnreadChatKeys.has(chat.name) ||
      (chat.unread || 0) > 0;

    if (isCurrentlyUnread) {
      setMarkedUnreadChatKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        next.delete(chat.name);
        return next;
      });
      setReadChatKeys((prev) => new Set(prev).add(chat.name).add(key));
      try {
        await fetch('/api/whatsapp/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mark_chat_read', chat: key }),
        });
      } catch {}
      toast.info('تم تحديد المحادثة كمقروءة.');
    } else {
      setMarkedUnreadChatKeys((prev) => new Set(prev).add(key));
      setReadChatKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        next.delete(chat.name);
        return next;
      });
      toast.success('تم تحديد المحادثة كغير مقروءة.');
    }
    setChatContextMenu(null);
  };

  // إضافة / إزالة من المفضلة
  const toggleFavoriteChat = (chat: any) => {
    const key = chat.id || chat.name;
    setFavoriteChatKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key) || next.has(chat.name)) {
        next.delete(key);
        next.delete(chat.name);
        toast.info('تمت إزالة المحادثة من المفضلة.');
      } else {
        next.add(key);
        toast.success('تمت إضافة المحادثة إلى المفضلة.');
      }
      return next;
    });
    setChatContextMenu(null);
  };

  // تبديل انضمام محادثة لقائمة مخصصة
  const toggleChatInCustomList = (chat: any, listName: string) => {
    const key = chat.id || chat.name;
    setCustomLists((prev) => {
      const currentList = prev[listName] || [];
      const exists = currentList.includes(key) || currentList.includes(chat.name);
      let updatedList: string[];
      if (exists) {
        updatedList = currentList.filter((k) => k !== key && k !== chat.name);
        toast.info(`تمت إزالة المحادثة من قائمة "${listName}".`);
      } else {
        updatedList = [...currentList, key];
        toast.success(`تمت إضافة المحادثة إلى قائمة "${listName}".`);
      }
      return {
        ...prev,
        [listName]: updatedList,
      };
    });
  };

  // إنشاء قائمة جديدة
  const handleCreateNewList = () => {
    const name = window.prompt('أدخل اسم القائمة الجديدة (مثل: عملاء فلسطين، محاسبة):');
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    if (customLists[cleanName]) {
      toast.warning('هذه القائمة موجودة بالفعل.');
      return;
    }
    setCustomLists((prev) => ({
      ...prev,
      [cleanName]: chatContextMenu?.chat ? [chatContextMenu.chat.id || chatContextMenu.chat.name] : [],
    }));
    toast.success(`تم إنشاء قائمة "${cleanName}" بنجاح.`);
    setChatContextMenu(null);
  };

  // مسح محتوى المحادثة
  const handleClearChat = async (chat: any) => {
    const confirmClear = window.confirm(`هل أنت متأكد من مسح كافة رسائل ومحتوى محادثة "${chat.name}"؟`);
    if (!confirmClear) return;
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_chat', chat: chat.id || chat.name }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'تم مسح محتوى المحادثة بنجاح.');
        if (data.messages) {
          setMessages(data.messages);
        }
      } else {
        toast.error('تعذر مسح المحادثة.');
      }
    } catch {
      toast.error('حدث خطأ أثناء مسح المحادثة.');
    }
    setChatContextMenu(null);
  };

  // مغادرة المجموعة أو حذف المحادثة
  const handleExitOrDeleteChat = async (chat: any) => {
    const isGrp = chat.isGroup;
    const promptMsg = isGrp
      ? `هل أنت متأكد من مغادرة مجموعة "${chat.name}" في واتساب؟`
      : `هل أنت متأكد من حذف محادثة "${chat.name}"؟`;
    if (!window.confirm(promptMsg)) return;

    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exit_group', chat: chat.id || chat.name }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || (isGrp ? 'تمت مغادرة المجموعة بنجاح.' : 'تم حذف المحادثة.'));
        if (activeGroup === chat.name || activeGroup === chat.id) {
          setActiveGroup('');
        }
        if (data.groups) {
          setRealGroups(data.groups);
        }
        if (data.messages) {
          setMessages(data.messages);
        }
      } else {
        toast.error('تعذر إتمام العملية.');
      }
    } catch {
      toast.error('حدث خطأ أثناء تنفيذ الطلب.');
    }
    setChatContextMenu(null);
    setIsGroupInfoOpen(false);
  };

  // جلب بيانات ومعلومات المحادثة أو المجموعة الكاملة (Group/Contact Info)
  const fetchChatInfo = async (target: string) => {
    if (!target) return;
    setIsLoadingChatInfo(true);
    setIsGroupInfoOpen(true);
    try {
      const res = await fetch(`/api/whatsapp/messages?chatInfo=${encodeURIComponent(target)}`);
      const data = await res.json();
      if (data.success && data.chatInfo) {
        setChatInfoData(data.chatInfo);
      } else {
        setChatInfoData(null);
      }
    } catch (e) {
      console.error('Error fetching chat info:', e);
      setChatInfoData(null);
    } finally {
      setIsLoadingChatInfo(false);
    }
  };

  // تحديث وصف المجموعة
  const handleUpdateGroupDescription = async (desc: string) => {
    if (!chatInfoData) return;
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_group_desc',
          chat: chatInfoData.id || chatInfoData.name,
          description: desc,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('تم تحديث وصف المجموعة في واتساب بنجاح.');
        setChatInfoData((prev: any) => (prev ? { ...prev, description: desc } : prev));
      } else {
        toast.error(data.message || 'تعذر تحديث وصف المجموعة.');
      }
    } catch {
      toast.error('فشل حفظ وصف المجموعة.');
    }
  };

  // تصفية القوالب السريعة حسب البحث
  const filteredQuickReplies = useMemo(() => {
    const q = quickRepliesQuery.trim().toLowerCase();
    if (!q) return quickReplies;
    return quickReplies.filter(
      (tpl) =>
        tpl.shortcut.toLowerCase().includes(q) ||
        tpl.title.toLowerCase().includes(q) ||
        tpl.content.toLowerCase().includes(q)
    );
  }, [quickReplies, quickRepliesQuery]);

  // إدراج القالب السريع المختار في حقل الكتابة
  const handleSelectQuickReply = (tpl: QuickReplyTemplate) => {
    if (!tpl) return;
    const interpolated = interpolateQuickReply(tpl.content, {
      name: resolvedActiveContactName,
    });

    const currentText = getMessageText();
    const slashIdx = currentText.lastIndexOf('/');
    let newText = interpolated;
    if (slashIdx !== -1) {
      newText = currentText.substring(0, slashIdx) + interpolated;
    }

    setMessageText(newText);
    setIsQuickRepliesMenuOpen(false);

    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 50);
  };

  // حالة قائمة المرفقات ومعاينة وإرسال الوسائط (الملفات، الفيديوهات، الملصقات)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState<boolean>(false);
  const [pendingMedia, setPendingMedia] = useState<{
    file: File | null;
    dataUrl: string;
    mediaType: 'image' | 'video' | 'document' | 'sticker' | 'audio';
    fileName: string;
    fileSize: number;
    caption: string;
  } | null>(null);
  const [isSendingMedia, setIsSendingMedia] = useState<boolean>(false);
  const submittedMediaRef = useRef<typeof pendingMedia>(null);
  useEffect(() => {
    if (!pendingMedia) submittedMediaRef.current = null;
  }, [pendingMedia]);
  const [outgoingImages, setOutgoingImages] = useState<Array<{
    id: string;
    chatName: string;
    chatJid: string;
    sender: string;
    senderName: string;
    isFromMe: boolean;
    hasMedia: boolean;
    mediaType: 'image';
    mediaUrl: string;
    text: string;
    timestamp: string;
    timestampMs: number;
    uploadState: 'sending' | 'failed';
    deliveryStatus?: 'pending';
    uploadBody: Record<string, unknown>;
  }>>([]);
  const sendingImageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const confirmedRequests = new Set(messages.map((message) => message.clientRequestId).filter(Boolean));
    if (confirmedRequests.size === 0) return;
    setOutgoingImages((prev) => prev.some((image) => confirmedRequests.has(image.id))
      ? prev.filter((image) => !confirmedRequests.has(image.id))
      : prev);
  }, [messages]);

  // حالة السحب والإفلات المباشر للملفات فوق المحادثة (Drag & Drop)
  const [isDraggingOverChat, setIsDraggingOverChat] = useState<boolean>(false);
  const dragCounterRef = useRef<number>(0);
  const [dragHoverChatKey, setDragHoverChatKey] = useState<string | null>(null);
  const dragHoverChatTimerRef = useRef<NodeJS.Timeout | null>(null);

  // حالة تسجيل الرسائل الصوتية الحية عبر المايكروفون (Voice Recording PTT)
  const [isRecordingAudio, setIsRecordingAudio] = useState<boolean>(false);
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const [isSendingAudio, setIsSendingAudio] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const formatRecordingDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const startVoiceRecording = async () => {
    if (!activeGroup) {
      toast.warning('يرجى تحديد محادثة أولاً لتسجيل رسالة صوتية', 'تنبيه');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder !== 'undefined') {
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
            mimeType = 'audio/ogg;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else {
            mimeType = '';
          }
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      setIsRecordingAudio(true);
      setRecordingDuration(0);

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access error:', err);
      toast.error('تعذر الوصول إلى المايكروفون. يرجى التأكد من توصيل المايك ومنح الإذن للمتصفح.', 'إذن المايكروفون');
    }
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setIsRecordingAudio(false);
    setRecordingDuration(0);
    toast.info('تم إلغاء التسجيل الصوتي.', 'إلغاء التسجيل');
  };

  const stopAndSendVoiceRecording = async () => {
    if (!mediaRecorderRef.current || !activeGroup || isSendingAudio) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    setIsSendingAudio(true);
    const recorder = mediaRecorderRef.current;

    recorder.onstop = async () => {
      try {
        const finalMime = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: finalMime });

        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
        }

        if (audioBlob.size < 400) {
          toast.warning('التسجيل الصوتي قصير جداً تم إلغاؤه.', 'تنبيه');
          setIsRecordingAudio(false);
          setIsSendingAudio(false);
          return;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          const targetGroup = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
          const targetChatJid = targetGroup?.id || messages.find((m) => (m.chatName === activeGroup || m.senderName === activeGroup) && m.chatJid)?.chatJid;

          try {
            const res = await fetch('/api/whatsapp/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'send_media',
                chat: targetChatJid || activeGroup,
                fileBase64: base64Audio,
                mediaType: 'voice',
                mimetype: finalMime,
                caption: '',
                quotedMsgId: replyingToMessage?.id,
              }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
              if (data.messages && Array.isArray(data.messages)) {
                setMessages(data.messages);
              }
              setReplyingToMessage(null);
              toast.success('تم إرسال البصمة الصوتية بنجاح', 'تم الإرسال');
              setTimeout(() => scrollToBottom('smooth'), 100);
            } else {
              toast.error(data.message || 'تعذر إرسال التسجيل الصوتي', 'فشل الإرسال');
            }
          } catch (e: any) {
            toast.error(`خطأ أثناء إرسال الصوت: ${e.message}`, 'خطأ');
          } finally {
            setIsRecordingAudio(false);
            setIsSendingAudio(false);
            setRecordingDuration(0);
          }
        };
        reader.readAsDataURL(audioBlob);
      } catch (e: any) {
        console.error('Failed to process voice recording:', e);
        setIsRecordingAudio(false);
        setIsSendingAudio(false);
      }
    };

    try {
      recorder.stop();
    } catch {
      setIsRecordingAudio(false);
      setIsSendingAudio(false);
    }
  };

  const imageVideoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

  // إغلاق قائمة المرفقات عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(e.target as Node)) {
        setAttachmentMenuOpen(false);
      }
    };
    if (attachmentMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [attachmentMenuOpen]);

  // معالجة اختيار ملف للوسائط (صورة، فيديو، مستند، ملصق، صوت) مع دعم التعليق الأولي إن وجد
  const handleFileSelected = (
    file: File,
    forceType?: 'image' | 'video' | 'document' | 'sticker' | 'audio',
    initialCaption?: string
  ) => {
    if (!file) return;

    let mediaType: 'image' | 'video' | 'document' | 'sticker' | 'audio' = forceType || 'image';
    if (!forceType) {
      if (file.type.startsWith('video/')) mediaType = 'video';
      else if (file.type.startsWith('audio/')) mediaType = 'audio';
      else if (file.type.startsWith('image/')) mediaType = 'image';
      else mediaType = 'document';
    }

    // إذا اختار المستخدم ملصقاً والملف ليس بصيغة webp، يتم تحويله تلقائياً بواسطة Canvas
    if (mediaType === 'sticker' && !file.type.includes('webp') && file.type.startsWith('image/')) {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const scale = Math.min(512 / img.width, 512 / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (512 - w) / 2;
          const y = (512 - h) / 2;
          ctx.drawImage(img, x, y, w, h);
          const webpDataUrl = canvas.toDataURL('image/webp', 0.85);
          setPendingMedia({
            file,
            dataUrl: webpDataUrl,
            mediaType: 'sticker',
            fileName: file.name.replace(/\.[^/.]+$/, '') + '.webp',
            fileSize: Math.round(webpDataUrl.length * 0.75),
            caption: initialCaption || '',
          });
        }
      };
      img.src = objectUrl;
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPendingMedia({
          file,
          dataUrl: reader.result,
          mediaType,
          fileName: file.name,
          fileSize: file.size,
          caption: initialCaption || '',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  // معالجة لصق الصور أو الوسائط من الحافظة مباشرة (Ctrl+V Paste Handlers)
  const handleClipboardPaste = (e: React.ClipboardEvent | ClipboardEvent) => {
    if (!activeGroup) return;

    const clipboardData = (e as any).clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    const files = clipboardData.files;

    let targetFile: File | null = null;

    // 1. فحص عناصر الحافظة للبحث عن ملف صورة أو وسائط
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) {
            targetFile = f;
            break;
          }
        }
      }
    }

    // 2. فحص قائمة الملفات في الحافظة إذا لم نجد في items
    if (!targetFile && files && files.length > 0) {
      targetFile = files[0];
    }

    // إذا وُجد ملف صورة أو وسائط، نقوم باعتراض اللصق وتحويله لمرفق فوري كواتساب ويب تماماً
    if (targetFile) {
      e.preventDefault();
      e.stopPropagation();

      // سحب أي نص كان مكتوباً في خانة الرسالة لجعله تعليقاً على الصورة المرفقة
      const currentInputText = messageInputRef.current?.value?.trim() || '';
      if (messageInputRef.current) {
        messageInputRef.current.value = '';
        setHasMessageText(false);
      }

      // إعطاء اسم أنيق إذا كان الملف افتراضياً بدون اسم
      let finalFile = targetFile;
      if (!targetFile.name || targetFile.name === 'image.png' || targetFile.name === 'blob') {
        const ext = targetFile.type.split('/')[1] || 'png';
        finalFile = new File([targetFile], `صورة_ملصقة_${Date.now()}.${ext}`, { type: targetFile.type });
      }

      handleFileSelected(finalFile, undefined, currentInputText);
    }
  };

  // معالجة أحداث السحب والإفلات للملفات والصور (Drag & Drop Handlers)
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeGroup) return;
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOverChat(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeGroup) return;
    if (!isDraggingOverChat) {
      setIsDraggingOverChat(true);
    }
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeGroup) return;
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOverChat(false);
    }
  };

  // استخراج ملف الصورة المسحوبة سواء كان ملفاً حقيقياً من سطح المكتب أو وسائط مسحوبة من داخل التطبيق/المتصفح
  const extractFileFromDataTransfer = async (dt: DataTransfer): Promise<File | null> => {
    try {
      if (dt.files && dt.files.length > 0) {
        return dt.files[0];
      }
      let url = dt.getData('text/uri-list') || dt.getData('text/plain') || '';
      if (!url) {
        const downloadUrl = dt.getData('DownloadURL');
        if (downloadUrl) {
          const parts = downloadUrl.split(':');
          if (parts.length >= 3) {
            url = parts.slice(2).join(':');
          }
        }
      }
      url = url.trim();
      if (url) {
        if (url.startsWith('data:')) {
          const res = await fetch(url);
          const blob = await res.blob();
          const ext = blob.type.split('/')[1] || 'jpg';
          return new File([blob], `whatsapp_image_${Date.now()}.${ext}`, { type: blob.type || 'image/jpeg' });
        }
        if (url.startsWith('/') || url.startsWith('http://') || url.startsWith('https://')) {
          const res = await fetch(url);
          if (res.ok) {
            const blob = await res.blob();
            const cleanName = url.split('/').pop()?.split('?')[0] || `whatsapp_image_${Date.now()}.jpg`;
            return new File([blob], cleanName, { type: blob.type || 'image/jpeg' });
          }
        }
      }
    } catch (e) {
      console.warn('تعذر استخراج ملف الصورة من السحب:', e);
    }
    return null;
  };

  // معالجة سحب صورة فوق محادثة في القائمة الجانبية الخارجية
  const handleSidebarChatDragEnter = (e: React.DragEvent, chatName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragHoverChatKey(chatName);
    if (dragHoverChatTimerRef.current) {
      clearTimeout(dragHoverChatTimerRef.current);
    }
    // فتح المحادثة تلقائياً عند التحويم فوقها بالصورة لمدة 350 ميلي ثانية (Spring-loaded Open)
    dragHoverChatTimerRef.current = setTimeout(() => {
      handleSelectChat(chatName);
    }, 350);
  };

  const handleSidebarChatDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleSidebarChatDragLeave = (e: React.DragEvent, chatName: string) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && e.currentTarget.contains(relatedTarget)) {
      return;
    }
    if (dragHoverChatKey === chatName) {
      if (dragHoverChatTimerRef.current) {
        clearTimeout(dragHoverChatTimerRef.current);
        dragHoverChatTimerRef.current = null;
      }
      setDragHoverChatKey(null);
    }
  };

  const handleSidebarChatDrop = async (e: React.DragEvent, chatName: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragHoverChatTimerRef.current) {
      clearTimeout(dragHoverChatTimerRef.current);
      dragHoverChatTimerRef.current = null;
    }
    setDragHoverChatKey(null);

    // 1. فتح المحادثة المحددة فوراً
    await handleSelectChat(chatName);

    // 2. استخراج ملف الصورة المسحوبة وإظهار نافذة المعاينة المباشرة للتأكيد قبل الإرسال
    const file = await extractFileFromDataTransfer(e.dataTransfer);
    if (file) {
      handleFileSelected(file);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingOverChat(false);

    if (!activeGroup) {
      toast.warning('يرجى تحديد محادثة أولاً قبل إفلات الملفات', 'تنبيه');
      return;
    }

    const currentInputText = messageInputRef.current?.value?.trim() || '';
    if (messageInputRef.current) {
      messageInputRef.current.value = '';
      setHasMessageText(false);
    }

    const file = await extractFileFromDataTransfer(e.dataTransfer);
    if (file) {
      handleFileSelected(file, undefined, currentInputText);
    }
  };

  const sendOptimisticImage = async (draft: (typeof outgoingImages)[number]) => {
    if (sendingImageIdsRef.current.has(draft.id)) return;
    sendingImageIdsRef.current.add(draft.id);
    setOutgoingImages((prev) => prev.map((item) => item.id === draft.id ? { ...item, uploadState: 'sending' } : item));
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft.uploadBody, compactResponse: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || data.error || 'تعذر إرسال الصورة');
      if (data.sentMessage) {
        setMessages((prev) => prev.some((item) => item.id === data.sentMessage.id)
          ? prev.map((item) => item.id === data.sentMessage.id ? { ...item, ...data.sentMessage } : item)
          : [data.sentMessage, ...prev]);
      } else {
        void fetchMessages();
      }
      setOutgoingImages((prev) => prev.filter((item) => item.id !== draft.id));
    } catch (error: any) {
      setOutgoingImages((prev) => prev.map((item) => item.id === draft.id ? { ...item, uploadState: 'failed' } : item));
      toast.error(error?.message || 'تعذر إرسال الصورة', 'فشل الإرسال');
    } finally {
      sendingImageIdsRef.current.delete(draft.id);
    }
  };

  // إرسال الوسائط الجاري معاينتها عبر واتساب
  const handleSendPendingMedia = async () => {
    if (!pendingMedia || !activeGroup || isSendingMedia || submittedMediaRef.current === pendingMedia) return;
    submittedMediaRef.current = pendingMedia;
    setIsSendingMedia(true);

    try {
      let quotedMsgPayload: any = undefined;
      if (replyingToMessage) {
        const quotedImg = replyingToMessage.mediaUrl || linkedReceipts[replyingToMessage.id]?.receiptUrl;
        quotedMsgPayload = {
          id: replyingToMessage.id,
          sender: replyingToMessage.isFromMe || replyingToMessage.sender === 'أنا' ? 'أنا' : replyingToMessage.sender,
          senderName: replyingToMessage.senderName,
          text: replyingToMessage.text?.slice(0, 150) || '',
          hasMedia: Boolean(replyingToMessage.hasMedia || quotedImg),
          mediaUrl: quotedImg,
        };
      }

      const targetGroup = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
      const targetChatJid = targetGroup?.id || messages.find((m) => (m.chatName === activeGroup || m.senderName === activeGroup) && m.chatJid)?.chatJid;

      const uploadBody = {
        action: 'send_media',
        chat: targetChatJid || activeGroup,
        fileBase64: pendingMedia.dataUrl,
        mediaType: pendingMedia.mediaType,
        fileName: pendingMedia.fileName,
        mimetype: pendingMedia.file?.type || (pendingMedia.mediaType === 'video'
          ? 'video/mp4'
          : pendingMedia.mediaType === 'sticker' ? 'image/webp' : 'application/octet-stream'),
        caption: pendingMedia.caption.trim(),
        quotedMsgId: replyingToMessage?.id,
        quotedPayload: quotedMsgPayload,
      };

      if (pendingMedia.mediaType === 'image') {
        const now = Date.now();
        const localId = `local_image_${now}_${Math.random().toString(36).slice(2)}`;
        const draft: (typeof outgoingImages)[number] = {
          id: localId,
          chatName: activeGroup,
          chatJid: targetChatJid || activeGroup,
          sender: 'أنا',
          senderName: 'أنا',
          isFromMe: true,
          hasMedia: true,
          mediaType: 'image',
          mediaUrl: pendingMedia.dataUrl,
          text: pendingMedia.caption.trim(),
          timestamp: new Date(now).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          timestampMs: now,
          uploadState: 'sending',
          deliveryStatus: 'pending',
          uploadBody: { ...uploadBody, clientRequestId: localId },
        };
        setOutgoingImages((prev) => [...prev, draft]);
        setPendingMedia(null);
        setReplyingToMessage(null);
        setIsSendingMedia(false);
        requestAnimationFrame(() => scrollToBottom('smooth'));
        void sendOptimisticImage(draft);
        return;
      }

      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadBody),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
        setPendingMedia(null);
        setReplyingToMessage(null);
        toast.success(data.message || 'تم إرسال الملف بنجاح عبر واتساب', 'تم الإرسال');
        setTimeout(() => scrollToBottom('smooth'), 100);
      } else {
        submittedMediaRef.current = null;
        toast.error(data.message || 'تعذر إرسال الملف عبر واتساب', 'فشل الإرسال');
      }
    } catch (e: any) {
      submittedMediaRef.current = null;
      toast.error(`خطأ: ${e.message}`, 'فشل الإرسال');
    } finally {
      setIsSendingMedia(false);
    }
  };

  // حالة عارض الوسائط الشامل داخل الصفحة (In-Page Media Viewer / Lightbox)
  const [lightboxState, setLightboxState] = useState<{
    msgId: string;
    url: string;
    type: 'image' | 'video' | 'audio' | 'voice' | 'sticker' | 'document';
    sender: string;
    timestamp: string;
    caption?: string;
    albumMsgs?: any[];
  } | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState<number>(1);
  const [lightboxRotation, setLightboxRotation] = useState<number>(0);
  const [lightboxOffset, setLightboxOffset] = useState({ x: 0, y: 0 });
  const lightboxPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const lightboxGestureRef = useRef<{
    distance: number;
    zoom: number;
    midpoint: { x: number; y: number };
    offset: { x: number; y: number };
  } | null>(null);
  const lightboxPanRef = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(null);

  const resetLightboxGesture = () => {
    lightboxPointersRef.current.clear();
    lightboxGestureRef.current = null;
    lightboxPanRef.current = null;
    setLightboxOffset({ x: 0, y: 0 });
  };

  const handleLightboxPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointers = lightboxPointersRef.current;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      lightboxGestureRef.current = {
        distance: Math.hypot(second.x - first.x, second.y - first.y) || 1,
        zoom: lightboxZoom,
        midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
        offset: lightboxOffset,
      };
      lightboxPanRef.current = null;
    } else if (pointers.size === 1 && lightboxZoom > 1) {
      lightboxPanRef.current = { x: event.clientX, y: event.clientY, offset: lightboxOffset };
    }
  };

  const handleLightboxPointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    const pointers = lightboxPointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const viewport = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!viewport) return;
    const clampOffset = (offset: { x: number; y: number }, zoom: number) => ({
      x: Math.max(-viewport.width * (zoom - 1) / 2, Math.min(viewport.width * (zoom - 1) / 2, offset.x)),
      y: Math.max(-viewport.height * (zoom - 1) / 2, Math.min(viewport.height * (zoom - 1) / 2, offset.y)),
    });
    if (pointers.size >= 2 && lightboxGestureRef.current) {
      const [first, second] = [...pointers.values()];
      const gesture = lightboxGestureRef.current;
      const zoom = Math.max(1, Math.min(4, gesture.zoom * Math.hypot(second.x - first.x, second.y - first.y) / gesture.distance));
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const ratio = zoom / gesture.zoom;
      const center = { x: viewport.left + viewport.width / 2, y: viewport.top + viewport.height / 2 };
      setLightboxZoom(zoom);
      setLightboxOffset(zoom === 1 ? { x: 0, y: 0 } : clampOffset({
        x: gesture.offset.x + midpoint.x - gesture.midpoint.x + (1 - ratio) * (gesture.midpoint.x - center.x - gesture.offset.x),
        y: gesture.offset.y + midpoint.y - gesture.midpoint.y + (1 - ratio) * (gesture.midpoint.y - center.y - gesture.offset.y),
      }, zoom));
    } else if (pointers.size === 1 && lightboxPanRef.current && lightboxZoom > 1) {
      const pan = lightboxPanRef.current;
      setLightboxOffset(clampOffset({ x: pan.offset.x + event.clientX - pan.x, y: pan.offset.y + event.clientY - pan.y }, lightboxZoom));
    }
  };

  const handleLightboxPointerUp = (event: React.PointerEvent<HTMLImageElement>) => {
    lightboxPointersRef.current.delete(event.pointerId);
    lightboxGestureRef.current = null;
    const remaining = [...lightboxPointersRef.current.values()][0];
    lightboxPanRef.current = remaining && lightboxZoom > 1
      ? { ...remaining, offset: lightboxOffset }
      : null;
  };

  // نسخ الصورة الفعلية مباشرة إلى حافظة النظام (Clipboard) لتتمكن من لصقها كصورة في أي برنامج
  const copyImageToClipboard = async (imageUrl: string, captionText?: string) => {
    if (!imageUrl) {
      toast.warning('الصورة غير متوفرة بعد أو لم يتم تنزيلها', 'نسخ الصورة');
      return false;
    }

    try {
      toast.info('جاري نسخ الصورة إلى الحافظة...', 'نسخ');

      const res = await fetch(imageUrl, { cache: 'force-cache' });
      if (!res.ok) {
        throw new Error('ملف الصورة غير متوفر على الخادم');
      }
      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        throw new Error('ملف الصورة فارغ');
      }

      // يتطلب معيار Clipboard API في المتصفحات أن تكون الصورة بصيغة image/png
      let pngBlob: Blob = blob;
      if (blob.type !== 'image/png') {
        const objectUrl = URL.createObjectURL(blob);
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('تعذر معالجة تنسيق الصورة للحافظة'));
            img.src = objectUrl;
          });
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 400;
          canvas.height = img.naturalHeight || img.height || 400;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const convertedBlob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob((b) => resolve(b), 'image/png')
            );
            if (convertedBlob) {
              pngBlob = convertedBlob;
            }
          }
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }

      if (navigator.clipboard && typeof (window as any).ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({
            'image/png': pngBlob,
          }),
        ]);
        toast.success('تم نسخ الصورة إلى الحافظة بنجاح، يمكنك لصقها الآن في أي مكان', 'نسخ الصورة');
        return true;
      } else {
        throw new Error('ClipboardItem API غير مدعوم في هذا المتصفح');
      }
    } catch (err: any) {
      console.warn('Direct image clipboard write failed, trying text fallback:', err);
      try {
        const cleanCaption =
          captionText &&
          !['ملصق', 'صورة', 'مقطع فيديو', 'تسجيل صوتي', 'مقطع صوتي'].includes(captionText.trim())
            ? captionText.trim()
            : '';
        const fallbackText =
          cleanCaption ||
          (imageUrl.startsWith('http') || imageUrl.startsWith('data:')
            ? imageUrl
            : window.location.origin + imageUrl);

        let copied = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(fallbackText);
            copied = true;
          } catch {}
        }

        if (!copied) {
          const ta = document.createElement('textarea');
          ta.value = fallbackText;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          copied = document.execCommand('copy');
          document.body.removeChild(ta);
        }

        if (copied) {
          toast.info(cleanCaption ? 'تم نسخ النص المرفق بالصورة إلى الحافظة' : 'تم نسخ رابط الصورة إلى الحافظة', 'نسخ');
          return true;
        }

        toast.error('تعذر نسخ الصورة إلى الحافظة');
      } catch {
        toast.error('تعذر نسخ الصورة إلى الحافظة');
      }
      return false;
    }
  };

  const openLightbox = (msg: any, customUrl?: string, albumMsgs?: any[]) => {
    const url = customUrl || msg.mediaUrl || linkedReceipts[msg.id]?.receiptUrl;
    if (!url) return;

    const lower = url.toLowerCase();
    const isPdf = lower.endsWith('.pdf') || lower.includes('.pdf');
    const isDoc = lower.endsWith('.doc') || lower.endsWith('.docx') || lower.endsWith('.xls') || lower.endsWith('.xlsx');

    let type: 'image' | 'video' | 'audio' | 'voice' | 'sticker' | 'document' = msg.mediaType || 'image';
    if (isPdf || isDoc || type === 'document') {
      type = 'document';
    } else if (!msg.mediaType) {
      if (url.endsWith('.mp4') || url.endsWith('.mov') || url.endsWith('.webm')) type = 'video';
      else if (url.endsWith('.webp')) type = 'sticker';
      else if (url.endsWith('.ogg') || url.endsWith('.m4a') || url.endsWith('.mp3')) type = 'audio';
      else type = 'image';
    }

    setLightboxState({
      msgId: msg.id,
      url,
      type,
      sender: msg.isFromMe || msg.sender === 'أنا' ? 'أنت' : (msg.senderName || msg.sender || 'مشترك'),
      timestamp: msg.timestamp || '',
      caption: msg.text || '',
      albumMsgs: albumMsgs || undefined,
    });
    setLightboxZoom(1);
    setLightboxRotation(0);
    resetLightboxGesture();
  };

  const closeLightbox = () => {
    setLightboxState(null);
    setLightboxZoom(1);
    setLightboxRotation(0);
    resetLightboxGesture();
  };

  const currentChatMediaMessages = useMemo(() => {
    return messages.filter((m) => {
      const url = m.mediaUrl || linkedReceipts[m.id]?.receiptUrl;
      return Boolean(url);
    });
  }, [messages, linkedReceipts]);

  const handleNavigateLightbox = (direction: 'prev' | 'next') => {
    if (!lightboxState) return;
    const mediaList =
      lightboxState.albumMsgs && lightboxState.albumMsgs.length > 1
        ? lightboxState.albumMsgs
        : currentChatMediaMessages;

    const currentIndex = mediaList.findIndex((m) => m.id === lightboxState.msgId);
    if (currentIndex === -1) return;

    let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0) nextIndex = mediaList.length - 1;
    if (nextIndex >= mediaList.length) nextIndex = 0;

    const nextMsg = mediaList[nextIndex];
    if (nextMsg) {
      openLightbox(nextMsg, undefined, lightboxState.albumMsgs);
    }
  };

  // حالة التفاعلات (Reactions) والمنتقي السريع ونافذة تفاصيل المتفاعلين ومنتقي الإيموجي الشامل
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [selectedReactionMsg, setSelectedReactionMsg] = useState<any | null>(null);
  const [fullEmojiPickerMsg, setFullEmojiPickerMsg] = useState<any | null>(null);
  const [fullEmojiPickerAnchor, setFullEmojiPickerAnchor] = useState<{
    msg: any;
    top: number;
    left?: number;
    right?: number;
  } | null>(null);
  const [recentReactions, setRecentReactions] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('hawalat_recent_reactions');
        if (saved) return JSON.parse(saved);
      } catch (e) {}
    }
    return ['✔️', '❤️', '👍', '🙏', '😂', '😮'];
  });
  const [emojiSearchQuery, setEmojiSearchQuery] = useState<string>('');
  const [activeEmojiTab, setActiveEmojiTab] = useState<string>('recent');
  const QUICK_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🥰'];

  // تحميل وحفظ القوائم المخصصة للتحويل
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hawalat_forward_custom_lists');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCustomForwardLists(parsed);
          return;
        }
      }
    } catch {}
    const defaultList = [{ id: 'work', name: 'تبعين الشغل', chatNames: [] }];
    setCustomForwardLists(defaultList);
    try {
      localStorage.setItem('hawalat_forward_custom_lists', JSON.stringify(defaultList));
    } catch {}
  }, []);

  const saveCustomForwardLists = (lists: Array<{ id: string; name: string; chatNames: string[] }>) => {
    setCustomForwardLists(lists);
    try {
      localStorage.setItem('hawalat_forward_custom_lists', JSON.stringify(lists));
    } catch {}
  };


  const recordRecentReaction = (emoji: string) => {
    if (!emoji) return;
    setRecentReactions((prev) => {
      const filtered = prev.filter((e) => e !== emoji);
      const updated = [emoji, ...filtered].slice(0, 18);
      try {
        localStorage.setItem('hawalat_recent_reactions', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  };

  // دالة موحدة لإغلاق كافة القوائم المنبثقة والمنسدلة ومنتقيات التفاعل لضمان عدم ظهور أي قائمتين معاً نهائياً
  const closeAllPopups = () => {
    setContextMenu(null);
    setChatAreaContextMenu(null);
    setDropdownOpenId(null);
    setReactionPickerMsgId(null);
    setFullEmojiPickerMsg(null);
    setFullEmojiPickerAnchor(null);
    setBulkForwardDropdownOpen(false);
    setIsQuickRepliesMenuOpen(false);
  };

  // إغلاق منتقي الإيموجي العائم تلقائياً عند تمرير الرسائل
  useEffect(() => {
    if (!fullEmojiPickerAnchor) return;
    const handleCloseOnScroll = () => {
      setFullEmojiPickerAnchor(null);
      setFullEmojiPickerMsg(null);
      setReactionPickerMsgId(null);
    };
    const el = messagesContainerRef.current;
    if (el) {
      el.addEventListener('scroll', handleCloseOnScroll, { passive: true });
    }
    return () => {
      if (el) el.removeEventListener('scroll', handleCloseOnScroll);
    };
  }, [fullEmojiPickerAnchor]);

  // تصفية الإيموجي في منتقي الإيموجي الشامل بالبحث
  const filteredEmojis = useMemo(() => {
    const q = emojiSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return ALL_UNIQUE_EMOJIS.filter((emoji) => {
      if (emoji.includes(q)) return true;
      const kw = EMOJI_SEARCH_KEYWORDS[emoji] || '';
      return kw.toLowerCase().includes(q);
    });
  }, [emojiSearchQuery]);

  const handleToggleReaction = async (msg: any, emoji: string) => {
    if (!msg?.id) return;
    closeAllPopups();

    const existingReactions = Array.isArray(msg.reactions) ? [...msg.reactions] : [];
    const myIdx = existingReactions.findIndex(
      (r: any) => r.isFromMe || r.sender === 'أنا' || r.senderName === 'أنا'
    );
    const isRemoving = myIdx >= 0 && existingReactions[myIdx]?.text === emoji;
    const emojiToSend = isRemoving ? '' : emoji;

    let updatedReactions = [...existingReactions];
    if (isRemoving) {
      updatedReactions.splice(myIdx, 1);
    } else if (myIdx >= 0) {
      updatedReactions[myIdx] = {
        ...updatedReactions[myIdx],
        text: emoji,
        timestampMs: Date.now(),
      };
      recordRecentReaction(emoji);
    } else {
      updatedReactions.push({
        text: emoji,
        sender: 'أنا',
        senderName: 'أنا',
        isFromMe: true,
        timestampMs: Date.now(),
      });
      recordRecentReaction(emoji);
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, reactions: updatedReactions } : m))
    );

    setSelectedReactionMsg((prev: any) =>
      prev && prev.id === msg.id ? { ...prev, reactions: updatedReactions } : prev
    );

    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'react',
          messageId: msg.id,
          chat: activeGroup || msg.chatJid || msg.groupName,
          emoji: emojiToSend,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        console.warn('Reaction warning:', data.error);
      }
    } catch (err) {
      console.error('Failed to react:', err);
      toast.error('تعذر إرسال التفاعل لواتساب', 'خطأ في التفاعل');
    }
  };

  const renderMessageReactions = (msg: any, isOutgoing: boolean) => {
    if (!msg.reactions || !Array.isArray(msg.reactions) || msg.reactions.length === 0) {
      return null;
    }
    const validReactions = msg.reactions.filter((r: any) => Boolean(r && r.text));
    if (validReactions.length === 0) return null;

    const uniqueEmojis: string[] = Array.from(new Set(validReactions.map((r: any) => String(r.text))));
    const hasMyReaction = validReactions.some(
      (r: any) => r.isFromMe || r.sender === 'أنا' || r.senderName === 'أنا'
    );
    const totalCount = validReactions.length;

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setSelectedReactionMsg(msg);
        }}
        className={`absolute -bottom-3 ${isOutgoing ? 'left-2' : 'right-2'} z-20 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs shadow-md border backdrop-blur-md cursor-pointer transition-all hover:scale-110 select-none ${
          hasMyReaction
            ? 'bg-[#1a3830] border-emerald-500/60 text-emerald-200'
            : 'bg-[#242626] border-[#2e2f2f] text-[#fafafa]'
        }`}
        title={`${totalCount} تفاعل - انقر لمعرفة المتفاعلين`}
      >
        <span className="flex items-center -space-x-1 rtl:space-x-reverse text-[12px] leading-none">
          {uniqueEmojis.slice(0, 3).map((emoji, idx) => (
            <span key={idx} className="inline-block transform hover:scale-125 transition-transform">
              <WhatsAppEmoji emoji={emoji} size={14} />
            </span>
          ))}
        </span>
        {totalCount > 1 && (
          <span className="text-[10px] font-semibold opacity-90 px-0.5">{totalCount}</span>
        )}
      </button>
    );
  };

  const renderQuickReactionPicker = (msg: any, isOutgoing: boolean) => {
    const isSingleSelected = isSelectionMode && selectedMsgIds.length === 1 && selectedMsgIds[0] === msg.id;
    if (reactionPickerMsgId !== msg.id && !isSingleSelected) return null;

    return (
      <div
        data-reaction-picker="true"
        dir="ltr"
        className={`absolute -top-12 ${
          isOutgoing ? 'right-0' : 'left-0'
        } z-40 flex items-center gap-1.5 bg-[#242626] border border-[#2e2f2f] shadow-2xl rounded-full px-2.5 py-1.5 animate-in fade-in zoom-in-95 duration-150 whitespace-nowrap`}
        onClick={(e) => e.stopPropagation()}
      >
        {QUICK_REACTION_EMOJIS.map((emoji) => {
          const isCurrent = msg.reactions?.some(
            (r: any) =>
              (r.isFromMe || r.sender === 'أنا' || r.senderName === 'أنا') && r.text === emoji
          );
          return (
            <button
              key={emoji}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeAllPopups();
                handleToggleReaction(msg, emoji);
              }}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-transform hover:scale-130 active:scale-95 cursor-pointer ${
                isCurrent
                  ? 'bg-emerald-500/30 ring-1.5 ring-emerald-400'
                  : 'hover:bg-[#161717]'
              }`}
              title={isCurrent ? `إزالة التفاعل ${emoji}` : `تفاعل بـ ${emoji}`}
            >
              <WhatsAppEmoji emoji={emoji} size={20} />
            </button>
          );
        })}
        {/* زر (+) لفتح منتقي جميع الإيموجي كواتساب ويب الرسمي كقائمة عائمة محاذية للشريط وليست بمنتصف الشاشة */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (fullEmojiPickerAnchor && fullEmojiPickerAnchor.msg.id === msg.id) {
              setFullEmojiPickerAnchor(null);
              setFullEmojiPickerMsg(null);
              return;
            }

            const buttonEl = e.currentTarget;
            const barEl = buttonEl.parentElement || buttonEl;
            const barRect = barEl.getBoundingClientRect();
            const pickerWidth = Math.min(410, window.innerWidth - 20);
            const pickerHeight = 380;

            let right: number | undefined;
            let left: number | undefined;

            if (isOutgoing) {
              const distFromRight = window.innerWidth - barRect.right;
              right = Math.max(10, Math.min(window.innerWidth - pickerWidth - 10, distFromRight));
            } else {
              left = Math.max(10, Math.min(window.innerWidth - pickerWidth - 10, barRect.left));
            }

            let top = barRect.bottom + 6;
            if (top + pickerHeight > window.innerHeight - 10) {
              if (barRect.top - pickerHeight - 6 >= 10) {
                top = barRect.top - pickerHeight - 6;
              } else {
                top = Math.max(10, window.innerHeight - pickerHeight - 10);
              }
            }

            setFullEmojiPickerMsg(msg);
            setFullEmojiPickerAnchor({
              msg,
              top,
              left,
              right,
            });
            setEmojiSearchQuery('');
            setActiveEmojiTab('recent');
          }}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-transform hover:scale-125 active:scale-95 cursor-pointer font-bold ${
            fullEmojiPickerAnchor?.msg?.id === msg.id
              ? 'bg-[#21c063] text-white'
              : 'text-[#a5a5a5] hover:text-[#21c063] hover:bg-[#161717]'
          }`}
          title="المزيد من التفاعلات (+)"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const renderMessageMedia = (msg: any, isOutgoing: boolean) => {
    const linkedUrl = linkedReceipts[msg.id]?.receiptUrl || msg.linkedReceiptUrl || msg.status?.linkedImageUrl;
    const rawUrl = msg.mediaUrl || linkedUrl;
    const isLinkedReceipt = Boolean(linkedUrl);

    if (rawUrl) {
      const lowerUrl = rawUrl.toLowerCase();
      const isPdf = lowerUrl.endsWith('.pdf') || lowerUrl.includes('.pdf');
      const isDoc = lowerUrl.endsWith('.doc') || lowerUrl.endsWith('.docx') || lowerUrl.endsWith('.xls') || lowerUrl.endsWith('.xlsx') || lowerUrl.endsWith('.zip') || lowerUrl.endsWith('.txt');
      let type: 'image' | 'video' | 'audio' | 'voice' | 'sticker' | 'document' = msg.mediaType || 'image';

      if (isPdf || isDoc || type === 'document') {
        type = 'document';
      } else if (!msg.mediaType) {
        if (lowerUrl.endsWith('.mp4') || lowerUrl.endsWith('.mov') || lowerUrl.endsWith('.webm')) type = 'video';
        else if (lowerUrl.endsWith('.webp')) type = 'sticker';
        else if (lowerUrl.endsWith('.ogg') || lowerUrl.endsWith('.m4a') || lowerUrl.endsWith('.mp3')) type = 'audio';
        else type = 'image';
      }

      if (type === 'audio' || type === 'voice') {
        return (
          <div className="my-1">
            <VoiceNotePlayer
              src={rawUrl}
              duration={msg.mediaDuration}
              isFromMe={isOutgoing}
              isVoiceNote={type === 'voice'}
            />
          </div>
        );
      }

      if (type === 'video') {
        return (
          <div className="my-1">
            <VideoPlayerCard
              src={rawUrl}
              duration={msg.mediaDuration}
              onOpenLightbox={() => openLightbox(msg, rawUrl)}
            />
          </div>
        );
      }

      if (type === 'sticker') {
        return (
          <div className="my-1">
            <StickerCard
              src={rawUrl}
              onOpenLightbox={() => openLightbox(msg, rawUrl)}
            />
          </div>
        );
      }

      if (type === 'document') {
        const resolvedFileName =
          msg.fileName ||
          (isLinkedReceipt
            ? (rawUrl.split('/').pop() || 'إيصال حوالة.pdf')
            : (rawUrl.split('/').pop() || 'مستند'));
        return (
          <div className="relative my-1 max-w-[340px]">
            <DocumentCard
              src={rawUrl}
              fileName={resolvedFileName}
              fileSize={msg.fileSize}
              isFromMe={isOutgoing}
            />
            {isLinkedReceipt && (
              <div className="absolute top-2 left-2 bg-black/85 backdrop-blur-sm text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 border border-emerald-500/40 shadow-xs z-10 pointer-events-none">
                <Link2 className="w-3 h-3 text-emerald-400" />
                <span>وصل مشبوك</span>
              </div>
            )}
          </div>
        );
      }

      // إذا كانت الرسالة صورة وبنفس الوقت مشبوك معها صورة وصل أخرى مختلفة:
      // نعرض الصورتين معاً جنباً إلى جنب في شبكة أنيقة بدلاً من إخفاء الصورة المشبوكة
      const linkedUrl = linkedReceipts[msg.id]?.receiptUrl || msg.linkedReceiptUrl || msg.status?.linkedImageUrl;
      const hasTwoImages = Boolean(msg.mediaUrl && linkedUrl && msg.mediaUrl !== linkedUrl);

      if (hasTwoImages) {
        return (
          <div className="flex flex-col gap-1.5 my-1 w-[280px] sm:w-[320px] max-w-full">
            <div className="grid grid-cols-2 gap-1.5 rounded-xl overflow-hidden bg-black/20 p-1 border border-emerald-500/40 w-full">
              {/* الصورة الأولى */}
              <div
                draggable={true}
                onDragStart={(e) => {
                  handleMediaDragStart(e, msg.mediaUrl, { fileName: `whatsapp_img_${msg.id}_1.jpg` });
                }}
                onDragEnd={handleMediaDragEnd}
                className="relative rounded-lg overflow-hidden bg-black/40 cursor-grab active:cursor-grabbing group/img aspect-square flex items-center justify-center hover:brightness-105 transition-all"
                onClick={(e) => {
                  if (isMediaCurrentlyDragging()) return;
                  e.stopPropagation();
                  if (isSelectionMode) {
                    handleToggleSelectMsg(msg.id);
                  } else {
                    openLightbox(msg, msg.mediaUrl);
                  }
                }}
                title="اسحب الصورة لسطح المكتب أو انقر للتكبير"
              >
                <img
                  src={msg.mediaUrl}
                  alt="الصورة الأولى"
                  className="w-full h-full object-cover rounded-lg select-none pointer-events-none"
                  loading="eager"
                  draggable={false}
                />
                <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[9px] text-white font-bold">
                  الصورة 1
                </div>
              </div>

              {/* الصورة الثانية المشبوكة */}
              <div
                draggable={true}
                onDragStart={(e) => {
                  handleMediaDragStart(e, linkedUrl, { fileName: `whatsapp_receipt_${msg.id}_2.jpg` });
                }}
                onDragEnd={handleMediaDragEnd}
                className="relative rounded-lg overflow-hidden bg-black/40 cursor-grab active:cursor-grabbing group/img aspect-square flex items-center justify-center border border-emerald-500/30 hover:brightness-105 transition-all"
                onClick={(e) => {
                  if (isMediaCurrentlyDragging()) return;
                  e.stopPropagation();
                  if (isSelectionMode) {
                    handleToggleSelectMsg(msg.id);
                  } else {
                    openLightbox(msg, linkedUrl);
                  }
                }}
                title="اسحب الصورة المشبوكة لسطح المكتب أو انقر للتكبير"
              >
                <img
                  src={linkedUrl}
                  alt="الصورة المشبوكة"
                  className="w-full h-full object-cover rounded-lg select-none pointer-events-none"
                  loading="eager"
                  draggable={false}
                />
                <div className="absolute top-1 right-1 bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 shadow-sm">
                  <Link2 className="w-2.5 h-2.5" />
                  <span>مشبوكة</span>
                </div>
                <div className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded text-[9px] text-white font-bold">
                  الصورة 2
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-1 text-[10px] text-emerald-400 font-bold select-none">
              <span className="flex items-center gap-1">
                <Link2 className="w-3 h-3 text-emerald-400" />
                <span>صورتان مشبوكتان معاً</span>
              </span>
              <span className="text-[9.5px] text-[#a5a5a5]">اسحب لسطح المكتب أو انقر للتكبير</span>
            </div>
          </div>
        );
      }

      // افتراضياً: صورة عادية أو إيصال مع إطار خفيف جداً وأنيق كواتساب
      const isFailed = failedMediaIds.has(msg.id);
      const isDownloading = downloadingMediaIds.includes(msg.id);

      if (isFailed) {
        return (
          <div className="rounded-xl bg-[#182229] border border-[#2e2f2f] p-3 my-1 flex items-center justify-between gap-3 min-w-[240px] max-w-[340px] shadow-xs select-none">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-[#202c33] border border-[#2e2f2f] flex items-center justify-center text-sky-400 shrink-0">
                <ImageIcon className="w-5 h-5 text-[#8696a0]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-[#fafafa] font-bold">صورة من واتساب</span>
                <span className="text-[10.5px] text-[#8696a0]">انقر للتنزيل أو إعادة المحاولة</span>
              </div>
            </div>
            <button
              type="button"
              disabled={isDownloading}
              onClick={(e) => {
                e.stopPropagation();
                handleRetryDownloadMedia(msg.id);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#202c33] hover:bg-[#2a3942] border border-[#2e2f2f] text-xs font-bold text-sky-400 hover:text-white cursor-pointer transition-colors shrink-0 shadow-xs"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isDownloading ? 'animate-spin' : ''}`} />
              <span>{isDownloading ? 'جاري...' : 'تنزيل'}</span>
            </button>
          </div>
        );
      }

      return (
        <div
          draggable={true}
          onDragStart={(e) => {
            handleMediaDragStart(e, rawUrl, { fileName: `whatsapp_img_${msg.id}.jpg` });
          }}
          onDragEnd={handleMediaDragEnd}
          className={`relative rounded-xl overflow-hidden my-1 bg-[#182229] border cursor-grab active:cursor-grabbing group/img min-w-[220px] min-h-[140px] w-auto max-w-[340px] shadow-xs transition-all hover:brightness-105 flex items-center justify-center ${
            isLinkedReceipt ? 'border-emerald-500/30' : 'border-white/[0.08]'
          }`}
          onClick={(e) => {
            if (isMediaCurrentlyDragging()) return;
            e.stopPropagation();
            if (isSelectionMode) {
              handleToggleSelectMsg(msg.id);
            } else {
              openLightbox(msg, rawUrl);
            }
          }}
          title="اسحب الصورة لسطح المكتب أو انقر للتكبير"
        >
          <NextImage
            src={rawUrl}
            alt="صورة"
            width={680}
            height={480}
            sizes="(max-width: 768px) 85vw, 340px"
            unoptimized
            className="w-full h-auto max-h-80 object-contain rounded-xl select-none pointer-events-none"
            loading={activeGroupMessages.slice(-10).some((item) => item.id === msg.id) ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            onError={() => {
              setFailedMediaIds((prev) => new Set(prev).add(msg.id));
            }}
            onLoad={() => {
              setLoadedImageIds((prev) => {
                if (prev.has(msg.id)) return prev;
                const next = new Set(prev);
                next.add(msg.id);
                return next;
              });
            }}
          />

          {!loadedImageIds.has(msg.id) && !msg.uploadState && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[#182229] text-xs text-[#a5a5a5] pointer-events-none">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>جاري تحميل الصورة...</span>
            </div>
          )}

          {msg.uploadState && (
            <div className="absolute bottom-2 right-2 z-20 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
              {msg.uploadState === 'sending' ? (
                <span className="flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ إرسال الصورة...</span>
              ) : (
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); void sendOptimisticImage(msg); }}
                  className="flex items-center gap-1.5 text-rose-300"
                >
                  <RotateCw className="h-3.5 w-3.5" /> فشل الإرسال، إعادة المحاولة
                </button>
              )}
            </div>
          )}

          {isLinkedReceipt && (
            <div className="absolute top-2 right-2 bg-black/75 backdrop-blur-sm text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 border border-emerald-500/40 shadow-xs z-10 pointer-events-none">
              <Link2 className="w-3 h-3 text-emerald-400" />
              <span>وصل مشبوك</span>
            </div>
          )}

          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none">
            <div className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center shadow-lg backdrop-blur-xs">
              <Maximize2 className="w-4 h-4" />
            </div>
          </div>
        </div>
      );
    }

    if (msg.isViewOnce) {
      return (
        <div className="flex items-center gap-2 text-[#a5a5a5] text-xs italic py-0.5" dir="auto">
          <EyeOff className="w-4 h-4 shrink-0" />
          <span>{msg.text || 'رسالة للعرض مرة واحدة'}</span>
        </div>
      );
    }

    if (msg.hasMedia) {
      if (msg.mediaType === 'sticker' || msg.text === 'ملصق' || (msg.mediaUrl && msg.mediaUrl.endsWith('.webp'))) {
        return (
          <StickerAutoDownloader
            msgId={msg.id}
            isDownloading={downloadingMediaIds.includes(msg.id)}
            onDownload={() => handleRetryDownloadMedia(msg.id, false)}
            onManualDownload={() => handleRetryDownloadMedia(msg.id, true)}
          />
        );
      }

      return (
        <div className="relative rounded-xl bg-[#161717]/70 border border-[#2e2f2f] p-2.5 my-1 flex items-center justify-between gap-3 min-w-[220px]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#242626] flex items-center justify-center text-[#21c063] shrink-0">
              {msg.mediaType === 'video' ? (
                <Film className="w-4 h-4 text-[#21c063]" />
              ) : msg.mediaType === 'audio' || msg.mediaType === 'voice' ? (
                <Mic className="w-4 h-4 text-[#21c063]" />
              ) : msg.mediaType === 'sticker' ? (
                <Smile className="w-4 h-4 text-[#21c063]" />
              ) : msg.mediaType === 'document' ? (
                <FileText className="w-4 h-4 text-[#21c063]" />
              ) : (
                <ImageIcon className="w-4 h-4 text-[#21c063]" />
              )}
            </div>
            <span className="text-xs text-[#fafafa] font-medium">
              {msg.mediaType === 'video'
                ? 'مقطع فيديو'
                : msg.mediaType === 'audio' || msg.mediaType === 'voice'
                ? 'تسجيل صوتي'
                : msg.mediaType === 'sticker'
                ? 'ملصق واتساب'
                : msg.mediaType === 'document'
                ? (msg.fileName || 'مستند')
                : 'وسائط من واتساب'}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              handleRetryDownloadMedia(msg.id);
            }}
            disabled={downloadingMediaIds.includes(msg.id)}
            className="h-6.5 text-[11px] border-[#2e2f2f] bg-[#242626] text-sky-400 hover:text-white px-2 rounded-md cursor-pointer"
          >
            <RotateCw className={`w-3 h-3 ml-1 ${downloadingMediaIds.includes(msg.id) ? 'animate-spin' : ''}`} />
            <span>تنزيل</span>
          </Button>
        </div>
      );
    }

    return null;
  };

  const handleStartReply = (msg: any) => {
    setReplyingToMessage(msg);
    closeAllPopups();
    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 50);
  };

  const handleCancelReply = () => {
    setReplyingToMessage(null);
  };

  const handleStartEditMessage = (msg: any) => {
    closeAllPopups();
    setReplyingToMessage(null);
    setEditingMessage(msg);
    setMessageText(msg.text || '');
    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 50);
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setMessageText('');
  };

  const handleJumpToMessage = (targetMsgId: string) => {
    if (!targetMsgId) return;
    const el = document.getElementById(`msg_${targetMsgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(targetMsgId);
      setTimeout(() => {
        setHighlightedMsgId((curr) => (curr === targetMsgId ? null : curr));
      }, 2500);
    } else {
      toast.info('الرسالة الأصلية غير متوفرة في العرض الحالي لهذه المحادثة.', 'انتقال للرسالة');
    }
  };

  const renderQuotedMessagePreview = (quoted: any, isOutgoing: boolean) => {
    if (!quoted) return null;
    const original = messages.find((m) => m.id === quoted.id);
    const quotedImg = quoted.mediaUrl || original?.mediaUrl || linkedReceipts[quoted.id]?.receiptUrl;
    const mediaLower = (quotedImg || quoted.text || original?.text || '').toLowerCase();
    const isPdf =
      mediaLower.endsWith('.pdf') ||
      mediaLower.includes('.pdf') ||
      quoted.mediaType === 'document' ||
      original?.mediaType === 'document';
    const isDoc =
      mediaLower.endsWith('.doc') ||
      mediaLower.endsWith('.docx') ||
      mediaLower.endsWith('.xls') ||
      mediaLower.endsWith('.xlsx');
    const isVideo =
      mediaLower.endsWith('.mp4') ||
      mediaLower.endsWith('.mov') ||
      quoted.mediaType === 'video' ||
      original?.mediaType === 'video';
    const hasMedia = Boolean(quoted.hasMedia || quotedImg || original?.hasMedia || isPdf);

    let senderTitle = 'مشترك';
    if (quoted.sender === 'أنا' || quoted.senderName === 'أنا') {
      senderTitle = 'أنت';
    } else if (quoted.senderName && quoted.senderName !== 'مشترك' && !quoted.senderName.startsWith('+10')) {
      senderTitle = quoted.senderName;
    } else if (quoted.sender && quoted.sender !== 'مشترك' && !quoted.sender.startsWith('+10')) {
      senderTitle = quoted.sender;
    } else if (original) {
      senderTitle =
        original.isFromMe || original.sender === 'أنا' || original.senderName === 'أنا'
          ? 'أنت'
          : (original.senderName || original.sender || 'مشترك');
    }

    const rawDisplayText = quoted.text || original?.text || '';
    const cleanDisplayText =
      rawDisplayText && !['ملصق', 'صورة', 'مقطع فيديو', 'تسجيل صوتي', 'مقطع صوتي'].includes(rawDisplayText.trim())
        ? rawDisplayText.trim()
        : '';

    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          handleJumpToMessage(quoted.id);
        }}
        className={`mb-2 p-2 rounded-lg ${
          isOutgoing
            ? 'bg-[#103e2c] hover:bg-[#0d3525] border-r-4 border-[#53bdeb]'
            : 'bg-[#1d1f1f] hover:bg-[#181a1a] border-r-4 border-[#53bdeb]'
        } flex items-center justify-between gap-2.5 cursor-pointer transition-all select-none text-right overflow-hidden group/quote shadow-xs`}
        title="انقر للانتقال إلى الرسالة المردود عليها مباشرة"
      >
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5">
            <Reply className="w-3 h-3 text-[#a5a5a5] shrink-0" />
            <span className={`text-[11.5px] font-bold truncate ${isOutgoing ? 'text-[#21c063]' : 'text-[#53bdeb]'}`}>
              {senderTitle}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[#a5a5a5] truncate mt-0.5">
            {hasMedia ? (
              <>
                {isPdf ? (
                  <>
                    <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="text-rose-300 font-medium shrink-0">مستند PDF</span>
                  </>
                ) : isDoc ? (
                  <>
                    <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="text-blue-300 font-medium shrink-0">مستند</span>
                  </>
                ) : isVideo ? (
                  <>
                    <Film className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="text-[#fafafa] font-medium shrink-0">فيديو</span>
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    {cleanDisplayText ? (
                      <span className="truncate text-[#e0e0e0]">{cleanDisplayText}</span>
                    ) : null}
                  </>
                )}
                {cleanDisplayText && isVideo && <span className="truncate text-[#a5a5a5]">- {cleanDisplayText}</span>}
              </>
            ) : (
              <span className="truncate text-[#e0e0e0]">{cleanDisplayText || 'رسالة'}</span>
            )}
          </div>
        </div>
        {hasMedia && (
          <div className="w-12 h-12 rounded-md overflow-hidden bg-[#242626] shrink-0 border border-white/10 flex flex-col items-center justify-center">
            {isPdf ? (
              <div className="flex flex-col items-center justify-center text-rose-400">
                <FileText className="w-5 h-5 mb-0.5 text-rose-500" />
                <span className="text-[9px] font-bold uppercase text-white bg-rose-600 px-1 rounded-xs leading-none">PDF</span>
              </div>
            ) : isDoc ? (
              <div className="flex flex-col items-center justify-center text-blue-400">
                <FileText className="w-5 h-5 mb-0.5 text-blue-500" />
                <span className="text-[9px] font-bold uppercase text-white bg-blue-600 px-1 rounded-xs leading-none">DOC</span>
              </div>
            ) : isVideo ? (
              <div className="flex flex-col items-center justify-center text-[#21c063]">
                <Film className="w-5 h-5" />
              </div>
            ) : quotedImg && !failedMediaIds.has(quoted.id) ? (
              <img
                src={quotedImg}
                alt="معاينة"
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover group-hover/quote:scale-110 transition-transform duration-200"
                onError={() => {
                  setFailedMediaIds((prev) => new Set(prev).add(quoted.id));
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-[#21c063] w-full h-full bg-[#182229]">
                <ImageIcon className="w-5 h-5 text-emerald-400" />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // رسم علامة حالة الإرسال والتسليم والقراءة التفاعلية لواتساب (ساعة / صح واحد / صحين رمادي / صحين أزرق)
  const handleRetryMessage = async (msg: any) => {
    try {
      toast.info('جاري إعادة إرسال الرسالة المعلقة...', 'إعادة الإرسال');
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_message', messageId: msg.id }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('تم إرسال الرسالة بنجاح عبر واتساب!', 'تم الإرسال');
        if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } else {
        toast.error(data.message || 'فشل إرسال الرسالة المعلقة', 'خطأ في الإرسال');
      }
    } catch {
      toast.error('حدث خطأ أثناء محاولة الإرسال', 'خطأ');
    }
  };

  const renderMessageStatusTicks = (msg: any, isBoth?: boolean, sizeClass: string = 'w-3.5 h-3.5') => {
    if (msg.uploadState === 'sending') {
      return <Loader2 className={`${sizeClass} animate-spin text-[#a5a5a5]`} aria-label="جارٍ إرسال الصورة" />;
    }
    if (msg.uploadState === 'failed') {
      return <AlertCircle className={`${sizeClass} text-rose-400`} aria-label="فشل إرسال الصورة" />;
    }
    if (isBoth) {
      return (
        <span title="تم استلام الحوالة ومسجلة في النظام" className="inline-flex items-center">
          <CheckCheck className={`${sizeClass} text-emerald-400 stroke-[2.5]`} />
        </span>
      );
    }

    const isOutgoing = Boolean(
      msg.isFromMe ||
      msg.sender === 'أنا' ||
      msg.senderName === 'أنا' ||
      msg.rawBaileysMessage?.key?.fromMe
    );
    if (!isOutgoing) return null;

    let status: 'pending' | 'sent' | 'delivered' | 'read' = 'sent';

    if (msg.deliveryStatus) {
      if (
        msg.deliveryStatus === 'pending' &&
        typeof msg.id === 'string' &&
        (msg.id.startsWith('3EB') || (!msg.id.startsWith('msg_real_') && !msg.id.startsWith('temp_')))
      ) {
        status = 'sent';
      } else {
        status = msg.deliveryStatus;
      }
    } else {
      const rawS = msg.rawBaileysMessage?.status;
      if (rawS !== undefined && rawS !== null) {
        if (rawS === 1 || rawS === 'PENDING' || rawS === 'pending') {
          status =
            typeof msg.id === 'string' &&
            (msg.id.startsWith('3EB') || (!msg.id.startsWith('msg_real_') && !msg.id.startsWith('temp_')))
              ? 'sent'
              : 'pending';
        } else if (rawS === 2 || rawS === 'SERVER_ACK' || rawS === 'sent') status = 'sent';
        else if (rawS === 3 || rawS === 'DELIVERY_ACK' || rawS === 'delivered') status = 'delivered';
        else if (rawS === 4 || rawS === 5 || rawS === 'READ' || rawS === 'PLAYED' || rawS === 'read' || rawS === 'played')
          status = 'read';
      } else if (msg.ack !== undefined && msg.ack !== null) {
        if (msg.ack === 0 || msg.ack === 1 || msg.ack === 'pending') {
          status =
            typeof msg.id === 'string' &&
            (msg.id.startsWith('3EB') || (!msg.id.startsWith('msg_real_') && !msg.id.startsWith('temp_')))
              ? 'sent'
              : 'pending';
        } else if (msg.ack === 2 || msg.ack === 'sent') status = 'sent';
        else if (msg.ack === 3 || msg.ack === 'delivered') status = 'delivered';
        else if (msg.ack >= 4 || msg.ack === 'read') status = 'read';
      } else if (typeof msg.id === 'string' && (msg.id.startsWith('msg_real_') || msg.id.startsWith('temp_'))) {
        status = 'pending';
      }
    }

    if (status === 'pending') {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleRetryMessage(msg);
          }}
          title="معلقة - اضغط لإعادة الإرسال فوراً"
          className="inline-flex items-center text-[#a5a5a5] hover:text-amber-400 transition-colors cursor-pointer group"
        >
          <Clock className="w-3 h-3 text-[#a5a5a5] group-hover:text-amber-400 animate-pulse" />
        </button>
      );
    }

    if (status === 'sent') {
      return (
        <span title="تم الإرسال (خرجت من عندك - صح واحد رمادي ✓)" className="inline-flex items-center text-[#a5a5a5]">
          <Check className={`${sizeClass} text-[#a5a5a5]`} />
        </span>
      );
    }

    if (status === 'delivered') {
      return (
        <span title="تم التسليم للمستلم (صحين رماديين ✓✓)" className="inline-flex items-center text-[#a5a5a5]">
          <CheckCheck className={`${sizeClass} text-[#a5a5a5]`} />
        </span>
      );
    }

    // status === 'read'
    return (
      <span title="تمت القراءة (صحين زرق ✓✓)" className="inline-flex items-center text-[#53bdeb]">
        <CheckCheck className={`${sizeClass} text-[#53bdeb]`} />
      </span>
    );
  };

  // مراجع وعناصر التمرير التلقائي لآخر رسالة
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState<boolean>(false);
  const prevMsgCountRef = useRef<number>(0);
  const markChatReadRef = useRef<(chatName?: string) => void>(() => {});

  // دالة التمرير الفوري أو السلس إلى آخر وأحدث رسالة في أسفل المحادثة ومسح الإشعار
  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    setIsAtBottom(true);
    if (activeGroup) {
      markChatReadRef.current(activeGroup);
    }
    if (messagesContainerRef.current) {
      if (behavior === 'auto') {
        // قفز فوري مباشر 100% دون أي حركة أو أنيميشن إطلاقاً
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      } else {
        // تمرير سلس فقط عند النقر على الزر العائم للنزول للأسفل
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  };

  // مراقبة التمرير بانسيابية فائقة (GPU RAF) لإظهار زر القفز السريع لآخر رسالة ومسح إشعار المحادثة الخارجي
  const scrollRafRef = useRef<number | null>(null);
  const handleMessagesScroll = () => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (!messagesContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      const atBottom = distanceFromBottom <= 80;
      const shouldShowBtn = distanceFromBottom > 160;
      setShowScrollBottomBtn((prev) => (prev !== shouldShowBtn ? shouldShowBtn : prev));
      setIsAtBottom((prev) => (prev !== atBottom ? atBottom : prev));
      if (atBottom && activeGroup) {
        markChatReadRef.current(activeGroup);
      }
    });
  };

  // التحقق مما إذا كان الملصق موجوداً في المفضلة ⭐
  const isStickerFavorited = useCallback(
    (url: string) => {
      if (!url) return false;
      const cleanUrl = url.split('?')[0];
      return favoriteStickers.some((s) => s.url === url || s.url.split('?')[0] === cleanUrl);
    },
    [favoriteStickers]
  );

  // تبديل حالة المفضلة لملصق (إضافة أو إزالة) ⭐
  const handleToggleFavoriteSticker = useCallback(
    async (url: string, title?: string) => {
      if (!url) return;
      const cleanUrl = url.split('?')[0];
      const isFav = favoriteStickers.some((s) => s.url === url || s.url.split('?')[0] === cleanUrl);

      if (isFav) {
        setFavoriteStickers((prev) => prev.filter((s) => s.url !== url && s.url.split('?')[0] !== cleanUrl));
        toast.info('تمت إزالة الملصق من المفضلة ⭐', 'الملصقات المفضلة');
        try {
          await fetch('/api/whatsapp/stickers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'unfavorite', stickerUrl: url }),
          });
        } catch (e) {}
      } else {
        const newStk: WhatsAppSticker = {
          id: `fav_${Date.now()}`,
          url,
          title: title || 'ملصق محادثة',
          packId: 'favorites',
        };
        setFavoriteStickers((prev) => [newStk, ...prev]);
        toast.success('تمت إضافة الملصق إلى المفضلة بنجاح ⭐', 'الملصقات المفضلة');
        try {
          await fetch('/api/whatsapp/stickers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'favorite', sticker: newStk }),
          });
        } catch (e) {}
      }
    },
    [favoriteStickers]
  );

  // إرسال الملصق فورياً للمحادثة النشطة عبر واتساب
  const handleSendStickerDirect = useCallback(
    async (stickerUrl: string) => {
      if (!stickerUrl || !activeGroup) return;

      // إضافة للملصقات الأخيرة
      setRecentStickers((prev) => {
        const updated = [stickerUrl, ...prev.filter((u) => u !== stickerUrl)].slice(0, 30);
        try {
          localStorage.setItem('hawalat_recent_stickers', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      setIsStickerPickerOpen(false);

      const targetGroup = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
      const targetChatJid = targetGroup?.id || messages.find((m) => (m.chatName === activeGroup || m.senderName === activeGroup) && m.chatJid)?.chatJid || activeGroup;

      try {
        const res = await fetch('/api/whatsapp/stickers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send',
            chat: targetChatJid,
            stickerUrl,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          toast.success('تم إرسال الملصق عبر واتساب بنجاح', 'ملصق واتساب');
          setTimeout(() => scrollToBottom('smooth'), 150);
        } else {
          toast.error(data.error || data.message || 'تعذر إرسال الملصق عبر واتساب', 'فشل الإرسال');
        }
      } catch (e: any) {
        toast.error(`خطأ أثناء إرسال الملصق: ${e.message}`, 'فشل الإرسال');
      }
    },
    [activeGroup, realGroups, messages, scrollToBottom]
  );

  // إدراج إيموجي عند مؤشر الكتابة في حقل الرسالة
  const handleInsertEmoji = (emoji: string) => {
    const input = messageInputRef.current;
    const currentText = getMessageText();
    const caret = input?.selectionStart ?? currentText.length;
    const nextText = currentText.slice(0, caret) + emoji + currentText.slice(caret);
    setMessageText(nextText);
    setHasMessageText(true);
    requestAnimationFrame(() => {
      const pos = caret + emoji.length;
      input?.focus();
      input?.setSelectionRange(pos, pos);
    });
  };

  const handleRetryDownloadMedia = async (msgId: string, isManual: boolean = true) => {
    setDownloadingMediaIds((prev) => [...prev, msgId]);
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'download_media', id: msgId }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.mediaUrl) {
        setFailedMediaIds((prev) => {
          const next = new Set(prev);
          next.delete(msgId);
          return next;
        });
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, mediaUrl: data.mediaUrl } : m))
        );
        if (isManual) {
          toast.success('تم تنزيل الصورة بنجاح.', 'تنزيل الوسائط');
        }
      } else {
        // تسجيل المعرّف كفاشل حتى لا تستمر محاولات التنزيل التلقائية في الخلفية
        setFailedMediaIds((prev) => new Set(prev).add(msgId));
        if (isManual) {
          toast.warning(data.message || 'تعذر تنزيل الصورة من واتساب حالياً.', 'تنزيل الوسائط');
        }
      }
    } catch (e: any) {
      setFailedMediaIds((prev) => new Set(prev).add(msgId));
      if (isManual) {
        toast.error(`خطأ: ${e.message}`, 'تنزيل الوسائط');
      }
    } finally {
      setDownloadingMediaIds((prev) => prev.filter((id) => id !== msgId));
    }
  };

  // إغلاق القوائم السياقية والمنسدلة ومنتقي التفاعل عند النقر خارجها أو الضغط على زر Escape
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // إذا كان النقر داخل القائمة السياقية أو منتقي التفاعل أو القائمة المنسدلة أو منتقي الإيموجي الشامل، لا نغلقها هنا
      if (
        target?.closest('[data-context-menu]') ||
        target?.closest('[data-reaction-picker]') ||
        target?.closest('[data-dropdown-menu]') ||
        target?.closest('[data-full-emoji-picker]') ||
        target?.closest('[data-quick-replies-menu]') ||
        target?.closest('[data-quick-replies-trigger]')
      ) {
        if (e.type === 'contextmenu') {
          e.preventDefault();
        }
        return;
      }
      if (e.type === 'contextmenu' && (contextMenu || chatAreaContextMenu)) {
        e.preventDefault();
      }
      closeAllPopups();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxState) {
        if (e.key === 'Escape') {
          closeLightbox();
          return;
        }
        if (e.key === 'ArrowRight') {
          handleNavigateLightbox('next');
          return;
        }
        if (e.key === 'ArrowLeft') {
          handleNavigateLightbox('prev');
          return;
        }
      }

      if (e.key === 'Escape') {
        if (
          contextMenu ||
          chatAreaContextMenu ||
          bulkForwardDropdownOpen ||
          dropdownOpenId ||
          isSelectionMode ||
          reactionPickerMsgId ||
          selectedReactionMsg ||
          fullEmojiPickerMsg
        ) {
          closeAllPopups();
          setIsSelectionMode(false);
          setSelectedMsgIds([]);
          setSelectedReactionMsg(null);
        } else {
          setActiveGroup('');
        }
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('contextmenu', handleGlobalClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('contextmenu', handleGlobalClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    contextMenu,
    chatAreaContextMenu,
    bulkForwardDropdownOpen,
    dropdownOpenId,
    isSelectionMode,
    reactionPickerMsgId,
    selectedReactionMsg,
    fullEmojiPickerMsg,
    lightboxState,
    currentChatMediaMessages,
  ]);

  // منع تمرير الصفحة أو المحادثة في الخلفية تماماً طالما القائمة السياقية مفتوحة
  useEffect(() => {
    if (!contextMenu && !chatAreaContextMenu) return;

    const handleWheelBlock = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      // السماح بالتمرير فقط داخل محتوى القائمة السياقية نفسها
      if (target?.closest('[data-context-menu]')) {
        return;
      }
      e.preventDefault();
    };

    const handleTouchBlock = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-context-menu]')) {
        return;
      }
      e.preventDefault();
    };

    window.addEventListener('wheel', handleWheelBlock, { passive: false });
    window.addEventListener('touchmove', handleTouchBlock, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleWheelBlock);
      window.removeEventListener('touchmove', handleTouchBlock);
    };
  }, [contextMenu, chatAreaContextMenu]);

  // استرجاع الحالات المحفوظة وروابط الإيصالات من التخزين المحلي
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hawalat_msg_status');
      if (saved) {
        setActionStatus(JSON.parse(saved));
      }
      const savedLinks = localStorage.getItem('hawalat_linked_receipts');
      if (savedLinks) {
        setLinkedReceipts(JSON.parse(savedLinks));
      }
    } catch (e) {}
  }, []);

  // مزامنة أي صور مشبوكة محفوظة في سجل رسائل السيرفر تلقائياً
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    setLinkedReceipts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const m of messages) {
        const linkUrl = m.linkedReceiptUrl || m.status?.linkedImageUrl;
        if (linkUrl && (!next[m.id] || next[m.id].receiptUrl !== linkUrl)) {
          next[m.id] = {
            receiptUrl: linkUrl,
            linkedMsgId: m.linkedMsgId || m.status?.linkedMsgId,
            timestamp: m.timestamp || new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          };
          changed = true;
        }
      }
      if (changed) {
        try {
          localStorage.setItem('hawalat_linked_receipts', JSON.stringify(next));
        } catch (e) {}
        return next;
      }
      return prev;
    });
  }, [messages]);

  // مزامنة حالة الرسائل (مثل تم الاستلام أو الاعتماد) القادمة من السيرفر أو حسابات أخرى
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    setActionStatus((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const m of messages) {
        if (m.status && Object.keys(m.status).length > 0) {
          const st = m.status as Record<string, any>;
          const current = (next[m.id] || {}) as Record<string, any>;
          let needsUpdate = false;
          for (const k in st) {
            if (st[k] !== undefined && current[k] !== st[k]) {
              needsUpdate = true;
              break;
            }
          }
          if (needsUpdate) {
            next[m.id] = { ...current, ...m.status };
            changed = true;
          }
        }
      }
      if (changed) {
        try {
          localStorage.setItem('hawalat_msg_status', JSON.stringify(next));
        } catch (e) {}
        return next;
      }
      return prev;
    });
  }, [messages]);

  const updateStatus = useCallback(async (msgId: string, updates: any) => {
    setActionStatus((prev) => {
      const updated = {
        ...prev,
        [msgId]: { ...(prev[msgId] || {}), ...updates },
      };
      try {
        localStorage.setItem('hawalat_msg_status', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    try {
      await fetch('/api/whatsapp/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: msgId, updates }),
      });
    } catch (e) {}
  }, []);

  const handleLinkReceipt = useCallback((transferMsgId: string, receiptUrl: string, receiptMsgId?: string) => {
    setLinkedReceipts((prev) => {
      const updated = {
        ...prev,
        [transferMsgId]: {
          receiptUrl,
          linkedMsgId: receiptMsgId,
          timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        },
      };
      try {
        localStorage.setItem('hawalat_linked_receipts', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    updateStatus(transferMsgId, {
      linkedImageUrl: receiptUrl,
      linkedReceiptUrl: receiptUrl,
      linkedMsgId: receiptMsgId,
      autoLinkSuppressed: false,
    });
  }, [updateStatus]);

  const handleUnlinkReceipt = (transferMsgId: string) => {
    setLinkedReceipts((prev) => {
      const updated = { ...prev };
      delete updated[transferMsgId];
      try {
        localStorage.setItem('hawalat_linked_receipts', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    updateStatus(transferMsgId, {
      linkedImageUrl: null,
      linkedReceiptUrl: null,
      linkedMsgId: null,
      autoLinkSuppressed: true,
    });
    toast.info('تم فك شبك صورة الوصل عن الحوالة.', 'فك الشبك');
  };

  useEffect(() => {
    if (!messages.length) return;
    const byId = new Map(messages.map((message) => [message.id, message]));
    for (const message of messages) {
      const quotedId = message.quotedMessage?.id;
      if (!quotedId || message.isDeleted || message.uploadState || message.mediaUrl ||
          linkedReceipts[message.id] || message.linkedReceiptUrl || message.status?.linkedImageUrl ||
          message.status?.autoLinkSuppressed || actionStatus[message.id]?.autoLinkSuppressed) continue;
      const quoted = byId.get(quotedId);
      if (quoted?.chatJid && message.chatJid && quoted.chatJid !== message.chatJid) continue;
      if (quoted?.mediaType && quoted.mediaType !== 'image' && quoted.mediaType !== 'document') continue;
      const receiptUrl = quoted?.mediaUrl || message.quotedMessage?.mediaUrl;
      if (!receiptUrl || (quoted?.mediaType === 'document' && !/\.pdf(?:$|[?#])/i.test(receiptUrl))) continue;
      if (!quoted?.mediaType && !/\.(?:jpe?g|png|webp|heic|pdf)(?:$|[?#])/i.test(receiptUrl)) continue;
      const parsed = getCachedParsedTransfer(message.text, message);
      if (!parsed.participantName || !parsed.email) continue;
      handleLinkReceipt(message.id, receiptUrl, quotedId);
    }
  }, [messages, linkedReceipts, actionStatus, handleLinkReceipt]);

  const handleResetMessageStatus = (msgId: string) => {
    setActionStatus((prev) => {
      const updated = { ...prev };
      delete updated[msgId];
      try {
        localStorage.setItem('hawalat_msg_status', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    toast.info('تم فك القفل وإعادة تعيين حالة الحوالة بنجاح، يمكنك الآن تسجيلها مجدداً.', 'فك القفل');
  };

  const fetchAirtableRecords = useCallback(async () => {
    try {
      const res = await fetch('/api/transfers/airtable?registration=1');
      if (res.ok) {
        const data = await res.json();
        const registrationRecords = data.registrationRecords || data.records;
        if (Array.isArray(registrationRecords)) {
          setAirtableRecords(registrationRecords);
          void fetch('/api/whatsapp/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'sync_airtable_likes' }),
          }).catch((error) => console.warn('تعذر مزامنة تفاعلات أيرتيبل:', error));
        }
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    let lastRefreshAt = 0;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastRefreshAt < 6 * 60 * 60_000) return;
      lastRefreshAt = Date.now();
      void fetchAirtableRecords();
    };
    refreshWhenVisible();
    const interval = setInterval(refreshWhenVisible, 6 * 60 * 60_000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [fetchAirtableRecords]);

  const syncWithAirtable = async (msgs: any[]) => {
    try {
      const res = await fetch('/api/transfers/airtable?registration=1');
      if (res.ok) {
        const data = await res.json();
        const registrationRecords = data.registrationRecords || data.records;
        if (Array.isArray(registrationRecords)) {
          setAirtableRecords(registrationRecords);
          const airtableNames = new Set(
            registrationRecords
              .map((r: any) => (r.fields?.['اسم المشترك'] || '').trim().toLowerCase())
              .filter(Boolean)
          );
          const airtableEmails = new Set(
            registrationRecords
              .map((r: any) => (r.fields?.['بريد الاكتروني'] || r.fields?.['البريد الالكتروني'] || r.fields?.['Email'] || '').trim().toLowerCase())
              .filter(Boolean)
          );
          const updates: Record<string, { airtable: boolean; registered?: boolean }> = {};

          for (const m of msgs) {
            // تخطي سريع للرسائل القصيرة جداً أو التي لا تحتوي على أي نص
            if (!m.text || m.text.length < 5) continue;
            const parsed = getCachedParsedTransfer(m.text, m);
            const cleanName = (parsed.participantName || '').trim().toLowerCase();
            let cleanEmail = (parsed.email || '').trim().toLowerCase();
            if (!cleanEmail && m.text) {
              const emailRegexMatch = m.text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
              if (emailRegexMatch) {
                cleanEmail = emailRegexMatch[0].trim().toLowerCase();
              }
            }

            // مطابقة حصرية: بالبريد الإلكتروني أو باسم المشترك فقط (تكرار رقم الحوالة مسموح تماماً ولا يمنع التسجيل)
            const nameMatch = Boolean(cleanName && airtableNames.has(cleanName));
            const emailMatch = Boolean(cleanEmail && airtableEmails.has(cleanEmail));

            if (nameMatch || emailMatch) {
              updates[m.id] = { airtable: true, registered: true };
            } else {
              // إلغاء وسم أيرتيبل إذا كانت الرسالة غير مطابقة بالاسم أو بالإيميل (لإزالة أي وسم خاطئ نشأ عن تطابق رقم الحوالة المشترك)
              updates[m.id] = { airtable: false };
            }
          }

          setActionStatus((prev) => {
            const merged = { ...prev };
            let hasChanged = false;

            for (const [id, val] of Object.entries(updates)) {
              const current = merged[id] || {};
              if (val.airtable === false) {
                if (current.airtable) {
                  hasChanged = true;
                  merged[id] = {
                    ...current,
                    airtable: false,
                    registered: Boolean(current.forwardedTo === 'حوالات تم رفعها'),
                  };
                }
              } else if (val.airtable === true) {
                if (!current.airtable) {
                  hasChanged = true;
                  merged[id] = { ...current, ...val };
                }
              }
            }

            if (hasChanged) {
              try {
                localStorage.setItem('hawalat_msg_status', JSON.stringify(merged));
              } catch (e) {}
              return merged;
            }
            return prev;
          });
        }
      }
    } catch (e) {}
  };

  const mergeMessages = (incoming: any[]) => {
    setMessages((prev) => {
      if (incoming.length === 0) return prev;
      const byId = new Map<string, any>(prev.map((message) => [message.id, message]));
      for (const message of incoming) byId.set(message.id, message);
      return Array.from(byId.values()).sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
    });
  };

  const fetchMessages = async (skipAirtableSync = false, sinceMs?: number, overview = false) => {
    try {
      const url = overview ? '/api/whatsapp/messages?overview=true' :
        sinceMs ? `/api/whatsapp/messages?since=${Math.max(1, Math.floor(sinceMs))}` : '/api/whatsapp/messages';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.messages) {
          if (data.partial) {
            mergeMessages(data.messages);
          } else {
            setMessages(data.messages);
            lastFullMessageSyncAtRef.current = Date.now();
            if (!skipAirtableSync) syncWithAirtable(data.messages);
          }
          if (Number.isFinite(data.snapshotAt)) {
            lastMessageSnapshotAtRef.current = Math.max(lastMessageSnapshotAtRef.current, data.snapshotAt);
          }
        }
        if (data.groups && Array.isArray(data.groups)) {
          setRealGroups(data.groups);
          setArchivedChatKeys((prev) => {
            let hasChanges = false;
            const next = new Set(prev);
            for (const g of data.groups) {
              if (g.archived) {
                if (g.id && !next.has(g.id)) { next.add(g.id); hasChanges = true; }
                if (g.name && !next.has(g.name)) { next.add(g.name); hasChanges = true; }
              } else if (g.archived === false) {
                if (g.id && next.has(g.id)) { next.delete(g.id); hasChanges = true; }
                if (g.name && next.has(g.name)) { next.delete(g.name); hasChanges = true; }
              }
            }
            return hasChanges ? next : prev;
          });
        }
      }
    } catch (e) {
      // تجاهل
    }
  };

  const fetchWaStatus = async () => {
    try {
      const eventVersion = statusEventVersionRef.current;
      const res = await fetch('/api/whatsapp/status');
      if (res.ok) {
        const data = await res.json();
        // تحديث الحالة فقط إذا تغيّرت (تفادي إعادة رسم الشاشة كاملة بلا داعٍ)
        if (statusEventVersionRef.current === eventVersion) {
          setWaStatus((prev: any) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
        }
      }
    } catch (e) {}
  };

  const handleQuickReconnect = async () => {
    try {
      toast.info('جاري إعادة الاتصال بجلسة واتساب...', 'إعادة الاتصال');
      setWaStatus((prev: any) => ({ ...prev, status: 'CONNECTING' }));
      await fetch('/api/whatsapp/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' }),
      });
      setTimeout(fetchWaStatus, 2000);
    } catch (e: any) {
      toast.error('تعذر إعادة الاتصال: ' + e.message, 'خطأ');
    }
  };

  // تدفق الأحداث المباشر واللحظي عبر Server-Sent Events (SSE)
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isSubscribed = true;
    let lastResumeAt = Date.now();
    let lastAutoReconnectAt = 0;
    let fullRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    let initialFullLoadTimer: ReturnType<typeof setTimeout> | null = null;

    const closeSSE = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      es?.close();
      es = null;
    };

    const refreshStatusAndMaybeReconnect = async () => {
      if (!isSubscribed || document.hidden) return;
      try {
        const eventVersion = statusEventVersionRef.current;
        const response = await fetch('/api/whatsapp/status', { cache: 'no-store' });
        if (!response.ok || !isSubscribed) return;
        const status = await response.json();
        const hasNewerEvent = statusEventVersionRef.current !== eventVersion;
        if (!hasNewerEvent) setWaStatus(status);
        const isStillDisconnected = !hasNewerEvent || liveConnectionStatusRef.current === 'DISCONNECTED';
        if (isStillDisconnected && status.status === 'DISCONNECTED' && status.hasCreds && Date.now() - lastAutoReconnectAt > 60_000) {
          lastAutoReconnectAt = Date.now();
          const reconnectResponse = await fetch('/api/whatsapp/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'connect' }),
          });
          if (reconnectResponse.ok) setTimeout(fetchWaStatus, 2500);
        }
      } catch {
        // A later online/focus event will retry when the network becomes available.
      }
    };

    const refreshAfterResume = () => {
      if (!isSubscribed || document.hidden) return;
      // Android suspends the PWA's network stream while it is in the background.
      // Reload the server snapshot so messages received meanwhile appear immediately.
      const snapshotAt = lastMessageSnapshotAtRef.current;
      void fetchMessages(true, snapshotAt ? Math.max(1, snapshotAt - 5 * 60_000) : undefined);
      if (Date.now() - lastFullMessageSyncAtRef.current > 10 * 60_000) {
        if (fullRefreshTimer) clearTimeout(fullRefreshTimer);
        fullRefreshTimer = setTimeout(() => {
          if (isSubscribed && !document.hidden) void fetchMessages(true);
        }, 15_000);
      }
      void refreshStatusAndMaybeReconnect();
    };

    const connectSSE = () => {
      if (!isSubscribed || document.hidden) return;
      closeSSE();
      try {
        es = new EventSource('/api/whatsapp/events');

        es.addEventListener('init', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data.status) {
              statusEventVersionRef.current += 1;
              liveConnectionStatusRef.current = data.status.status;
              setWaStatus((prev) => ({ ...prev, ...data.status }));
            }
          } catch {}
        });

        es.addEventListener('message', (e: MessageEvent) => {
          try {
            const newMsg = JSON.parse(e.data);
            if (!newMsg || !newMsg.id) return;

            setMessages((prev) => {
              const existingIdx = prev.findIndex(
                (m) =>
                  m.id === newMsg.id ||
                  (m.rawBaileysMessage?.key?.id && m.rawBaileysMessage.key.id === newMsg.id)
              );
              if (existingIdx !== -1) {
                const updated = [...prev];
                updated[existingIdx] = { ...updated[existingIdx], ...newMsg };
                return updated;
              }
              return [newMsg, ...prev];
            });

            // تمرير فوري لأسفل المحادثة إذا كانت الرسالة واردة للمحادثة المفتوحة حالياً
            const currentActive = activeGroupRef.current;
            if (currentActive && (newMsg.chatName === currentActive || newMsg.chatJid === currentActive)) {
              setTimeout(() => scrollToBottom('smooth'), 40);
            } else if (!newMsg.isFromMe) {
              // إذا كانت الرسالة لمحادثة أخرى غير المفتوحة، إزالة المحادثة من المقروء لتظهر شارة الإشعار الجديدة
              const targetChat = newMsg.chatName || newMsg.chatJid;
              if (targetChat) {
                setReadChatKeys((prev) => {
                  const next = new Set(prev);
                  next.delete(targetChat);
                  if (newMsg.chatJid) next.delete(newMsg.chatJid);
                  if (newMsg.chatName) next.delete(newMsg.chatName);
                  return next;
                });
              }
            }
          } catch (err) {
            console.error('[SSE message parse error]', err);
          }
        });

        es.addEventListener('receipt', (e: MessageEvent) => {
          try {
            const { messageId, status } = JSON.parse(e.data);
            // تحديث نافذة "معلومات الرسالة" فوراً إن كانت مفتوحة على نفس الرسالة
            if (messageId && messageInfoIdRef.current === messageId) {
              fetchMessageInfo(messageId);
            }
            if (!messageId || !status) return;

            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId || m.rawBaileysMessage?.key?.id === messageId
                  ? { ...m, deliveryStatus: status }
                  : m
              )
            );
          } catch {}
        });

        es.addEventListener('reaction', (e: MessageEvent) => {
          try {
            const { messageId, reactions } = JSON.parse(e.data);
            if (!messageId) return;

            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId || m.rawBaileysMessage?.key?.id === messageId
                  ? { ...m, reactions }
                  : m
              )
            );
          } catch {}
        });

        es.addEventListener('media', (e: MessageEvent) => {
          try {
            const { id, mediaUrl, mediaType, mediaDuration } = JSON.parse(e.data);
            if (!id || !mediaUrl) return;

            setFailedMediaIds((prev) => {
              if (!prev.has(id)) return prev;
              const next = new Set(prev);
              next.delete(id);
              return next;
            });

            setMessages((prev) =>
              prev.map((m) =>
                m.id === id
                  ? {
                      ...m,
                      mediaUrl,
                      mediaType: mediaType || m.mediaType,
                      mediaDuration: mediaDuration || m.mediaDuration,
                    }
                  : m
              )
            );
          } catch {}
        });

        es.addEventListener('message_update', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            const { messageId, id: altId, text, originalText, isEdited, editedAt, isDeleted, deletedAt, linkedReceiptUrl, linkedMsgId, status, updates } = data;
            const targetId = messageId || altId;
            if (!targetId) return;

            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === targetId || m.rawBaileysMessage?.key?.id === targetId) {
                  return {
                    ...m,
                    text: text !== undefined ? text : m.text,
                    originalText: originalText !== undefined ? originalText : m.originalText,
                    isEdited: isEdited !== undefined ? isEdited : m.isEdited,
                    editedAt: editedAt !== undefined ? editedAt : m.editedAt,
                    isDeleted: isDeleted !== undefined ? isDeleted : m.isDeleted,
                    deletedAt: deletedAt !== undefined ? deletedAt : m.deletedAt,
                    linkedReceiptUrl: linkedReceiptUrl !== undefined ? (linkedReceiptUrl || undefined) : m.linkedReceiptUrl,
                    linkedMsgId: linkedMsgId !== undefined ? (linkedMsgId || undefined) : m.linkedMsgId,
                    status: (updates || status) ? { ...(m.status || {}), ...(updates || status) } : m.status,
                  };
                }
                return m;
              })
            );

            // تحديث حالة الشبك المشتركة محلياً فوراً
            if (linkedReceiptUrl !== undefined) {
              setLinkedReceipts((prev) => {
                const next = { ...prev };
                if (linkedReceiptUrl) {
                  next[targetId] = {
                    receiptUrl: linkedReceiptUrl,
                    linkedMsgId,
                    timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
                  };
                } else {
                  delete next[targetId];
                }
                try {
                  localStorage.setItem('hawalat_linked_receipts', JSON.stringify(next));
                } catch (e) {}
                return next;
              });
            }

            // تحديث حالة الاستلام المشتركة محلياً فوراً
            if (updates || status) {
              const st = updates || status;
              setActionStatus((prev) => {
                const next = {
                  ...prev,
                  [targetId]: { ...(prev[targetId] || {}), ...st },
                };
                try {
                  localStorage.setItem('hawalat_msg_status', JSON.stringify(next));
                } catch (e) {}
                return next;
              });
            }
          } catch {}
        });

        es.addEventListener('status', (e: MessageEvent) => {
          try {
            const status = JSON.parse(e.data);
            if (status) {
              statusEventVersionRef.current += 1;
              liveConnectionStatusRef.current = status.status;
              setWaStatus((prev) => ({ ...prev, ...status }));
            }
          } catch {}
        });

        es.addEventListener('groups', (e: MessageEvent) => {
          try {
            const groups = JSON.parse(e.data);
            if (Array.isArray(groups)) {
              setRealGroups(groups);
              setArchivedChatKeys((prev) => {
                let hasChanges = false;
                const next = new Set(prev);
                for (const g of groups) {
                  if (g.archived) {
                    if (g.id && !next.has(g.id)) { next.add(g.id); hasChanges = true; }
                    if (g.name && !next.has(g.name)) { next.add(g.name); hasChanges = true; }
                  } else if (g.archived === false) {
                    if (g.id && next.has(g.id)) { next.delete(g.id); hasChanges = true; }
                    if (g.name && next.has(g.name)) { next.delete(g.name); hasChanges = true; }
                  }
                }
                return hasChanges ? next : prev;
              });
            }
          } catch {}
        });

        es.addEventListener('presence', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data?.jid && Array.isArray(data.presences)) {
              setPresenceByJid((current) => ({ ...current, [data.jid]: data.presences }));
              if (data.presences.length > 0) setPresenceLoadingJid((current) => current === data.jid ? null : current);
              setPresenceNow(Date.now());
            }
          } catch {}
        });

        es.onerror = () => {
          closeSSE();
          if (isSubscribed && !document.hidden) {
            reconnectTimer = setTimeout(connectSSE, 4000);
          }
        };
      } catch {
        if (isSubscribed && !document.hidden) {
          reconnectTimer = setTimeout(connectSSE, 4000);
        }
      }
    };

    connectSSE();
    void refreshStatusAndMaybeReconnect();
    // Populate the list first. On mobile, leave the network free for the chat the user opens
    // before requesting the much larger complete archive in the background.
    void (async () => {
      await fetchMessages(true, undefined, true);
      if (!isSubscribed) return;
      const mobile = window.matchMedia('(max-width: 767px)').matches;
      initialFullLoadTimer = setTimeout(() => {
        if (isSubscribed && !document.hidden) void fetchMessages();
      }, mobile ? 20_000 : 0);
    })();

    const onResume = () => {
      if (document.hidden || Date.now() - lastResumeAt < 1500) return;
      lastResumeAt = Date.now();
      connectSSE();
      refreshAfterResume();
    };
    const onVisibilityChange = () => {
      if (document.hidden) closeSSE();
      else {
        // Even a very short background trip needs a fresh stream.
        lastResumeAt = 0;
        onResume();
      }
    };
    const onOnline = () => {
      lastResumeAt = 0;
      onResume();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) onResume();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onResume);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);

    // فحص احتياطي بطيء كل 60 ثانية فقط في حال انقطع اتصال SSE وكان التبويب نشطاً
    const fallbackInterval = setInterval(() => {
      if (!es && typeof document !== 'undefined' && !document.hidden) {
        fetchMessages();
        fetchWaStatus();
      }
    }, 60000);

    return () => {
      isSubscribed = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onResume);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
      clearInterval(fallbackInterval);
      if (fullRefreshTimer) clearTimeout(fullRefreshTimer);
      if (initialFullLoadTimer) clearTimeout(initialFullLoadTimer);
      closeSSE();
    };
  }, []);

  const handleClearDemoMessages = async () => {
    setIsClearingDemo(true);
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_demo' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessages(data.messages || []);
        fetchWaStatus();
        toast.success(data.message || 'تم حذف الرسائل التجريبية بنجاح.', 'تنظيف البيانات');
      } else {
        toast.error(data.error || 'تعذر إزالة البيانات التجريبية.', 'خطأ في التنظيف');
      }
    } catch (e: any) {
      toast.error(`خطأ: ${e.message}`, 'خطأ في الاتصال');
    } finally {
      setIsClearingDemo(false);
    }
  };

  const handleSyncChats = async () => {
    setIsSyncingChats(true);
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.groups) setRealGroups(data.groups);
        await fetchMessages();
        await fetchWaStatus();
        if (data.archiveSyncError) {
          toast.error(`تحدّثت المحادثات، لكن تعذّرت مزامنة الأرشيف: ${data.archiveSyncError}`, 'أرشيف واتساب');
        } else if (data.archiveSyncStatus === 'snapshot-done:0' && !data.groups?.some((group: any) => group.archived)) {
          toast.info('تحدّثت المحادثات، لكن اتصال واتساب لم يرجع حالة أي محادثة مؤرشفة لهذا الحساب.', 'أرشيف واتساب');
        } else {
          toast.success(`تم تحديث ${data.groups?.length || 0} محادثة ومجموعة من واتساب.`, 'مزامنة المحادثات');
        }
      } else {
        toast.error(data.error || 'تعذر مزامنة المجموعات.', 'خطأ في المزامنة');
      }
    } catch (e: any) {
      toast.error(`خطأ: ${e.message}`, 'خطأ في المزامنة');
    } finally {
      setIsSyncingChats(false);
    }
  };

  const handleToggleReceived = async (msg: any) => {
    const st = { ...msg.status, ...(actionStatus[msg.id] || {}) };
    const nextReceived = !st.isReceived;
    await updateStatus(msg.id, {
      isReceived: nextReceived,
      forwardedTo: nextReceived ? 'تم الاستلام' : (st.forwardedTo?.includes('استلام') ? undefined : st.forwardedTo),
    });
  };

  const handleToggleReceivedForSelected = async () => {
    if (selectedMsgIds.length === 0) return;
    const targetMsgs = activeGroupMessages.filter((m) => selectedMsgIds.includes(m.id));
    if (targetMsgs.length === 0) return;

    // فحص ما إذا كانت كافة الرسائل محددة كمستلمة حالياً
    const allReceived = targetMsgs.every((m) => {
      const st = { ...m.status, ...(actionStatus[m.id] || {}) };
      return Boolean(st.isReceived || st.forwardedTo?.includes('استلام'));
    });

    const nextReceived = !allReceived;
    for (const m of targetMsgs) {
      const st = { ...m.status, ...(actionStatus[m.id] || {}) };
      await updateStatus(m.id, {
        isReceived: nextReceived,
        forwardedTo: nextReceived ? 'تم الاستلام' : (st.forwardedTo?.includes('استلام') ? undefined : st.forwardedTo),
      });
    }

    setIsSelectionMode(false);
    setSelectedMsgIds([]);
    if (nextReceived) {
      toast.success(`تم تحديد (${targetMsgs.length}) رسائل كـ تم الاستلام بنجاح.`, 'تم الاستلام');
    } else {
      toast.info(`تم إلغاء وسم تم الاستلام عن (${targetMsgs.length}) رسائل.`, 'إلغاء الاستلام');
    }
  };

  const isOutgoingMessage = (msg: any) =>
    Boolean(msg?.isFromMe || msg?.sender === 'أنا' || msg?.senderName === 'أنا' || msg?.rawBaileysMessage?.key?.fromMe);

  const openMessageInfo = (msg: any) => {
    messageInfoIdRef.current = msg.id;
    setMessageInfo({ msg, chatKey: activeGroup, data: null, loading: true });
    fetchMessageInfo(msg.id);
  };

  const closeMessageInfo = () => {
    messageInfoIdRef.current = null;
    setMessageInfo(null);
  };

  // تنسيق الوقت مثل واتساب: "اليوم الساعة 9:29 م" / "أمس الساعة ..."
  const formatInfoTime = (ms?: number) => {
    if (!ms) return 'الوقت غير متوفر';
    const d = new Date(ms);
    const time = d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
    if (diffDays === 0) return `اليوم الساعة ${time}`;
    if (diffDays === 1) return `أمس الساعة ${time}`;
    return `${d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })} الساعة ${time}`;
  };

  // ===== الجوال: ضغط مطوّل على الرسالة = قائمة الخيارات، سحب لليمين = رد =====
  const openMobileSheet = (msg: any, isTransfer: boolean) => {
    closeAllPopups();
    mobileSheetOpenedAtRef.current = Date.now();
    setMobileSheet({ msg, isTransfer });
  };

  const closeMobileSheet = () => setMobileSheet(null);

  // النقر على الخلفية يغلق القائمة، مع تجاهل النقرة الناتجة عن رفع الإصبع مباشرة بعد الضغط المطوّل
  const handleMobileSheetBackdropClick = () => {
    if (Date.now() - mobileSheetOpenedAtRef.current > 400) closeMobileSheet();
  };

  const SWIPE_REPLY_PX = 60;

  const handleMsgTouchStart = (e: React.TouchEvent<HTMLElement>, msg: any, isTransfer: boolean) => {
    if (e.touches.length !== 1 || isSelectionMode) return;
    const t = e.touches[0];
    const el = e.currentTarget;
    const timer = setTimeout(() => {
      navigator.vibrate?.(25);
      closeAllPopups();
      setIsSelectionMode(true);
      setSelectedMsgIds((prev) => (prev.includes(msg.id) ? prev : [...prev, msg.id]));
    }, 400);
    msgTouchRef.current = { x: t.clientX, y: t.clientY, timer, el, msg, isTransfer, swiping: false };
  };

  // تحريك الفقاعة مباشرة عبر الـ DOM (بدون state) حتى يبقى السحب سلساً
  const handleMsgTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    const s = msgTouchRef.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (!s.swiping) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(s.timer);
      if (dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) s.swiping = true;
      else return;
    }
    s.el.style.transition = 'none';
    s.el.style.transform = `translateX(${Math.min(Math.max(dx, 0), 90)}px)`;
  };

  const handleMsgTouchEnd = () => {
    const s = msgTouchRef.current;
    if (!s) return;
    clearTimeout(s.timer);
    if (s.swiping) {
      const shift = parseFloat(s.el.style.transform.replace(/[^\d.]/g, '')) || 0;
      s.el.style.transition = 'transform 150ms ease-out';
      s.el.style.transform = '';
      if (shift >= SWIPE_REPLY_PX) {
        navigator.vibrate?.(10);
        handleStartReply(s.msg);
      }
    }
    msgTouchRef.current = null;
  };

  // خصائص اللمس التي تُضاف لفقاعة كل رسالة
  const getMsgTouchProps = (msg: any, isTransfer: boolean) => ({
    onTouchStart: (e: React.TouchEvent<HTMLElement>) => handleMsgTouchStart(e, msg, isTransfer),
    onTouchMove: handleMsgTouchMove,
    onTouchEnd: handleMsgTouchEnd,
    onTouchCancel: handleMsgTouchEnd,
  });

  // تسجيل شامل من الجوال: فتح البوابة + الحفظ في أيرتيبل معاً
  const handleMobileRegisterBoth = async (msg: any) => {
    // فتح البوابة أولاً ضمن نفس الضغطة حتى لا يمنع المتصفح النافذة الجديدة
    await handleOpenPortalWithAutoFill(msg);
    await handleDirectAirtableSubmit(msg);
  };

  // دالة ضبط موضع القائمة السياقية للرسالة بحيث تمنع تماماً أي خروج أو اقتطاع من الأعلى أو الأسفل مع إخفاء شريط التمرير
  const contextMenuRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (!node || !contextMenu) return;
    const rect = node.getBoundingClientRect();
    const w = rect.width || 256;
    // مساحة آمنة ومريحة تضمن بقاء القائمة بالكامل داخل الشاشة بدون اقتطاع علوي أو سفلي
    const maxAvailableH = Math.min(420, window.innerHeight - 50);
    const h = Math.min(rect.height || 420, maxAvailableH);

    // حساب دقيق: يمنع نزول القائمة تحت أسفل الشاشة، ويمنع تماماً خروجها فوق أعلى الشاشة
    const posX = Math.max(12, Math.min(contextMenu.x, window.innerWidth - w - 12));
    const posY = Math.max(16, Math.min(contextMenu.y, window.innerHeight - h - 20));

    node.style.left = `${posX}px`;
    node.style.top = `${posY}px`;
    node.style.maxHeight = `${maxAvailableH}px`;
    node.style.overflowY = 'auto';
    node.style.scrollbarWidth = 'none';
    node.style.visibility = 'visible';
  }, [contextMenu]);

  // دالة ضبط موضع قائمة كليك يمين للمحادثة
  const chatAreaMenuRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (!node || !chatAreaContextMenu) return;
    const rect = node.getBoundingClientRect();
    const w = rect.width || 210;
    const h = rect.height || 95;

    const posX = Math.max(12, Math.min(chatAreaContextMenu.x, window.innerWidth - w - 12));
    const posY = Math.max(16, Math.min(chatAreaContextMenu.y, window.innerHeight - h - 24));

    node.style.left = `${posX}px`;
    node.style.top = `${posY}px`;
    node.style.visibility = 'visible';
  }, [chatAreaContextMenu]);

  const handleContextMenu = (e: React.MouseEvent, msg: any, isTransfer: boolean = false) => {
    e.preventDefault();
    e.stopPropagation();

    // الجوال: الضغط المطوّل يطلق contextmenu في أندرويد، ندخل في وضع التحديد الشبيه بواتساب
    if (isMobileViewport()) {
      closeAllPopups();
      setIsSelectionMode(true);
      setSelectedMsgIds((prev) => (prev.includes(msg.id) ? prev : [...prev, msg.id]));
      return;
    }

    // إغلاق أي قائمة سياقية أخرى أو منسدلة فوراً لضمان عدم ظهور قائمتين معاً نهائياً
    closeAllPopups();

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      msg,
    });
  };

  // قائمة كليك يمين عند النقر في أي مكان داخل المحادثة غير الرسائل (لإغلاق المحادثة أو إدارتها)
  const handleChatAreaContextMenu = (e: React.MouseEvent) => {
    if (!activeGroup) return;
    e.preventDefault();
    e.stopPropagation();

    // إغلاق أي قائمة رسالة أخرى فوراً
    closeAllPopups();

    setChatAreaContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleToggleSelectMsg = (id: string) => {
    setSelectedMsgIds((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      if (next.length === 0) {
        setIsSelectionMode(false);
      }
      return next;
    });
  };

  // الحذف مع إمكانية التراجع (بدل نافذة التأكيد المنبثقة):
  // الرسائل تختفي فوراً من الشاشة، ولا تُحذف فعلياً إلا بعد انتهاء مهلة التراجع
  const UNDO_DELETE_MS = 6000;

  const deleteMessagesWithUndo = (ids: string[]) => {
    const idSet = new Set(ids);
    const removed = messages.filter((m) => idSet.has(m.id));
    if (removed.length === 0) return;

    setMessages((prev) => prev.filter((m) => !idSet.has(m.id)));

    let undone = false;
    const timer = setTimeout(async () => {
      if (undone) return;
      try {
        const res = await fetch('/api/whatsapp/messages', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ids.length === 1 ? { id: ids[0] } : { ids }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'فشل الحذف');
        }
        setActionStatus((prev) => {
          const updated = { ...prev };
          ids.forEach((id) => delete updated[id]);
          try {
            localStorage.setItem('hawalat_msg_status', JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      } catch (e: any) {
        // فشل الحذف من السيرفر: نعيد الرسائل للشاشة
        setMessages((prev) => [...removed.filter((r) => !prev.some((p) => p.id === r.id)), ...prev]);
        toast.error(`تعذر الحذف: ${e.message}`, 'خطأ في الحذف');
      }
    }, UNDO_DELETE_MS);

    toast.undoable(
      ids.length === 1 ? 'تم حذف الرسالة من المحادثة.' : `تم حذف (${ids.length}) رسائل من المحادثة.`,
      () => {
        undone = true;
        clearTimeout(timer);
        setMessages((prev) => [...removed.filter((r) => !prev.some((p) => p.id === r.id)), ...prev]);
      },
      'حذف',
      UNDO_DELETE_MS
    );
  };

  const handleDeleteMessage = (id: string) => {
    deleteMessagesWithUndo([id]);
  };

  const handleBulkDelete = () => {
    if (selectedMsgIds.length === 0) return;
    deleteMessagesWithUndo(selectedMsgIds);
    setSelectedMsgIds([]);
    setIsSelectionMode(false);
  };

  // استخراج الوصل الفعلي المرتبط بالحوالة (سواء كان مشبوكاً يدوياً، أو في الرسالة نفسها، أو في الرسالة المقتبس منها Reply)
  const getEffectiveReceipt = useCallback(
    (msg: any): { receiptUrl: string; receiptFilename?: string; isLinked: boolean } | null => {
      if (!msg) return null;
      // 1. إذا كان مربوطاً يدوياً أو مسجلاً على السيرفر
      const linkedUrl = linkedReceipts[msg.id]?.receiptUrl || msg.linkedReceiptUrl || msg.status?.linkedImageUrl;
      if (linkedUrl) {
        const filename =
          linkedUrl.split('/').pop()?.split('?')[0] ||
          (linkedUrl.toLowerCase().includes('.pdf') ? 'receipt.pdf' : 'receipt.jpg');
        return { receiptUrl: linkedUrl, receiptFilename: filename, isLinked: true };
      }
      // 2. إذا كانت الرسالة نفسها تحتوي على وسائط
      if (msg.mediaUrl) {
        return {
          receiptUrl: msg.mediaUrl,
          receiptFilename:
            msg.fileName ||
            msg.mediaUrl.split('/').pop()?.split('?')[0] ||
            (msg.mediaUrl.toLowerCase().includes('.pdf') ? 'receipt.pdf' : 'receipt.jpg'),
          isLinked: false,
        };
      }
      // 3. إذا كانت الرسالة تقتبس رسالة أخرى تحتوي على وسائط (مثل صورة إيصال أو مستند PDF)
      if (msg.status?.autoLinkSuppressed || actionStatus[msg.id]?.autoLinkSuppressed) return null;
      if (msg.quotedMessage) {
        const original = messages.find((m) => m.id === msg.quotedMessage.id);
        const qUrl =
          msg.quotedMessage.mediaUrl ||
          original?.mediaUrl ||
          linkedReceipts[msg.quotedMessage.id]?.receiptUrl ||
          original?.linkedReceiptUrl ||
          original?.status?.linkedImageUrl;
        if (qUrl) {
          const qFilename =
            msg.quotedMessage.fileName ||
            original?.fileName ||
            qUrl.split('/').pop()?.split('?')[0] ||
            (qUrl.toLowerCase().includes('.pdf') ? 'receipt.pdf' : 'receipt.jpg');
          return { receiptUrl: qUrl, receiptFilename: qFilename, isLinked: true };
        }
      }
      return null;
    },
    [linkedReceipts, messages, actionStatus]
  );

  const handleBulkForward = async (targetGroupName: string) => {
    if (selectedMsgIds.length === 0) return;

    setBulkForwardDropdownOpen(false);
    const selectedMsgs = messages.filter((m) => selectedMsgIds.includes(m.id));
    const count = selectedMsgs.length;

    try {
      // إذا كانت الرسائل المحددة تتضمن وسائط أو صور إيصالات، نرتبها لتُعالج الوسائط أولاً
      // لتسجيل معرّف الوصل وإعادة ربطه بجميع النصوص المحولة دون تكرار إرسال الصورة في واتساب
      const ordered = [...selectedMsgs].sort((a, b) => {
        const aHasMedia = Boolean(a.hasMedia || a.mediaUrl);
        const bHasMedia = Boolean(b.hasMedia || b.mediaUrl);
        if (aHasMedia && !bHasMedia) return -1;
        if (!aHasMedia && bHasMedia) return 1;
        return (a.timestampMs || 0) - (b.timestampMs || 0);
      });

      // خريطة لتتبع الإيصالات والوسائط المرسلة لهذه المجموعة لمنع تكرار الصورة
      // receiptUrl -> receiptMessageId
      const sentReceiptsMap = new Map<string, string>();

      for (const msg of ordered) {
        const eff = getEffectiveReceipt(msg);
        const rawReceiptUrl = eff?.receiptUrl || '';
        const normReceiptUrl = rawReceiptUrl ? rawReceiptUrl.split('?')[0].split('#')[0] : '';
        const existingReceiptMsgId = normReceiptUrl ? sentReceiptsMap.get(normReceiptUrl) : undefined;
        const shouldSkipMedia = Boolean(existingReceiptMsgId);

        const res = await fetch('/api/transfers/forward', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetGroup: targetGroupName,
            sourceMessageId: msg.id,
            linkedImageUrl: rawReceiptUrl,
            reuseReceiptMsgId: existingReceiptMsgId,
            skipMediaSend: shouldSkipMedia,
          }),
        });

        const forwardData = await res.json().catch(() => ({}));
        const finalReceiptUrl = forwardData?.linkedImageUrl || rawReceiptUrl;
        const effectiveReceiptMsgId = forwardData?.receiptMessageId || existingReceiptMsgId;

        // تسجيل معرّف الوصل المرسل في الخريطة ليتم ربطه بالنصوص اللاحقة المشاركة لنفس الوصل دون إرساله مجدداً
        if (normReceiptUrl && effectiveReceiptMsgId && !sentReceiptsMap.has(normReceiptUrl)) {
          sentReceiptsMap.set(normReceiptUrl, effectiveReceiptMsgId);
        }

        if (forwardData?.messageId && finalReceiptUrl) {
          handleLinkReceipt(forwardData.messageId, finalReceiptUrl, effectiveReceiptMsgId);
        }
        if (effectiveReceiptMsgId && finalReceiptUrl) {
          handleLinkReceipt(effectiveReceiptMsgId, finalReceiptUrl, forwardData?.messageId);
        }

        const isRec = targetGroupName.includes('استلام');
        await updateStatus(msg.id, {
          forwardedTo: targetGroupName,
          ...(isRec ? { isReceived: true } : {}),
        });
      }

      setSelectedMsgIds([]);
      setIsSelectionMode(false);
      toast.success(`تم توجيه (${count}) رسائل بنجاح إلى مجموعة: ${targetGroupName}`, 'توجيه جماعي');
    } catch (e: any) {
      toast.error(`خطأ أثناء توجيه الرسائل: ${e.message}`, 'خطأ في التوجيه');
    }
  };

  // تحويل متعدد لمجموعة من المحادثات والقوائم المخصصة معاً (الشبيه بواتساب)
  const handleMultiForward = async (targetGroupNames: string[]) => {
    if (selectedMsgIds.length === 0 || targetGroupNames.length === 0) return;

    const selectedMsgs = messages.filter((m) => selectedMsgIds.includes(m.id));
    const totalMsgs = selectedMsgs.length;
    const totalTargets = targetGroupNames.length;

    toast.info(`جاري تحويل ${totalMsgs} رسالة إلى ${totalTargets} محادثة...`, 'تحويل الرسائل');
    setIsForwardingInProgress(true);

    try {
      const ordered = [...selectedMsgs].sort((a, b) => {
        const aHasMedia = Boolean(a.hasMedia || a.mediaUrl);
        const bHasMedia = Boolean(b.hasMedia || b.mediaUrl);
        if (aHasMedia && !bHasMedia) return -1;
        if (!aHasMedia && bHasMedia) return 1;
        return (a.timestampMs || 0) - (b.timestampMs || 0);
      });

      for (const targetGroupName of targetGroupNames) {
        // خريطة مستقلة لكل محادثة هدف لتتبع الإيصالات المرسلة إليها ومنع التكرار
        const sentReceiptsMap = new Map<string, string>();

        for (const msg of ordered) {
          const eff = getEffectiveReceipt(msg);
          const rawReceiptUrl = eff?.receiptUrl || '';
          const normReceiptUrl = rawReceiptUrl ? rawReceiptUrl.split('?')[0].split('#')[0] : '';
          const existingReceiptMsgId = normReceiptUrl ? sentReceiptsMap.get(normReceiptUrl) : undefined;
          const shouldSkipMedia = Boolean(existingReceiptMsgId);

          const res = await fetch('/api/transfers/forward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetGroup: targetGroupName,
              sourceMessageId: msg.id,
              linkedImageUrl: rawReceiptUrl,
              reuseReceiptMsgId: existingReceiptMsgId,
              skipMediaSend: shouldSkipMedia,
            }),
          }).catch((err) => console.warn('خطأ تحويل رسالة:', err));

          if (res) {
            const forwardData = await res.json().catch(() => ({}));
            const finalReceiptUrl = forwardData?.linkedImageUrl || rawReceiptUrl;
            const effectiveReceiptMsgId = forwardData?.receiptMessageId || existingReceiptMsgId;

            if (normReceiptUrl && effectiveReceiptMsgId && !sentReceiptsMap.has(normReceiptUrl)) {
              sentReceiptsMap.set(normReceiptUrl, effectiveReceiptMsgId);
            }

            if (forwardData?.messageId && finalReceiptUrl) {
              handleLinkReceipt(forwardData.messageId, finalReceiptUrl, effectiveReceiptMsgId);
            }
            if (effectiveReceiptMsgId && finalReceiptUrl) {
              handleLinkReceipt(effectiveReceiptMsgId, finalReceiptUrl, forwardData?.messageId);
            }
          }

          const isRec = targetGroupName.includes('استلام');
          await updateStatus(msg.id, {
            forwardedTo: targetGroupName,
            ...(isRec ? { isReceived: true } : {}),
          });
        }
      }

      toast.success(
        `تم تحويل ${totalMsgs} ${totalMsgs === 1 ? 'رسالة' : 'رسائل'} بنجاح إلى ${totalTargets} ${totalTargets === 1 ? 'محادثة' : 'محادثات'} ✔`,
        'تم التحويل بنجاح'
      );
      setSelectedMsgIds([]);
      setIsSelectionMode(false);
      setIsForwardModalOpen(false);
      setTargetChatsToForward([]);
    } catch (e: any) {
      toast.error(`خطأ أثناء التحويل: ${e.message}`, 'خطأ في التحويل');
    } finally {
      setIsForwardingInProgress(false);
    }
  };

  const handleCopySelectedMessages = async () => {
    const selectedMsgs = messages.filter((m) => selectedMsgIds.includes(m.id));
    const ordered = [...selectedMsgs].sort((a, b) => (a.timestampMs || 0) - (b.timestampMs || 0));

    // إذا كانت رسالة واحدة فقط محددة وهي عبارة عن صورة بدون نص مخصص
    if (ordered.length === 1) {
      const single = ordered[0];
      const imgUrl = single.mediaUrl || linkedReceipts[single.id]?.receiptUrl;
      const isOnlyPlaceholderText =
        !single.text ||
        ['ملصق', 'صورة', 'مقطع فيديو', 'تسجيل صوتي', 'مقطع صوتي'].includes(single.text.trim());
      if (imgUrl && isOnlyPlaceholderText) {
        await copyImageToClipboard(imgUrl, single.text);
        return;
      }
    }

    // استخراج النصوص الحقيقية واستبعاد الكلمات النائبة مثل كلمة 'صورة'
    const textToCopy = ordered
      .map((m) => {
        if (!m.text) return '';
        if (['ملصق', 'صورة', 'مقطع فيديو', 'تسجيل صوتي', 'مقطع صوتي'].includes(m.text.trim())) {
          return '';
        }
        return m.text;
      })
      .filter(Boolean)
      .join('\n\n---\n\n');

    if (!textToCopy) {
      // إذا لم يكن هناك نص بل توجد صورة محددة، ننسخ الصورة مباشرة
      const imgMsg = ordered.find((m) => m.mediaUrl || linkedReceipts[m.id]?.receiptUrl);
      if (imgMsg) {
        const u = imgMsg.mediaUrl || linkedReceipts[imgMsg.id]?.receiptUrl;
        await copyImageToClipboard(u, imgMsg.text);
        return;
      }
      toast.warning('لا يوجد نص في الرسائل المحددة لنسخه');
      return;
    }

    try {
      await navigator.clipboard.writeText(textToCopy);
      toast.success(`تم نسخ نص ${ordered.length} رسالة إلى الحافظة`, 'تم النسخ');
    } catch {
      toast.error('تعذر النسخ إلى الحافظة');
    }
  };

  const handleStarSelectedMessages = () => {
    toast.success(`تم تمييز ${selectedMsgIds.length} رسالة بنجمة ⭐`, 'المفضلة');
  };

  const handleDirectFullSubmit = async (msg: any) => {
    // تسجيل وحفظ شامل: فتح البوابة مع التعبئة الفورية وحفظ البيانات في أيرتيبل
    await handleOpenPortalWithAutoFill(msg);
    await handleDirectAirtableSubmit(msg);
  };

  const handleOpenPortalWithAutoFill = async (msg: any) => {
    const parsed = parseTransferText(msg.text, msg);
    const eff = getEffectiveReceipt(msg);
    const dataCard = generateReceiptCardDataUrl({ ...parsed, rawText: msg.text });
    const receiptImage = eff?.receiptUrl || dataCard;

    let targetPhone = cleanPhoneNumber(parsed.cleanPhone || parsed.phone || '');
    if (!targetPhone) {
      if (msg.sender && msg.sender.includes('@s.whatsapp.net')) {
        targetPhone = cleanPhoneNumber(msg.sender.split('@')[0]);
      } else if (msg.chatJid && msg.chatJid.includes('@s.whatsapp.net')) {
        targetPhone = cleanPhoneNumber(msg.chatJid.split('@')[0]);
      }
    }

    let fullReceiptUrl = receiptImage || '';
    if (fullReceiptUrl.startsWith('/media/') || fullReceiptUrl.startsWith('public/')) {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3010';
      fullReceiptUrl = `${origin}${fullReceiptUrl.startsWith('/') ? '' : '/'}${fullReceiptUrl}`;
    }

    const isAisha = Boolean(
      msg.chatName?.includes('تسليم باليد') ||
      msg.chatJid?.includes('تسليم باليد') ||
      parsed.isAishaHandDelivery ||
      parsed.paymentMethod === 'استلام باليد' ||
      /تسليم\s*بيد\s*عائش[ةه]|استلام\s*باليد/i.test(msg.text || '')
    );

    // تجهيز الملاحظات: فقط اسم المنسق والعمر ولا أي شيء آخر لجميع المشتركين
    const coordinatorVal = parsed.coordinatorName || (parsed.notes?.match(/اسم\s*المنسق\s*:\s*([^\n\r-]+)/i)?.[1]?.trim()) || (msg.text?.match(/(?:المنسق|المنسقة|اسم\s*المنسق)\s*:\s*([^\n\r-]+)/i)?.[1]?.trim()) || '';
    const ageVal = parsed.age || (parsed.notes?.match(/العمر\s*:\s*([^\n\r-]+)/i)?.[1]?.trim()) || (msg.text?.match(/(?:العمر|السن)\s*:\s*(\d+)/i)?.[1]?.trim()) || '';
    const notesParts: string[] = [];
    if (coordinatorVal) notesParts.push(`اسم المنسق: ${coordinatorVal}`);
    if (ageVal) notesParts.push(`العمر: ${ageVal}`);
    const strictNotes = notesParts.join(' - ');

    const payload: any = {
      id: msg.id,
      participantName: parsed.participantName,
      email: (parsed.email || '').trim().toLowerCase(),
      phone: targetPhone,
      cleanPhone: targetPhone,
      gender: parsed.gender || 'ذكر',
      payerCountry: parsed.payerCountry || 'فلسطين',
      residenceCountry: parsed.residenceCountry || 'فلسطين',
      isAishaHandDelivery: isAisha,
      paymentMethod: isAisha ? 'استلام باليد' : (parsed.paymentMethod || 'تحويل مصرفي'),
      senderName: parsed.senderName || parsed.participantName,
      transferNumber: isAisha ? '' : (parsed.transferNumber || ''),
      paymentDate: normalizeDateToISO(parsed.paymentDate),
      bankName: isAisha ? '' : 'صرافة / بنك',
      amount: parsed.amount || (isAisha ? 100 : 85),
      currency: parsed.currency || (isAisha ? 'USD' : 'JOD'),
      coordinatorName: coordinatorVal,
      age: ageVal,
      notes: strictNotes,
      chatName: msg.chatName || '',
      rawText: msg.text || '',
      messageText: msg.text || '',
      receiptUrl: fullReceiptUrl,
      receiptFilename: eff?.receiptFilename,
      receiptBase64: receiptImage && receiptImage.startsWith('data:') ? receiptImage : undefined,
      messageCardBase64: dataCard && dataCard.startsWith('data:') ? dataCard : undefined,
      batch: `دورة إنعاش العقل - الدفعة ${currentBatch}`,
    };

    try {
      toast.info('جاري تجهيز صفحة البوابة...', 'بوابة عقليات');

      // حفظ بيانات الحوالة في الـ API كخيار بديل مضمون للإضافة والمتصفح
      fetch('/api/portal/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((e) => console.warn('تنبيه حفظ البيانات المؤقتة:', e));

      // تنبيه: لا نضع وسم المسجلة هنا، لأن مجرد فتح الرابط لا يعني إتمام التسجيل
      // يتم تأكيد التسجيل فقط عند ثبوت البيانات في مجموعة "حوالات تم رفعها"
      // تنظيف الرابط من Base64 والبيانات الثقيلة لتجنب تجاوز حد طول الرابط ولحماية الاتصال مع سيرفر البوابة
      const cleanPayload = { ...payload };
      delete cleanPayload.receiptBase64;
      delete cleanPayload.messageCardBase64;
      if (cleanPayload.receiptUrl && cleanPayload.receiptUrl.startsWith('data:')) {
        delete cleanPayload.receiptUrl;
      }
      cleanPayload.rawText = (msg.text || '').slice(0, 1500);
      cleanPayload.messageText = (msg.text || '').slice(0, 1500);
      if (cleanPayload.email) {
        cleanPayload.email = cleanPayload.email.replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, '').trim().toLowerCase();
      }

      const jsonStr = JSON.stringify(cleanPayload);
      const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
      const portalUrl = `https://portal.aqleeat.com/delegate-registration/#data=${encodeURIComponent(base64)}`;
      
      let opened = false;
      try {
        const win = window.open(portalUrl, '_blank');
        if (win && !win.closed && typeof win.closed !== 'undefined') {
          opened = true;
        }
      } catch (err) {}

      if (!opened) {
        try {
          const a = document.createElement('a');
          a.href = portalUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          a.remove();
          opened = true;
        } catch (e) {}
      }

      setPendingPortalConfirm({
        msg,
        parsed,
        targetPhone,
      });

      const defaultCredsMsg = `بيانات البوابة الالكترونية\n\nاسم المشترك :  \n${parsed.participantName}\n\nالايميل أو اسم المستخدم:\n${parsed.email}\n\nالرقم السري : \n${targetPhone}\n\nرابط تسجيل الدخول إلى بوابة التدريبات العقلية:\n\nhttps://portal.aqleeat.com/trainees-portal\n\nرابط شرح استخدام البوابة من اليوتيوب:\n\nhttps://youtu.be/gFRQBtkQceE`;
      setPortalConfirmMessage(defaultCredsMsg);

      toast.success(
        'تم فتح صفحة البوابة وتعبئة البيانات بنجاح',
        'تعبئة البوابة تلقائياً'
      );
    } catch (e: any) {
      toast.error('حدث خطأ أثناء فتح البوابة: ' + e.message, 'خطأ');
    }
  };

  const handleDirectPortalSubmit = async (msg: any) => {
    const parsed = parseTransferText(msg.text, msg);
    setProcessingMsgId(msg.id);
    const eff = getEffectiveReceipt(msg);
    const dataCard = generateReceiptCardDataUrl({ ...parsed, rawText: msg.text });
    const receiptImage = eff?.receiptUrl || dataCard;
    const dataCardUrl = eff?.receiptUrl ? dataCard : undefined;

    // استخراج رقم الهاتف وتنظيفه ليكون أرقاماً بحتة فقط بدون أي فراغات أو إشارات
    let targetPhone = cleanPhoneNumber(parsed.cleanPhone || parsed.phone || '');
    if (!targetPhone) {
      if (msg.sender && msg.sender.includes('@s.whatsapp.net')) {
        targetPhone = cleanPhoneNumber(msg.sender.split('@')[0]);
      } else if (msg.chatJid && msg.chatJid.includes('@s.whatsapp.net')) {
        targetPhone = cleanPhoneNumber(msg.chatJid.split('@')[0]);
      }
    }

    if (!targetPhone || !parsed.email) {
      setProcessingMsgId(null);
      toast.warning(
        'رقم الجوال والبريد الإلكتروني مطلوبان للتسجيل في البوابة. تم فتح نافذة المراجعة لتعبئتهم.',
        'بيانات ناقصة'
      );
      onOpenReview({ ...parsed, phone: targetPhone, cleanPhone: targetPhone }, receiptImage, msg.id);
      return;
    }

    const isAisha = Boolean(
      msg.chatName?.includes('تسليم باليد') ||
      msg.chatJid?.includes('تسليم باليد') ||
      parsed.isAishaHandDelivery ||
      parsed.paymentMethod === 'استلام باليد' ||
      /تسليم\s*بيد\s*عائش[ةه]|استلام\s*باليد/i.test(msg.text || '')
    );

    const coordinatorVal = parsed.coordinatorName || (parsed.notes?.match(/اسم\s*المنسق\s*:\s*([^\n\r-]+)/i)?.[1]?.trim()) || (msg.text?.match(/(?:المنسق|المنسقة|اسم\s*المنسق)\s*:\s*([^\n\r-]+)/i)?.[1]?.trim()) || '';
    const ageVal = parsed.age || (parsed.notes?.match(/العمر\s*:\s*([^\n\r-]+)/i)?.[1]?.trim()) || (msg.text?.match(/(?:العمر|السن)\s*:\s*(\d+)/i)?.[1]?.trim()) || '';
    const notesParts: string[] = [];
    if (coordinatorVal) notesParts.push(`اسم المنسق: ${coordinatorVal}`);
    if (ageVal) notesParts.push(`العمر: ${ageVal}`);
    const strictNotes = notesParts.join(' - ');

    try {
      const res = await fetch('/api/transfers/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed,
          phone: targetPhone,
          isAishaHandDelivery: isAisha,
          paymentMethod: isAisha ? 'استلام باليد' : (parsed.paymentMethod || 'تحويل مصرفي'),
          transferNumber: isAisha ? '' : (parsed.transferNumber || ''),
          bankName: isAisha ? '' : ((parsed as any).bankName || ''),
          notes: strictNotes,
          coordinatorName: coordinatorVal,
          age: ageVal,
          saveToAirtable: false,
          submitToPortal: true,
          forwardToWhatsApp: false,
          receiptUrl: receiptImage,
          receiptFilename: eff?.receiptFilename,
          dataCardUrl: dataCardUrl,
          linkedReceiptUrl: eff?.receiptUrl,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await updateStatus(msg.id, { portal: true, registered: true });
        if (data.results?.portal?.alreadyRegistered) {
          toast.success(`المشترك (${parsed.participantName}) مسجل مسبقاً في بوابة عقليات`, 'بوابة عقليات');
        } else {
          toast.success(`تم تسجيل المتدرب (${parsed.participantName}) في بوابة عقليات بنجاح`, 'بوابة عقليات');
        }
      } else {
        toast.error(data.error || data.message || 'فشلت معالجة التسجيل في البوابة.', 'خطأ في البوابة');
      }
    } catch (e: any) {
      toast.error(`خطأ: ${e.message}`, 'خطأ في الاتصال');
    } finally {
      setProcessingMsgId(null);
    }
  };

  const sendingCredentialsSetRef = useRef<Set<string>>(new Set());

  const handleSendCredentialsToGroup = async (msg: any, customMessage?: string) => {
    if (!msg?.id) return;
    if (sendingCredentialsSetRef.current.has(msg.id)) return;
    sendingCredentialsSetRef.current.add(msg.id);
    setProcessingMsgId(msg.id);
    const parsed = parseTransferText(msg.text, msg);

    let targetPhone = cleanPhoneNumber(parsed.cleanPhone || parsed.phone || '');
    if (!targetPhone) {
      if (msg.sender && msg.sender.includes('@s.whatsapp.net')) {
        targetPhone = cleanPhoneNumber(msg.sender.split('@')[0]);
      } else if (msg.chatJid && msg.chatJid.includes('@s.whatsapp.net')) {
        targetPhone = cleanPhoneNumber(msg.chatJid.split('@')[0]);
      }
    }

    const eff = getEffectiveReceipt(msg);
    const receiptImage = eff?.receiptUrl || msg.mediaUrl;

    if (!targetPhone || !parsed.email) {
      sendingCredentialsSetRef.current.delete(msg.id);
      setProcessingMsgId(null);
      toast.warning(
        'رقم الجوال والبريد الإلكتروني مطلوبان لإرسال بيانات الدخول للقروب. تم فتح نافذة المراجعة لتعبئتهم.',
        'بيانات ناقصة'
      );
      onOpenReview({ ...parsed, phone: targetPhone, cleanPhone: targetPhone }, receiptImage, msg.id);
      return;
    }

    try {
      const res = await fetch('/api/transfers/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed,
          phone: targetPhone,
          saveToAirtable: false,
          submitToPortal: false,
          forwardToWhatsApp: true,
          targetGroupName: 'حوالات تم رفعها',
          customMessage: customMessage || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await updateStatus(msg.id, { forwardedTo: 'حوالات تم رفعها' });
        toast.success(
          `تم إرسال بيانات البوابة للمشترك (${parsed.participantName}) إلى مجموعة (حوالات تم رفعها) بنجاح`,
          'تم الإرسال للقروب'
        );
      } else {
        toast.error(data.error || data.message || 'تعذر إرسال الرسالة إلى مجموعة واتساب.', 'خطأ في الإرسال');
      }
    } catch (e: any) {
      toast.error(`خطأ: ${e.message}`, 'خطأ في الاتصال');
    } finally {
      sendingCredentialsSetRef.current.delete(msg.id);
      setProcessingMsgId(null);
    }
  };

  const handleDirectAirtableSubmit = async (msg: any) => {
    const parsed = parseTransferText(msg.text, msg);
    setProcessingMsgId(msg.id);
    const eff = getEffectiveReceipt(msg);
    const dataCard = generateReceiptCardDataUrl({ ...parsed, rawText: msg.text });
    const receiptImage = eff?.receiptUrl || dataCard;
    const dataCardUrl = eff?.receiptUrl ? dataCard : undefined;

    try {
      const res = await fetch('/api/transfers/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...parsed,
          phone: parsed.cleanPhone || parsed.phone,
          saveToAirtable: true,
          submitToPortal: false,
          forwardToWhatsApp: false,
          receiptUrl: receiptImage,
          receiptFilename: eff?.receiptFilename,
          dataCardUrl: dataCardUrl,
          linkedReceiptUrl: eff?.receiptUrl,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        await updateStatus(msg.id, { airtable: true, registered: true });
        toast.success(`تم حفظ بيانات المتدرب (${parsed.participantName}) في أيرتيبل بنجاح`, 'أيرتيبل');
      } else {
        toast.error(data.error || data.message || 'فشل الحفظ في أيرتيبل.', 'خطأ في أيرتيبل');
      }
    } catch (e: any) {
      toast.error(`خطأ: ${e.message}`, 'خطأ في الاتصال');
    } finally {
      setProcessingMsgId(null);
    }
  };

  const handleDirectForward = async (msg: any, targetGroupName: string) => {
    setProcessingMsgId(msg.id);
    setDropdownOpenId(null);

    try {
      // تحويل الرسالة كما هي تماماً بدون تعديل، ومعها صورة الوصل المشبوكة أو المقتبسة إن وجدت
      const eff = getEffectiveReceipt(msg);
      const res = await fetch('/api/transfers/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetGroup: targetGroupName,
          sourceMessageId: msg.id,
          linkedImageUrl: eff?.receiptUrl,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const finalReceiptUrl = data.linkedImageUrl || eff?.receiptUrl;
        if (data.messageId && finalReceiptUrl) {
          handleLinkReceipt(data.messageId, finalReceiptUrl, data.receiptMessageId);
        }
        if (data.receiptMessageId && finalReceiptUrl) {
          handleLinkReceipt(data.receiptMessageId, finalReceiptUrl, data.messageId);
        }

        const isRec = targetGroupName.includes('استلام');
        await updateStatus(msg.id, {
          forwardedTo: targetGroupName,
          ...(isRec ? { isReceived: true } : {}),
        });
        toast.success(`تم توجيه الحوالة بنجاح إلى: ${targetGroupName}`, 'توجيه واتساب');
      } else {
        toast.error(data.error || data.message || 'فشل التوجيه إلى واتساب.', 'خطأ في التوجيه');
      }
    } catch (e: any) {
      toast.error(`خطأ أثناء التوجيه: ${e.message}`, 'خطأ في التوجيه');
    } finally {
      setProcessingMsgId(null);
    }
  };

  // تصفية الرسائل بحسب اسم أو معرف المحادثة الحقيقية المفتوحة (مطابقة سريعة وخفيفة تمنع التجميد)
  const filterMessagesByGroup = useCallback((groupName: string, allMsgs: any[]) => {
    if (!groupName) return [];
    if (groupName === 'كل المحادثات') return allMsgs;
    const targetGroup = realGroups.find((g) => g.name === groupName || g.id === groupName);
    const targetJid = targetGroup?.id || (groupName.includes('@') ? groupName : '');
    const trimmedGroup = groupName.trim();

    return allMsgs.filter((msg) => {
      if (!msg) return false;
      if (targetJid) return msg.chatJid === targetJid || (!msg.chatJid && msg.chatName?.trim() === targetGroup?.name);
      return msg.chatJid?.trim() === trimmedGroup || msg.chatName?.trim() === trimmedGroup;
    });
  }, [realGroups]);

  // استخراج سجل المشتركين المسجلين في البوابة من رسائل مجموعة "حوالات تم رفعها"
  const uploadedGroupData = useMemo(() => {
    const names = new Set<string>();
    const emails = new Set<string>();
    const phones = new Set<string>();

    const normalizeName = (nameStr: string) =>
      nameStr
        .trim()
        .toLowerCase()
        .replace(/[إأآا]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/\s+/g, ' ');

    messages.forEach((m: any) => {
      const isUploadedGroup = Boolean(
        (m.chatName && m.chatName.includes('حوالات تم رفعها')) ||
        (m.chatJid && m.chatJid.includes('حوالات تم رفعها'))
      );
      if (!isUploadedGroup) return;

      const text = m.text || '';
      if (!text.includes('بيانات البوابة') && !text.includes('اسم المشترك') && !text.includes('الرقم السري')) return;

      // 1. اسم المشترك
      const nameMatch = text.match(/اسم المشترك\s*:\s*\n*([^\n\r]+)/i);
      if (nameMatch && nameMatch[1]) {
        const cleanN = normalizeName(nameMatch[1]);
        if (cleanN.length > 2) names.add(cleanN);
      }

      // 2. البريد الإلكتروني
      const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        emails.add(emailMatch[0].trim().toLowerCase());
      }

      // 3. الرقم السري / الجوال
      const passMatch = text.match(/الرقم السري\s*:\s*\n*([^\n\r]+)/i);
      if (passMatch && passMatch[1]) {
        const cleanP = passMatch[1].replace(/\D/g, '');
        if (cleanP.length >= 7) {
          phones.add(cleanP);
          if (cleanP.length >= 9) {
            phones.add(cleanP.slice(-9));
          }
        }
      }
    });

    return { names, emails, phones, normalizeName };
  }, [messages]);

  // تنظيف كاش فحص الرفع عند تغيّر الرسائل أو الحالات
  useEffect(() => {
    uploadedCheckCache.current.clear();
  }, [uploadedGroupData, actionStatus]);

  // فحص ما إذا كانت الحوالة مسجلة فعلياً في مجموعة "حوالات تم رفعها" (مع كاش فوري O(1))
  const checkIsUploadedInGroup = useCallback(
    (msg: any, parsed?: any) => {
      if (!msg) return false;
      const cached = uploadedCheckCache.current.get(msg.id);
      if (cached !== undefined) return cached;

      if (
        msg.status?.forwardedTo === 'حوالات تم رفعها' ||
        actionStatus[msg.id]?.forwardedTo === 'حوالات تم رفعها'
      ) {
        uploadedCheckCache.current.set(msg.id, true);
        return true;
      }

      const text = msg.text || '';

      // 1. فحص البريد الإلكتروني
      let email = (parsed?.email || '').trim().toLowerCase();
      if (!email && text.includes('@')) {
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) email = emailMatch[0].trim().toLowerCase();
      }
      if (email && uploadedGroupData.emails.has(email)) {
        uploadedCheckCache.current.set(msg.id, true);
        return true;
      }

      // 2. فحص رقم الجوال
      const rawPhone = parsed?.cleanPhone || parsed?.phone || msg.phone || '';
      const cleanPhone = String(rawPhone).replace(/\D/g, '');
      if (cleanPhone) {
        if (uploadedGroupData.phones.has(cleanPhone)) {
          uploadedCheckCache.current.set(msg.id, true);
          return true;
        }
        if (cleanPhone.length >= 9 && uploadedGroupData.phones.has(cleanPhone.slice(-9))) {
          uploadedCheckCache.current.set(msg.id, true);
          return true;
        }
      }

      // 3. فحص اسم المشترك
      const rawName = parsed?.participantName || '';
      let normName = rawName ? uploadedGroupData.normalizeName(rawName) : '';
      if (!normName && (text.includes('المشترك') || text.includes('الاسم'))) {
        const nameMatch =
          text.match(/اسم المشترك(?:\s*ثلاثي)?\s*:\s*\n*([^\n\r]+)/i) ||
          text.match(/الاسم(?:\s*الثلاثي)?\s*:\s*\n*([^\n\r]+)/i);
        if (nameMatch && nameMatch[1]) {
          normName = uploadedGroupData.normalizeName(nameMatch[1]);
        }
      }
      if (normName && normName.length > 2) {
        if (uploadedGroupData.names.has(normName)) {
          uploadedCheckCache.current.set(msg.id, true);
          return true;
        }
        for (const uploadedName of uploadedGroupData.names) {
          if (normName.includes(uploadedName) || uploadedName.includes(normName)) {
            uploadedCheckCache.current.set(msg.id, true);
            return true;
          }
        }
      }

      uploadedCheckCache.current.set(msg.id, false);
      return false;
    },
    [uploadedGroupData, actionStatus]
  );

  // استخراج سجل المشتركين المسجلين في أيرتيبل من قاعدة البيانات الحية
  const airtableLookupData = useMemo(() => {
    const names = new Set<string>();
    const emails = new Set<string>();
    const phones = new Set<string>();

    const normalizeArabic = (s: string) =>
      s
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة كافة حركات التشكيل والتنوين والشدّة
        .replace(/[إأآا]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/\s+/g, ' ');

    airtableRecords.forEach((r: any) => {
      const f = r.fields || {};
      const name = f['اسم المشترك'] || f['اسم المتدرب'] || f['الاسم'] || '';
      if (name) {
        const norm = normalizeArabic(String(name));
        if (norm.length > 2) names.add(norm);
      }
      const email = f['بريد الاكتروني'] || f['البريد الالكتروني'] || f['البريد الإلكتروني'] || f['Email'] || f['email'] || '';
      if (email) {
        emails.add(String(email).trim().toLowerCase());
      }
      const phone = f['رقم جوال المشترك'] || f['رقم الجوال'] || f['الجوال'] || f['الهاتف'] || '';
      if (phone) {
        const cleanP = String(phone).replace(/\D/g, '');
        if (cleanP.length >= 7) {
          phones.add(cleanP);
          if (cleanP.length >= 9) phones.add(cleanP.slice(-9));
        }
      }
    });

    return { names, emails, phones, normalizeArabic };
  }, [airtableRecords]);

  // تنظيف كاش فحص أيرتيبل عند تغيّر سجلات أيرتيبل أو الحالات
  useEffect(() => {
    airtableCheckCache.current.clear();
  }, [airtableLookupData, actionStatus]);

  // فحص ما إذا كانت الحوالة مسجلة فعلياً في قاعدة بيانات أيرتيبل (مع كاش فوري O(1))
  const checkIsRegisteredInAirtable = useCallback(
    (msg: any, parsed?: any) => {
      if (!msg) return false;
      const cached = airtableCheckCache.current.get(msg.id);
      if (cached !== undefined) return cached;

      const status = actionStatus[msg.id] || {};
      if (
        status.airtable ||
        status.airtableSaved ||
        msg.status?.airtable ||
        msg.status?.airtableSaved
      ) {
        airtableCheckCache.current.set(msg.id, true);
        return true;
      }

      const text = msg.text || '';

      // 1. فحص البريد الإلكتروني
      let email = (parsed?.email || '').trim().toLowerCase();
      if (!email && text.includes('@')) {
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) email = emailMatch[0].trim().toLowerCase();
      }
      if (email && airtableLookupData.emails.has(email)) {
        airtableCheckCache.current.set(msg.id, true);
        return true;
      }

      // 2. فحص رقم الجوال
      const rawPhone = parsed?.cleanPhone || parsed?.phone || msg.phone || '';
      const cleanPhone = String(rawPhone).replace(/\D/g, '');
      if (cleanPhone) {
        if (airtableLookupData.phones.has(cleanPhone)) {
          airtableCheckCache.current.set(msg.id, true);
          return true;
        }
        if (cleanPhone.length >= 9 && airtableLookupData.phones.has(cleanPhone.slice(-9))) {
          airtableCheckCache.current.set(msg.id, true);
          return true;
        }
      }

      // 3. فحص اسم المشترك
      const rawName = parsed?.participantName || '';
      let normName = rawName ? airtableLookupData.normalizeArabic(rawName) : '';
      if (!normName && (text.includes('المشترك') || text.includes('الاسم'))) {
        const nameMatch =
          text.match(/اسم المشترك(?:\s*ثلاثي)?\s*:\s*\n*([^\n\r]+)/i) ||
          text.match(/الاسم(?:\s*الثلاثي)?\s*:\s*\n*([^\n\r]+)/i);
        if (nameMatch && nameMatch[1]) {
          normName = airtableLookupData.normalizeArabic(nameMatch[1]);
        }
      }
      if (normName && normName.length > 2) {
        if (airtableLookupData.names.has(normName)) {
          airtableCheckCache.current.set(msg.id, true);
          return true;
        }
        for (const airtableName of airtableLookupData.names) {
          if (normName.includes(airtableName) || airtableName.includes(normName)) {
            airtableCheckCache.current.set(msg.id, true);
            return true;
          }
        }
      }

      airtableCheckCache.current.set(msg.id, false);
      return false;
    },
    [airtableLookupData, actionStatus]
  );

  const isMsgRead = useCallback((msg: any) => {
    if (!msg) return false;
    const status = actionStatus[msg.id] || {};
    // مسار سريع O(1): إذا كانت الرسالة مقروءة أو مسجلة في أيرتيبل أو مستلمة نتجاوز الفحص المعقد فوراً
    if (msg.read || status.read || msg.status?.read) return true;
    if (status.airtable || status.airtableSaved || msg.status?.airtable || msg.status?.airtableSaved) return true;
    if (status.isReceived || msg.status?.isReceived || status.forwardedTo?.includes('استلام')) return true;
    if (checkIsRegisteredInAirtable(msg)) return true;
    return checkIsUploadedInGroup(msg);
  }, [actionStatus, checkIsUploadedInGroup, checkIsRegisteredInAirtable]);

  // زر الرجوع في رأس المحادثة يسلك نفس مسار زر الرجوع في الهاتف.
  const handleMobileBack = () => {
    if (isPopoutMode) {
      if (typeof window !== 'undefined') window.close();
      return;
    }
    if (isMobileViewport() && window.history.state?.hawalatGuard) {
      window.history.back();
      return;
    }
    setActiveGroup('');
  };

  useEffect(() => {
    const onMobileBack = (event: Event) => {
      const back = event as CustomEvent<{ scope: string; handled: boolean }>;
      if (back.detail.scope !== 'whatsapp') return;
      if (lightboxState) closeLightbox();
      else if (avatarLightbox?.isOpen) setAvatarLightbox(null);
      else if (mobileSheet) setMobileSheet(null);
      else if (pendingMedia) { if (!isSendingMedia) setPendingMedia(null); }
      else if (isManagingListsModalOpen) setIsManagingListsModalOpen(false);
      else if (isForwardModalOpen) setIsForwardModalOpen(false);
      else if (isQuickRepliesModalOpen) setIsQuickRepliesModalOpen(false);
      else if (isNewChatModalOpen) setIsNewChatModalOpen(false);
      else if (isGroupInfoOpen) setIsGroupInfoOpen(false);
      else if (isCrmPanelOpen) setIsCrmPanelOpen(false);
      else if (messageInfo) closeMessageInfo();
      else if (pendingPortalConfirm) setPendingPortalConfirm(null);
      else if (isStickerPickerOpen) setIsStickerPickerOpen(false);
      else if (isQuickRepliesMenuOpen) setIsQuickRepliesMenuOpen(false);
      else if (attachmentMenuOpen) setAttachmentMenuOpen(false);
      else if (mentionMenu) setMentionMenu(null);
      else if (chatContextMenu?.open) setChatContextMenu(null);
      else if (fullEmojiPickerMsg || contextMenu || chatAreaContextMenu || isSelectionMode) {
        closeAllPopups();
        setIsSelectionMode(false);
        setSelectedMsgIds([]);
      } else if (replyingToMessage) setReplyingToMessage(null);
      else if (editingMessage) setEditingMessage(null);
      else if (isEditingChatName) setIsEditingChatName(false);
      else if (activeGroupRef.current) setActiveGroup('');
      else return;
      back.detail.handled = true;
    };
    window.addEventListener('hawalat-mobile-back', onMobileBack);
    return () => {
      window.removeEventListener('hawalat-mobile-back', onMobileBack);
    };
  }, [lightboxState, avatarLightbox, mobileSheet, pendingMedia, isSendingMedia,
    isManagingListsModalOpen, isForwardModalOpen, isQuickRepliesModalOpen, isNewChatModalOpen,
    isGroupInfoOpen, isCrmPanelOpen, messageInfo, pendingPortalConfirm, isStickerPickerOpen,
    isQuickRepliesMenuOpen, attachmentMenuOpen, mentionMenu, chatContextMenu,
    fullEmojiPickerMsg, contextMenu, chatAreaContextMenu,
    isSelectionMode, replyingToMessage, editingMessage, isEditingChatName]);

  const targetJumpMsgIdRef = useRef<string | null>(null);

  const handleSelectChat = async (groupName: string, targetMsgId?: string) => {
    if (isMobileViewport() && !window.history.state?.hawalatGuard) {
      window.history.pushState({ ...window.history.state, hawalatGuard: true }, '');
    }
    const selectedGroup = realGroups.find((group) => group.name === groupName || group.id === groupName);
    const selectedKey = selectedGroup?.id || groupName;
    const currentGroup = realGroups.find((group) => group.name === activeGroupRef.current || group.id === activeGroupRef.current);
    if (!hasSelectedChatRef.current || (currentGroup?.id || activeGroupRef.current) !== selectedKey) {
      const isManuallyUnread = markedUnreadChatKeys.has(groupName) || markedUnreadChatKeys.has(selectedKey);
      const wasReadHere = readChatKeys.has(groupName) || readChatKeys.has(selectedKey) ||
        Boolean(selectedGroup?.name && readChatKeys.has(selectedGroup.name));
      const unreadCount = wasReadHere && !isManuallyUnread
        ? 0
        : Math.max(Number(selectedGroup?.unreadCount || 0), isManuallyUnread ? 1 : 0);
      setUnreadDivider(unreadCount > 0 ? { chatKey: selectedKey, unreadCount, openedAt: Date.now() } : null);
      if (unreadCount > 0) setDisplayMessageLimit((count) => Math.max(count, Math.min(unreadCount + 10, 500)));
      if (isManuallyUnread) {
        setMarkedUnreadChatKeys((previous) => {
          const next = new Set(previous);
          next.delete(groupName);
          next.delete(selectedKey);
          if (selectedGroup?.name) next.delete(selectedGroup.name);
          return next;
        });
      }
    }
    hasSelectedChatRef.current = true;
    targetJumpMsgIdRef.current = targetMsgId || null;
    activeGroupRef.current = groupName;
    setActiveGroup(groupName);

    // عند القفز إلى رسالة قديمة، اجلب سجل القروب إن لم تكن الرسالة في الواجهة بعد.
    if (!lastFullMessageSyncAtRef.current || (targetMsgId && !messages.some((message) => message.id === targetMsgId))) {
      void fetch(`/api/whatsapp/messages?chatMessages=${encodeURIComponent(groupName)}`)
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (Array.isArray(data?.messages)) mergeMessages(data.messages);
        })
        .catch(() => {});
    }

    // مسح شارة الإشعار الخارجي فوراً عند فتح المحادثة
    setReadChatKeys((prev) => {
      const next = new Set(prev);
      next.add(groupName);
      const matched = realGroups.find((g) => g.name === groupName || g.id === groupName);
      if (matched?.id) next.add(matched.id);
      if (matched?.name) next.add(matched.name);
      return next;
    });

    setRealGroups((prev) =>
      prev.map((g) => (g.name === groupName || g.id === groupName ? { ...g, unreadCount: 0 } : g))
    );

    if (targetMsgId) {
      // إذا تم النقر على محادثة من نتائج البحث وكان بها رسالة مطابقة:
      // نرفع حد العرض لضمان وجود الرسالة في الـ DOM ثم نقفز إليها ونميّزها بإطار ذهبي أنيق
      setIsAtBottom(false);
      setDisplayMessageLimit((prev) => Math.max(prev, 150));
      setTimeout(() => {
        const el = document.getElementById(`msg_${targetMsgId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-amber-400', 'bg-amber-500/10');
          setTimeout(() => {
            el.classList.remove('ring-2', 'ring-amber-400', 'bg-amber-500/10');
          }, 3500);
        }
      }, 200);
    } else {
      // قفز فوري مباشر لأسفل المحادثة بمجرد النقر دون أي حركة أو أنيميشن
      setIsAtBottom(true);
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 0);
    }

    // إرسال طلب القراءة في الخلفية بهدوء دون تجميد واجهة المستخدم إطلاقاً
    setTimeout(() => {
      fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_chat_read', chatName: groupName }),
      }).catch(() => {});
    }, 400);
  };

  // فتح المحادثة المحددة تلقائياً عند تمرير initialChat أو popoutChat
  useEffect(() => {
    if (initialChat) {
      handleSelectChat(initialChat, initialMessageId);
    } else if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('popoutChat');
      if (p) {
        handleSelectChat(p);
      }
    }
  }, [initialChat, initialMessageId]);

  const handleMarkSingleMessageAsRead = async (msgId: string) => {
    await updateStatus(msgId, { read: true });
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, read: true } : m))
    );
  };

  // إخفاء أو استرجاع رسالة محددة بالعين
  const handleToggleHideMessage = (msgId: string) => {
    const isCurrentlyHidden = hiddenMessageIds.has(msgId);
    const updated = new Set(hiddenMessageIds);
    if (isCurrentlyHidden) {
      updated.delete(msgId);
      toast.success('تم استرجاع الرسالة وإظهارها بنجاح', 'استرجاع الرسالة');
    } else {
      updated.add(msgId);
      toast.info('تم إخفاء الرسالة (يمكنك إظهارها واسترجاعها من زر العين في الأعلى)', 'إخفاء الرسالة');
    }
    setHiddenMessageIds(updated);
    try {
      localStorage.setItem('hawalat_hidden_ids', JSON.stringify(Array.from(updated)));
    } catch (e) {}
  };

  const handleMarkAllInGroupAsRead = useCallback(async (targetGroupName?: string) => {
    const groupToMark = targetGroupName || activeGroup;
    if (!groupToMark) return;

    // مسح شارة الإشعار الخارجي فورياً بإضافة اسم ومعرف المحادثة إلى المجموعة المقروءة
    setReadChatKeys((prev) => {
      const next = new Set(prev);
      next.add(groupToMark);
      const matched = realGroups.find((g) => g.name === groupToMark || g.id === groupToMark);
      if (matched?.id) next.add(matched.id);
      if (matched?.name) next.add(matched.name);
      return next;
    });

    // تصفير عداد المجموعة في realGroups
    setRealGroups((prev) =>
      prev.map((g) =>
        g.name === groupToMark || g.id === groupToMark ? { ...g, unreadCount: 0 } : g
      )
    );

    // إرسال تعليم القراءة في الخلفية دون إعادة معالجة الرسائل
    fetch('/api/whatsapp/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark_chat_read', chatName: groupToMark }),
    }).catch(() => {});
  }, [activeGroup, realGroups]);

  markChatReadRef.current = handleMarkAllInGroupAsRead;

  const handleFetchEarlierMessages = async () => {
    if (!activeGroup || historyLoading) return;
    const target = realGroups.find((g) => g.name === activeGroup);
    const jid = target?.id || activeGroup;

    setHistoryLoading(true);
    setHistoryBanner({
      text: 'جاري إرسال طلب جلب الرسائل السابقة لهاتفك عبر واتساب...',
      type: 'info',
    });

    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'fetch_history', chatJid: jid, chatName: activeGroup }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHistoryBanner({
          text: data.message || 'تم إرسال الطلب بنجاح! بانتظار قيام هاتفك بإرسال السجل (قد يستغرق 5-15 ثانية)...',
          type: 'success',
        });
        // تحديث متكرر كل ثانيتين لاستقبال الرسائل القادمة من الهاتف
        let attempts = 0;
        const historyPoll = setInterval(async () => {
          attempts++;
          await fetchMessages();
          if (attempts >= 8) {
            clearInterval(historyPoll);
            setHistoryLoading(false);
          }
        }, 2000);
      } else {
        setHistoryBanner({
          text: data.message || data.error || 'تعذر جلب الرسائل السابقة لهذه المحادثة.',
          type: 'warning',
        });
        setHistoryLoading(false);
      }
    } catch (e: any) {
      setHistoryBanner({
        text: `خطأ أثناء الاتصال بالسيرفر: ${e.message}`,
        type: 'error',
      });
      setHistoryLoading(false);
    }

    setTimeout(() => {
      setHistoryBanner(null);
    }, 8000);
  };

  const handleSyncReactions = async () => {
    if (!activeGroup || isSyncingReactions) return;
    const target = realGroups.find((g) => g.name === activeGroup);
    const jid = target?.id || activeGroup;

    setIsSyncingReactions(true);
    toast.info('جاري إرسال طلب مزامنة التفاعلات من هاتفك...', 'مزامنة التفاعلات');

    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_reactions', chat: jid }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'تم إرسال الطلب بنجاح، جاري تحديث التفاعلات...', 'تم بنجاح');
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          await fetchMessages();
          if (attempts >= 6) {
            clearInterval(poll);
            setIsSyncingReactions(false);
          }
        }, 1500);
      } else {
        toast.error(data.message || 'تعذر إرسال طلب مزامنة التفاعلات.', 'تنبيه');
        setIsSyncingReactions(false);
      }
    } catch (e: any) {
      toast.error(`خطأ: ${e.message}`, 'خطأ في الاتصال');
      setIsSyncingReactions(false);
    }
  };

  const handleStartDirectChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatPhone.trim() || isCreatingNewChat) return;
    setIsCreatingNewChat(true);
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start_direct_chat',
          phone: newChatPhone.trim(),
          name: newChatName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsNewChatModalOpen(false);
        setNewChatPhone('');
        setNewChatName('');
        await fetchMessages();
        if (data.chat?.name) {
          setActiveGroup(data.chat.name);
          setChatFilterTab('direct');
        }
        toast.success(`تم فتح المحادثة بنجاح: ${newChatPhone}`, 'محادثة جديدة');
      } else {
        toast.error(data.error || 'تعذر فتح المحادثة للرقم المدخل', 'فتح محادثة');
      }
    } catch (err: any) {
      toast.error(`خطأ: ${err.message}`, 'فتح محادثة');
    } finally {
      setIsCreatingNewChat(false);
    }
  };

  // ===== النقر على رقم جوال داخل رسالة (مثل واتساب) =====
  const openPhoneMenu = async (rawPhone: string, e: React.MouseEvent) => {
    const phone = toEnglishDigits(rawPhone);
    const menuW = 240;
    const menuH = 110;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
    const y = e.clientY + menuH > window.innerHeight ? e.clientY - menuH : e.clientY;
    setPhoneMenu({ phone, x: Math.max(8, x), y: Math.max(8, y), status: 'checking' });

    // التحقق من أن الرقم مسجل على واتساب قبل عرض "محادثة مع"
    try {
      const res = await fetch(`/api/whatsapp/messages?checkPhone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      setPhoneMenu((prev) => (prev && prev.phone === phone ? { ...prev, status: data.exists ? 'yes' : 'no' } : prev));
    } catch {
      setPhoneMenu((prev) => (prev && prev.phone === phone ? { ...prev, status: 'no' } : prev));
    }
  };

  const handleChatWithPhone = async (phone: string) => {
    const cleanPhone = toEnglishDigits(phone);
    setPhoneMenu(null);
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_direct_chat', phone: cleanPhone }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.chat?.name) {
        await fetchMessages();
        handleSelectChat(data.chat.name);
      } else {
        toast.error(data.error || 'تعذر فتح المحادثة مع هذا الرقم', 'محادثة');
      }
    } catch (err: any) {
      toast.error(`خطأ: ${err.message}`, 'محادثة');
    }
  };

  const handleCopyPhone = async (phone: string) => {
    setPhoneMenu(null);
    try {
      await navigator.clipboard.writeText(phone.replace(/[^\d+]/g, ''));
      toast.success('تم نسخ الرقم', 'نسخ');
    } catch {
      toast.error('تعذر نسخ الرقم', 'نسخ');
    }
  };

  // الرد في الخاص (Reply privately) - مخصص فقط لرسائل الأعضاء داخل القروبات للرد على صاحب الرسالة على الخاص عنده
  const handleReplyPrivately = async (msg: any) => {
    if (!msg) return;
    closeAllPopups();
    setIsSelectionMode(false);
    setSelectedMsgIds([]);

    const senderName = msg.senderName || msg.sender;
    let senderPhone = msg.senderPhone || '';
    if (!senderPhone && msg.sender && msg.sender.includes('@s.whatsapp.net')) {
      senderPhone = cleanPhoneNumber(msg.sender.split('@')[0]);
    }
    if (!senderPhone && msg.chatJid && msg.chatJid.includes('@s.whatsapp.net')) {
      senderPhone = cleanPhoneNumber(msg.chatJid.split('@')[0]);
    }

    // 1. البحث في المحادثات الحالية عن محادثة خاصة فردية مع صاحب الرسالة
    const existingChat = groupsList.find((g) => {
      if (g.isGroup) return false;
      if (senderName && g.name === senderName) return true;
      if (senderPhone && g.phone && cleanPhoneNumber(g.phone) === cleanPhoneNumber(senderPhone)) return true;
      if (senderPhone && cleanPhoneNumber(g.name) === cleanPhoneNumber(senderPhone)) return true;
      return false;
    });

    if (existingChat) {
      handleSelectChat(existingChat.name);
    } else if (senderPhone) {
      try {
        const res = await fetch('/api/whatsapp/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start_direct_chat', phone: senderPhone }),
        });
        const data = await res.json();
        if (res.ok && data.success && data.chat?.name) {
          await fetchMessages();
          handleSelectChat(data.chat.name);
        } else {
          handleSelectChat(senderName || senderPhone);
        }
      } catch {
        handleSelectChat(senderName || senderPhone);
      }
    } else if (senderName) {
      handleSelectChat(senderName);
    }

    // ربط الرسالة كاقتباس مباشر للرد عليها في المحادثة الخاصة
    setReplyingToMessage({
      ...msg,
      quotedContext: `رد خاص من مجموعة ${resolvedActiveContactName}`,
    });

    toast.info(`الرد في الخاص على ${senderName || senderPhone || 'المرسل'}`, 'رد خاص');

    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 150);
  };

  const handleSaveChatName = async () => {
    if (!editChatNameValue.trim() || !activeGroup) {
      setIsEditingChatName(false);
      return;
    }
    const currentChat = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
    const targetId = currentChat?.id || activeGroup;
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rename_chat',
          id: targetId,
          name: editChatNameValue.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const newName = editChatNameValue.trim();
        setActiveGroup(newName);
        setRealGroups((prev) =>
          prev.map((g) => (g.name === activeGroup || g.id === targetId ? { ...g, name: newName } : g))
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.chatName === activeGroup || m.chatJid === targetId ? { ...m, chatName: newName } : m
          )
        );
      }
    } catch (e) {}
    setIsEditingChatName(false);
  };

  // جميع رسائل المحادثة الحالية (محفوظة في useMemo لتفادي إعادة الحساب مع كل حركة أو نقرة)
  const allCurrentGroupMessages = useMemo(() => {
    return filterMessagesByGroup(activeGroup, messages);
  }, [activeGroup, messages, realGroups]);

  // الرسائل غير المقروءة فقط
  const unreadCurrentGroupMessages = useMemo(() => {
    return allCurrentGroupMessages.filter((m) => !isMsgRead(m));
  }, [allCurrentGroupMessages, isMsgRead]);

  // عدد الرسائل المخفية يدوياً في هذه المحادثة
  const hiddenInCurrentGroupCount = useMemo(() => {
    return allCurrentGroupMessages.filter((m) => hiddenMessageIds.has(m.id)).length;
  }, [allCurrentGroupMessages, hiddenMessageIds]);

  // الرسائل المعروضة في الشات مرتبة زمنياً تصاعدياً (الأقدم في الأعلى -> الأحدث والآخر في الأسفل مثل واتساب ويب الرسمي)
  const activeGroupMessages = useMemo(() => {
    let list = hideReadMessages ? unreadCurrentGroupMessages : allCurrentGroupMessages;
    if (!showHiddenMessages) {
      list = list.filter((m) => !hiddenMessageIds.has(m.id));
    }
    const confirmedRequests = new Set(list.map((message) => message.clientRequestId).filter(Boolean));
    const pendingForChat = outgoingImages.filter((item) =>
      (item.chatName === activeGroup || item.chatJid === activeGroup) && !confirmedRequests.has(item.id));
    // WhatsApp can echo our image before the send request returns its message ID.
    // Pair each echo with at most one local preview so it never looks sent twice.
    const unmatchedPending = [...pendingForChat];
    for (const message of [...list].sort((a, b) => getMessageTimestampMs(a) - getMessageTimestampMs(b))) {
      if (!message.isFromMe || message.mediaType !== 'image' || message.clientRequestId) continue;
      const echoAt = getMessageTimestampMs(message);
      const matchIndex = unmatchedPending.findIndex((draft) =>
        draft.uploadState === 'sending' &&
        draft.text === (message.text || '') &&
        echoAt >= draft.timestampMs - 5000 &&
        echoAt <= draft.timestampMs + 120000);
      if (matchIndex !== -1) unmatchedPending.splice(matchIndex, 1);
    }
    return [...list, ...unmatchedPending].sort((a, b) => {
      const tsA = getMessageTimestampMs(a);
      const tsB = getMessageTimestampMs(b);
      return tsA - tsB;
    });
  }, [hideReadMessages, unreadCurrentGroupMessages, allCurrentGroupMessages, hiddenMessageIds, showHiddenMessages, outgoingImages, activeGroup]);
  const readMessagesCount = allCurrentGroupMessages.length - unreadCurrentGroupMessages.length;

  // تنزيل الصور المعروضة في المحادثة المفتوحة، بدءاً بالأحدث. لا نحمّل
  // الصوتيات والمستندات الكبيرة تلقائياً على حساب الصور.
  const autoMediaInFlightRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeGroup) return;
    const pendingMedia = activeGroupMessages.slice(-60).filter(
      (m) =>
        Boolean(m.hasMedia) &&
        (m.mediaType === 'image' || m.mediaType === 'sticker') &&
        !m.mediaUrl &&
        !downloadingMediaIds.includes(m.id) &&
        !failedMediaIds.has(m.id) &&
        !autoMediaInFlightRef.current.has(m.id)
    );
    if (pendingMedia.length === 0) return;

    // Allow the newly opened chat to begin even if another chat still has downloads finishing.
    const currentIds = new Set(activeGroupMessages.map((message) => message.id));
    const currentChatDownloads = [...autoMediaInFlightRef.current].filter((id) => currentIds.has(id)).length;
    const availableSlots = Math.max(0, Math.min(2 - currentChatDownloads, 4 - autoMediaInFlightRef.current.size));
    if (availableSlots === 0) return;
    pendingMedia.slice(-availableSlots).reverse().forEach((m) => {
      autoMediaInFlightRef.current.add(m.id);
      void handleRetryDownloadMedia(m.id, false).finally(() => {
        autoMediaInFlightRef.current.delete(m.id);
      });
    });
  }, [activeGroup, activeGroupMessages, downloadingMediaIds, failedMediaIds]);

  // تحديد عدد الرسائل المعروضة دفعة واحدة في DOM لتفادي التجميد والتأخير في المحادثات الضخمة (الافتراضي 60)
  const [displayMessageLimit, setDisplayMessageLimit] = useState<number>(60);
  useEffect(() => {
    const jumpId = targetJumpMsgIdRef.current;
    if (!jumpId) return;
    const idx = activeGroupMessages.findIndex((m) => m.id === jumpId);
    if (idx === -1) return; // الرسائل قد تصل بعد فتح القروب، فلا نضيع هدف القفز.
    const countFromEnd = activeGroupMessages.length - idx;
    const needed = Math.max(60, countFromEnd + 20);
    if (displayMessageLimit < needed) setDisplayMessageLimit(needed);
    const timer = setTimeout(() => {
      const el = document.getElementById(`msg_${jumpId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-amber-400', 'bg-amber-500/10');
      setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400', 'bg-amber-500/10'), 3500);
      targetJumpMsgIdRef.current = null;
    }, 250);
    return () => clearTimeout(timer);
  }, [activeGroup, activeGroupMessages, displayMessageLimit]);

  const visibleGroupMessages = useMemo(() => {
    if (activeGroupMessages.length <= displayMessageLimit) {
      return activeGroupMessages;
    }
    return activeGroupMessages.slice(-displayMessageLimit);
  }, [activeGroupMessages, displayMessageLimit]);
  const olderMessagesCount = Math.max(0, activeGroupMessages.length - visibleGroupMessages.length);

  const activeChatKey = realGroups.find((group) => group.name === activeGroup || group.id === activeGroup)?.id || activeGroup;
  useEffect(() => {
    if (unreadDivider && unreadDivider.chatKey !== activeChatKey) setUnreadDivider(null);
  }, [activeChatKey, unreadDivider]);
  const unreadStartId = useMemo(() => {
    if (!unreadDivider || unreadDivider.chatKey !== activeChatKey) return null;
    const unreadAtOpen = activeGroupMessages.filter((message) =>
      !isOwnMessage(message) && getMessageTimestampMs(message) <= unreadDivider.openedAt
    );
    return unreadAtOpen.slice(-unreadDivider.unreadCount)[0]?.id || null;
  }, [activeChatKey, activeGroupMessages, unreadDivider]);
  const hasUnreadDivider = Boolean(unreadDivider && unreadDivider.chatKey === activeChatKey);

  // دالة فحص ما إذا كانت الرسالة عبارة عن صورة مؤهلة للألبوم (مثل واتساب)
  const isAlbumImageMsg = useCallback((m: any) => {
    if (!m || m.isDeleted || m.uploadState) return false;
    const url = m.mediaUrl || linkedReceipts[m.id]?.receiptUrl;
    if (!url) return false;
    if (m.mediaType && m.mediaType !== 'image') return false;
    if (url) {
      const lower = url.toLowerCase();
      if (lower.endsWith('.pdf') || lower.includes('.pdf')) return false;
      if (lower.endsWith('.webp') || lower.includes('/stickers/')) return false;
      if (lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm')) return false;
      if (lower.endsWith('.ogg') || lower.endsWith('.m4a') || lower.endsWith('.mp3')) return false;
      if (lower.endsWith('.doc') || lower.endsWith('.docx') || lower.endsWith('.xls') || lower.endsWith('.xlsx')) return false;
    }
    // إذا كان بها نص تفصيلي طويل لحوالة متعددة الحقول لا نجمعها في ألبوم كي تظهر ببطاقتها الخاصة
    if (m.text && m.text.trim().length > 120) return false;
    return true;
  }, [linkedReceipts]);

  // تجميع الصور المتتالية المرسلة معاً في "ألبوم واتساب" (Grouped Images Gallery)
  const groupedMessageItems = useMemo(() => {
    const items: Array<
      | { type: 'single'; msg: any; index: number }
      | { type: 'album'; msgs: any[]; id: string; index: number }
    > = [];

    let currentAlbum: any[] = [];
    let albumStartIndex = 0;

    const flushAlbum = () => {
      if (currentAlbum.length === 1) {
        items.push({ type: 'single', msg: currentAlbum[0], index: albumStartIndex });
      } else if (currentAlbum.length > 1) {
        items.push({
          type: 'album',
          msgs: [...currentAlbum],
          id: `album_${currentAlbum[0].id}`,
          index: albumStartIndex,
        });
      }
      currentAlbum = [];
    };

    for (let i = 0; i < visibleGroupMessages.length; i++) {
      const msg = visibleGroupMessages[i];
      if (isAlbumImageMsg(msg)) {
        if (currentAlbum.length === 0) {
          currentAlbum.push(msg);
          albumStartIndex = i;
        } else {
          const prev = currentAlbum[currentAlbum.length - 1];
          const sameSender =
            Boolean(isOwnMessage(prev)) === Boolean(isOwnMessage(msg)) &&
            getSenderKey(prev) === getSenderKey(msg);
          const t1 = getMessageTimestampMs(msg);
          const t2 = getMessageTimestampMs(prev);
          const timeDiff = t1 && t2 ? Math.abs(t1 - t2) : 0;
          const sameTime = (t1 && t2 && timeDiff <= 90000) || prev.timestamp === msg.timestamp || (!t1 && !t2);
          const sameDay = localMessageDay(t1) === localMessageDay(t2);

          if (sameSender && sameTime && sameDay && msg.id !== unreadStartId) {
            currentAlbum.push(msg);
          } else {
            flushAlbum();
            currentAlbum.push(msg);
            albumStartIndex = i;
          }
        }
      } else {
        flushAlbum();
        items.push({ type: 'single', msg, index: i });
      }
    }
    flushAlbum();
    return items;
  }, [visibleGroupMessages, isAlbumImageMsg, unreadStartId]);

  // فحص وتحليل الرسائل المحددة للتحقق من إمكانية شبك صورة الوصل مع نص الحوالة (أو نصوص متعددة) أو شبك صورتين معاً
  const { selectedImageMsg, selectedTextMsg, selectedTextMsgs, isTwoImagesSelected, canLinkSelected, selectedHasLinkedReceipt } = useMemo(() => {
    const selected = activeGroupMessages.filter((m) => selectedMsgIds.includes(m.id));
    const hasLinked = selected.some((m) => Boolean(linkedReceipts[m.id] || m.linkedReceiptUrl || m.status?.linkedImageUrl));

    if (selected.length < 2) {
      return {
        selectedImageMsg: null,
        selectedTextMsg: null,
        selectedTextMsgs: [] as typeof selected,
        isTwoImagesSelected: false,
        canLinkSelected: false,
        selectedHasLinkedReceipt: hasLinked,
      };
    }

    const imageMsgs = selected.filter((m) => Boolean(m.mediaUrl || m.hasMedia));
    const textMsgs = selected.filter((m) => !m.mediaUrl && !m.hasMedia && Boolean(m.text));

    // حالة 1: صورة واحدة + نص واحد أو نصوص متعددة لحوالات منفصلة (مثلاً إيداع بنكي واحد لعدة متدربين)
    if (imageMsgs.length === 1 && textMsgs.length >= 1) {
      const imgMsg = imageMsgs[0];
      return {
        selectedImageMsg: imgMsg,
        selectedTextMsg: textMsgs[0],
        selectedTextMsgs: textMsgs,
        isTwoImagesSelected: false,
        canLinkSelected: Boolean(imgMsg.mediaUrl),
        selectedHasLinkedReceipt: hasLinked,
      };
    }

    // حالة 2: صورتان محددتان (صورة حوالة + صورة وصل)
    if (selected.length === 2 && imageMsgs.length === 2) {
      const [m1, m2] = imageMsgs;
      return {
        selectedImageMsg: m2,
        selectedTextMsg: m1,
        selectedTextMsgs: [m1],
        isTwoImagesSelected: true,
        canLinkSelected: Boolean(m1.mediaUrl && m2.mediaUrl),
        selectedHasLinkedReceipt: hasLinked,
      };
    }

    return {
      selectedImageMsg: null,
      selectedTextMsg: null,
      selectedTextMsgs: [] as typeof selected,
      isTwoImagesSelected: false,
      canLinkSelected: false,
      selectedHasLinkedReceipt: hasLinked,
    };
  }, [activeGroupMessages, selectedMsgIds, linkedReceipts]);

  const handleLinkSelectedMessages = () => {
    if (!selectedImageMsg) {
      toast.warning('يرجى تحديد رسالة تحتوي على صورة الوصل.', 'تحديد ناقص');
      return;
    }

    const receiptUrl = selectedImageMsg.mediaUrl;
    if (!receiptUrl) {
      toast.warning('الرسالة المحددة كوصل لا تحتوي على صورة جاهزة بعد.', 'تعذر الشبك');
      return;
    }

    // إذا كانت صورتين: نشبكهما ثنائياً (Bidirectional linking) حتى تظل الصورتان مشبوكتين معاً أينما أرسلتا
    if (isTwoImagesSelected && selectedTextMsg?.mediaUrl) {
      setLinkedReceipts((prev) => {
        const updated = {
          ...prev,
          [selectedTextMsg.id]: {
            receiptUrl: receiptUrl,
            linkedMsgId: selectedImageMsg.id,
            timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          },
          [selectedImageMsg.id]: {
            receiptUrl: selectedTextMsg.mediaUrl,
            linkedMsgId: selectedTextMsg.id,
            timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          },
        };
        try {
          localStorage.setItem('hawalat_linked_receipts', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      updateStatus(selectedTextMsg.id, {
        linkedImageUrl: receiptUrl,
        linkedReceiptUrl: receiptUrl,
        linkedMsgId: selectedImageMsg.id,
      });
      updateStatus(selectedImageMsg.id, {
        linkedImageUrl: selectedTextMsg.mediaUrl,
        linkedReceiptUrl: selectedTextMsg.mediaUrl,
        linkedMsgId: selectedTextMsg.id,
      });

      setIsSelectionMode(false);
      setSelectedMsgIds([]);
      toast.success(
        'تم شبك الصورتين معاً بنجاح.\nعند تحويل أو إعادة إرسال أي منهما ستظل مشبوكة بالصورة الأخرى ويتم إرسال الصورتين سوياً.',
        'تم الشبك بنجاح'
      );
      return;
    }

    // شبك صورة الوصل مع نص واحد أو نصوص متعددة لحوالات منفصلة
    const targetTexts = selectedTextMsgs && selectedTextMsgs.length > 0 ? selectedTextMsgs : (selectedTextMsg ? [selectedTextMsg] : []);
    if (targetTexts.length === 0) {
      toast.warning('يرجى تحديد رسالة نصية واحدة على الأقل لشبك الوصل معها.', 'تحديد ناقص');
      return;
    }

    for (const txtMsg of targetTexts) {
      handleLinkReceipt(txtMsg.id, receiptUrl, selectedImageMsg.id);
    }

    setIsSelectionMode(false);
    setSelectedMsgIds([]);

    if (targetTexts.length === 1) {
      const parsed = parseTransferText(targetTexts[0].text, targetTexts[0]);
      const name = parsed.participantName || 'الحوالة';
      toast.success(
        `تم شبك صورة الوصل مع نص حوالة (${name}) بنجاح\nعند التسجيل في أيرتيبل أو التحويل سيتم حفظ وإرسال صورة الوصل مع الحوالة معاً.`,
        'تم الشبك بنجاح'
      );
    } else {
      toast.success(
        `تم شبك صورة الوصل بنجاح مع (${targetTexts.length}) حوالات نصية دفعة واحدة.\nستظل صورة الوصل مشبوكة بجميع هذه الحوالات وتنتقل معها عند التحويل لأي محادثة أخرى ومعتمدة في أيرتيبل.`,
        'تم الشبك بنجاح'
      );
    }
  };

  const handleMergeSelectedImages = async () => {
    if (!selectedImageMsg?.mediaUrl || !selectedTextMsg?.mediaUrl) {
      toast.warning('يرجى تحديد صورتين صالحتين لدمجهما معاً.', 'تنبيه');
      return;
    }

    try {
      toast.info('جاري دمج الصورتين في ملف صورة موحد...', 'دمج الصورتين');
      const combinedDataUrl = await combineTwoImages(
        selectedTextMsg.mediaUrl,
        selectedImageMsg.mediaUrl,
        'الصورة الأولى',
        'الصورة الثانية'
      );

      if (!combinedDataUrl) {
        toast.error('تعذر دمج الصورتين حالياً.', 'خطأ');
        return;
      }

      setPendingMedia({
        file: null as any,
        dataUrl: combinedDataUrl,
        mediaType: 'image',
        fileName: `combined_${Date.now()}.jpg`,
        fileSize: Math.round(combinedDataUrl.length * 0.75),
        caption: 'صورة موحدة مدمجة (حوالة + إيصال)',
      });

      setIsSelectionMode(false);
      setSelectedMsgIds([]);
      toast.success('تم إنشاء الصورة المدمجة بنجاح. يمكنك معاينتها وإرسالها فوراً.', 'جاهزة للإرسال');
    } catch (e: any) {
      toast.error(`حدث خطأ أثناء الدمج: ${e.message}`, 'خطأ في الدمج');
    }
  };

  const handleUnlinkSelectedMessages = () => {
    const selected = activeGroupMessages.filter((m) => selectedMsgIds.includes(m.id));
    let unlinkedCount = 0;
    for (const m of selected) {
      if (linkedReceipts[m.id]) {
        handleUnlinkReceipt(m.id);
        unlinkedCount++;
      }
    }
    setIsSelectionMode(false);
    setSelectedMsgIds([]);
    if (unlinkedCount > 0) {
      toast.info(`تم فك شبك صورة الوصل عن (${unlinkedCount}) حوالة.`, 'فك الشبك');
    }
  };

  // 1. القفز الفوري المباشر (بدون أي أنيميشن إطلاقاً) لآخر رسالة عند فتح المحادثة أو التبديل بين المحادثات ومسح الإشعار
  useEffect(() => {
    if (!activeGroup) return;

    setIsAtBottom(!hasUnreadDivider);
    markChatReadRef.current(activeGroup);

    if (hasUnreadDivider) return;

    // تعيين فوري مباشر لموقع التمرير ليكون عند القاع تماماً
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }

    const t1 = setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
      setIsAtBottom(true);
      markChatReadRef.current(activeGroup);
    }, 20);
    const t2 = setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
      setIsAtBottom(true);
      markChatReadRef.current(activeGroup);
    }, 100);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [activeGroup, hasUnreadDivider]);

  // 2. التمرير التلقائي عند وصول رسائل جديدة أو إرسال رسالة
  useEffect(() => {
    if (!activeGroup) {
      prevMsgCountRef.current = 0;
      return;
    }
    if (hasUnreadDivider) {
      prevMsgCountRef.current = activeGroupMessages.length;
      return;
    }
    if (activeGroupMessages.length > prevMsgCountRef.current) {
      if (prevMsgCountRef.current === 0) {
        scrollToBottom('auto');
        setTimeout(() => scrollToBottom('auto'), 50);
      } else {
        scrollToBottom('smooth');
      }
    }
    prevMsgCountRef.current = activeGroupMessages.length;
  }, [activeGroup, activeGroupMessages.length, hasUnreadDivider]);

  useEffect(() => {
    if (!hasUnreadDivider || !unreadStartId) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById('whatsapp-unread-divider')?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [hasUnreadDivider, unreadStartId]);

  // إرسال رسالة إلى المحادثة المفتوحة عبر واتساب
  // ===== المنشن (@) =====
  const activeGroupJid = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup)?.id || (activeGroup.endsWith('@g.us') ? activeGroup : '');
  const isActiveChatGroup = activeGroupJid.endsWith('@g.us');

  useEffect(() => {
    if (!activeGroupJid || waStatus.status !== 'CONNECTED') return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retries = 0;
    setPresenceLoadingJid(activeGroupJid);
    const refresh = async () => {
      if (document.hidden) return;
      try {
        const response = await fetch(`/api/whatsapp/presence?jid=${encodeURIComponent(activeGroupJid)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!cancelled && response.ok && Array.isArray(data.presences)) {
          setPresenceByJid((current) => ({ ...current, [activeGroupJid]: data.presences }));
          setPresenceNow(Date.now());
          if (data.presences.length > 0) {
            setPresenceLoadingJid(null);
            return;
          }
        }
      } catch {}
      if (!cancelled && retries < 2) {
        retries += 1;
        retryTimer = setTimeout(refresh, 2500);
      } else if (!cancelled) {
        setPresenceLoadingJid(null);
      }
    };
    void refresh();
    const timer = setInterval(() => { setPresenceNow(Date.now()); void refresh(); }, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { cancelled = true; clearInterval(timer); if (retryTimer) clearTimeout(retryTimer); document.removeEventListener('visibilitychange', refresh); };
  }, [activeGroupJid, waStatus.status]);

  const loadMentionParticipants = async () => {
    if (!isActiveChatGroup) return;
    if (mentionParticipants.chatKey === activeGroupJid && (mentionParticipants.list.length > 0 || mentionParticipants.loading)) return;
    setMentionParticipants({ chatKey: activeGroupJid, list: [], loading: true });
    try {
      const res = await fetch(`/api/whatsapp/messages?participants=${encodeURIComponent(activeGroupJid)}`);
      const json = await res.json();
      setMentionParticipants({ chatKey: activeGroupJid, list: json.participants || [], loading: false });
    } catch {
      setMentionParticipants({ chatKey: activeGroupJid, list: [], loading: false });
    }
  };

  useEffect(() => {
    if (isActiveChatGroup && waStatus.status === 'CONNECTED') void loadMentionParticipants();
  // Members are cached by chat key; fetch only when the selected group changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupJid, isActiveChatGroup, waStatus.status]);

  const activePresenceLabel = useMemo(() => {
    if (waStatus.status !== 'CONNECTED') return 'واتساب غير متصل';
    const entries = presenceByJid[activeGroupJid] || [];
    const typing = entries.find((entry) =>
      ['composing', 'recording'].includes(entry.state) && presenceNow - entry.updatedAt < 15_000
    );
    if (typing) {
      const action = typing.state === 'recording' ? 'يسجّل صوتًا...' : 'يكتب الآن...';
      if (!isActiveChatGroup) return action;
      const name = mentionParticipants.chatKey === activeGroupJid
        ? mentionParticipants.list.find((member: any) => member.jid === typing.participant)?.name
        : undefined;
      return name ? `${name} ${action}` : action;
    }
    if (isActiveChatGroup) {
      if (mentionParticipants.chatKey !== activeGroupJid || mentionParticipants.loading) return 'جاري جلب أعضاء المجموعة...';
      const names = mentionParticipants.list.map((member: any) => String(member.name || '').trim()).filter(Boolean);
      return names.length ? `${names.slice(0, 4).join('، ')}${names.length > 4 ? ` +${names.length - 4}` : ''}` : 'مجموعة واتساب';
    }
    const contact = entries.find((entry) => entry.participant === activeGroupJid) || entries[0];
    if (!contact) return presenceLoadingJid === activeGroupJid ? 'جارٍ جلب الحالة...' : 'الحالة غير متاحة';
    if (contact.state === 'available' && presenceNow - contact.updatedAt < 90_000) return 'متصل الآن';
    if (contact.lastSeen && Number.isFinite(contact.lastSeen)) {
      return `آخر ظهور ${new Date(contact.lastSeen).toLocaleString('ar-JO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`;
    }
    return 'الحالة غير متاحة';
  }, [waStatus.status, presenceByJid, activeGroupJid, presenceNow, isActiveChatGroup, mentionParticipants, presenceLoadingJid]);

  const filteredMentionParticipants = useMemo(() => {
    if (!mentionMenu || mentionParticipants.chatKey !== activeGroupJid) return [];
    const q = mentionMenu.query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return mentionParticipants.list
      .filter((p: any) =>
        !q ||
        String(p.name || '').toLowerCase().includes(q) ||
        (qDigits.length >= 2 && String(p.phone || '').replace(/\D/g, '').includes(qDigits))
      )
      .slice(0, 50);
  }, [mentionMenu, mentionParticipants, activeGroupJid]);

  // فحص ما إذا كان المؤشر بعد @ (في بداية كلمة) لفتح قائمة المنشن
  const updateMentionMenu = (text: string, caret: number) => {
    if (!isActiveChatGroup) {
      setMentionMenu(null);
      return;
    }
    const before = text.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at === -1 || (at > 0 && !/\s/.test(before[at - 1]))) {
      setMentionMenu(null);
      return;
    }
    const query = before.slice(at + 1);
    if (query.length > 30 || query.includes('\n')) {
      setMentionMenu(null);
      return;
    }
    setMentionMenu((prev) => ({ start: at, query, index: prev && prev.start === at ? Math.min(prev.index, 49) : 0 }));
    loadMentionParticipants();
  };

  const handleSelectMention = (person: { name: string; jid: string }) => {
    if (!mentionMenu) return;
    const input = messageInputRef.current;
    const currentText = getMessageText();
    const caret = input?.selectionStart ?? currentText.length;
    const inserted = `@${person.name} `;
    const nextText = currentText.slice(0, mentionMenu.start) + inserted + currentText.slice(caret);
    setMessageText(nextText);
    setPendingMentions((prev) => (prev.some((m) => m.jid === person.jid) ? prev : [...prev, { name: person.name, jid: person.jid }]));
    setMentionMenu(null);
    requestAnimationFrame(() => {
      const pos = mentionMenu.start + inserted.length;
      input?.focus();
      input?.setSelectionRange(pos, pos);
    });
  };

  // تحويل "@الاسم" إلى "@الرقم" كما يطلب واتساب، مع قائمة المذكورين
  const buildMentionPayload = (text: string) => {
    let wireText = text;
    const mentions: string[] = [];
    for (const m of [...pendingMentions].sort((a, b) => b.name.length - a.name.length)) {
      const tag = `@${m.name}`;
      if (!wireText.includes(tag)) continue;
      wireText = wireText.split(tag).join(`@${m.jid.split('@')[0].split(':')[0]}`);
      if (!mentions.includes(m.jid)) mentions.push(m.jid);
    }
    return { wireText, mentions };
  };

  const handleSendCustomMessage = async () => {
    const newMessageText = getMessageText();
    if (!newMessageText.trim() || !activeGroup) return;
    setIsSendingMsg(true);
    const nowMs = Date.now();

    let quotedMsgPayload: any = undefined;
    if (replyingToMessage) {
      const quotedImg = replyingToMessage.mediaUrl || linkedReceipts[replyingToMessage.id]?.receiptUrl;
      quotedMsgPayload = {
        id: replyingToMessage.id,
        sender: replyingToMessage.isFromMe || replyingToMessage.sender === 'أنا' ? 'أنا' : replyingToMessage.sender,
        senderName: replyingToMessage.senderName,
        text: replyingToMessage.text?.slice(0, 150) || '',
        hasMedia: Boolean(replyingToMessage.hasMedia || quotedImg),
        mediaUrl: quotedImg,
      };
    }

    const targetGroup = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
    const targetChatJid = targetGroup?.id || messages.find((m) => (m.chatName === activeGroup || m.senderName === activeGroup) && m.chatJid)?.chatJid;

    const newMsg = {
      id: `msg_real_${nowMs}`,
      sender: 'أنا',
      senderName: 'أنا',
      chatName: activeGroup,
      chatJid: targetChatJid,
      text: newMessageText.trim(),
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      timestampMs: nowMs,
      isFromMe: true,
      deliveryStatus: 'pending',
      isForwarded: false,
      status: {},
      quotedMessage: quotedMsgPayload,
    };

    // المنشن: النص المرسل لواتساب يحمل @الرقم، بينما يظهر عندنا @الاسم
    const { wireText, mentions } = buildMentionPayload(newMsg.text);

    // 1. إظهار الرسالة فورياً في الشات مع علامة الساعة (Optimistic UI) كواتساب الحقيقي
    setMessages((prev) => [newMsg, ...prev]);
    setMessageText('');
    setPendingMentions([]);
    setMentionMenu(null);
    setReplyingToMessage(null);
    setTimeout(() => scrollToBottom('smooth'), 40);

    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          message: mentions.length > 0 ? { ...newMsg, text: wireText, mentions } : newMsg,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } else {
        toast.warning(data.message || 'تعذر إرسال الرسالة عبر واتساب حالياً، ستبقى قيد الانتظار', 'تنبيه الإرسال');
      }
    } catch (e: any) {
      toast.error(`انقطع الاتصال أثناء الإرسال: ${e.message}`, 'تنبيه الاتصال');
    } finally {
      setIsSendingMsg(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingMessage) return;
    const rawText = getMessageText();
    const trimmed = rawText.trim();
    if (!trimmed) {
      toast.warning('لا يمكن ترك الرسالة فارغة بعد التعديل', 'تنبيه');
      return;
    }
    if (trimmed === editingMessage.text) {
      handleCancelEdit();
      return;
    }

    setIsEditingSaving(true);
    const targetId = editingMessage.id;
    const origText = editingMessage.originalText || editingMessage.text;

    // تحديث فوري ولحظي في الواجهة (Optimistic UI Update)
    setMessages((prev) =>
      prev.map((m) =>
        m.id === targetId || m.rawBaileysMessage?.key?.id === targetId
          ? {
              ...m,
              originalText: origText,
              text: trimmed,
              isEdited: true,
              editedAt: Date.now(),
            }
          : m
      )
    );

    handleCancelEdit();

    try {
      const { wireText, mentions } = buildMentionPayload(trimmed);
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit',
          id: targetId,
          text: wireText,
          mentions: mentions.length > 0 ? mentions : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success(data.message || 'تم تعديل الرسالة بنجاح في التطبيق وعلى واتساب', 'تعديل الرسالة');
        if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } else {
        toast.warning(data.message || 'تم التعديل محلياً فقط', 'تعديل الرسالة');
      }
    } catch (err: any) {
      toast.error(`تعذر حفظ التعديل على الخادم: ${err.message}`, 'خطأ في التعديل');
    } finally {
      setIsEditingSaving(false);
    }
  };

  const handleDeleteOnWhatsApp = async (msgId: string) => {
    // وسم فوري للرسالة في الواجهة كمحذوفة في واتساب مع بقائها في مكانها
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId || m.rawBaileysMessage?.key?.id === msgId
          ? { ...m, isDeleted: true, deletedAt: Date.now() }
          : m
      )
    );

    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_whatsapp',
          id: msgId,
          forEveryone: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success(data.message || 'تم حذف الرسالة لدى الجميع في واتساب بنجاح', 'حذف من واتساب');
      } else {
        toast.warning(data.message || 'تم وسم الرسالة كمحذوفة محلياً', 'حذف الرسالة');
      }
    } catch (err: any) {
      toast.error(`تعذر إرسال أمر الحذف إلى واتساب: ${err.message}`, 'خطأ');
    }
  };

  // قائمة المجموعات والمحادثات الفعلية مرتبة تماماً حسب وقت آخر رسالة (مفهرسة O(N) مرة واحدة بدلاً من O(N²))
  const groupsList = useMemo(() => {
    const list: {
      name: string;
      id?: string;
      subtitle: string;
      time: string;
      unread: number;
      isGroup: boolean;
      lastTimestamp: number;
      avatarUrl?: string;
      phone?: string;
      latestMsg?: any;
      archived?: boolean;
    }[] = [];
    const seenNames = new Set<string>();
    const seenJids = new Set<string>();
    const seenPhones = new Set<string>();

    // فهرسة سريعة للرسائل حسب المحادثة O(N) مرة واحدة لتجنب تكرار المسح ملايين المرات
    const msgsByChatId = new Map<string, any[]>();
    const msgsByChatName = new Map<string, any[]>();

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.chatJid) {
        let arr = msgsByChatId.get(m.chatJid);
        if (!arr) {
          arr = [];
          msgsByChatId.set(m.chatJid, arr);
        }
        arr.push(m);
      }
      const cName = m.chatName || m.senderName;
      if (cName) {
        let arr = msgsByChatName.get(cName);
        if (!arr) {
          arr = [];
          msgsByChatName.set(cName, arr);
        }
        arr.push(m);
      }
    }

    const getMsgsForGroup = (rgName?: string, rgId?: string, rgPhone?: string) => {
      const res: any[] = [];
      const addedIds = new Set<string>();
      if (rgId && msgsByChatId.has(rgId)) {
        for (const m of msgsByChatId.get(rgId)!) {
          if (!addedIds.has(m.id)) {
            addedIds.add(m.id);
            res.push(m);
          }
        }
      }
      if (rgName && msgsByChatName.has(rgName)) {
        for (const m of msgsByChatName.get(rgName)!) {
          if (rgId && m.chatJid) continue;
          if (!addedIds.has(m.id)) {
            addedIds.add(m.id);
            res.push(m);
          }
        }
      }
      if (rgPhone && msgsByChatName.has(rgPhone)) {
        for (const m of msgsByChatName.get(rgPhone)!) {
          if (rgId && m.chatJid) continue;
          if (!addedIds.has(m.id)) {
            addedIds.add(m.id);
            res.push(m);
          }
        }
      }
      return res;
    };

    // 1. إضافة المجموعات والمحادثات الرسمية من realGroups أولاً
    for (const rg of realGroups) {
      if (!rg.name) continue;
      const jid = rg.id;
      const cleanPhone = rg.phone ? rg.phone.replace(/\D/g, '') : '';
      const rawDigits = jid ? jid.split('@')[0].replace(/\D/g, '') : '';
      const isGrp = rg.isGroup ?? (rg.id ? rg.id.endsWith('@g.us') : true);
      const groupMsgs = getMsgsForGroup(rg.name, rg.id, rg.phone);

      // Contacts can arrive from WhatsApp without a chat. Keep an empty chat only
      // while it is open or while WhatsApp reports unread messages for it.
      if (!isGrp && groupMsgs.length === 0 && !rg.unreadCount && activeGroup !== rg.name && activeGroup !== rg.id) continue;

      // منع أي تكرار بالـ JID أو الاسم أو رقم الهاتف
      if (jid && seenJids.has(jid)) continue;
      if (!jid && seenNames.has(rg.name)) continue;
      if (cleanPhone && cleanPhone.length >= 7 && seenPhones.has(cleanPhone)) continue;

      if (jid) seenJids.add(jid);
      if (rg.name) seenNames.add(rg.name);
      if (cleanPhone && cleanPhone.length >= 7) seenPhones.add(cleanPhone);
      if (rawDigits && rawDigits.length >= 7) seenPhones.add(rawDigits);

      let latestMsg: any = null;
      let highestTs = 0;
      let unreadCount = 0;
      for (let i = 0; i < groupMsgs.length; i++) {
        const m = groupMsgs[i];
        const ts = getMessageTimestampMs(m);
        if (ts > highestTs) {
          highestTs = ts;
          latestMsg = m;
        }
        if (!isMsgRead(m)) {
          unreadCount++;
        }
      }
      if (!latestMsg && groupMsgs.length > 0) {
        latestMsg = groupMsgs[0];
        highestTs = getMessageTimestampMs(latestMsg);
      }

      let subtitle = isGrp ? 'مجموعة واتساب' : 'محادثة خاصة';
      if (latestMsg) {
        if (latestMsg.isDeleted) {
          subtitle = 'تم حذف هذه الرسالة';
        } else if (latestMsg.text?.trim()) {
          subtitle = (latestMsg.isEdited ? '(معدلة) ' : '') + latestMsg.text.trim().substring(0, 36) + (latestMsg.text.length > 36 ? '...' : '');
        } else if (latestMsg.hasMedia) {
          subtitle = 'صورة إيصال / مستند';
        }
      }

      const formattedTime = formatWhatsAppChatTime(highestTs, latestMsg ? latestMsg.timestamp : '');

      const isManuallyUnread =
        markedUnreadChatKeys.has(rg.name) ||
        (rg.id && markedUnreadChatKeys.has(rg.id));
      const isChatRead =
        !isManuallyUnread &&
        (readChatKeys.has(rg.name) ||
        (rg.id && readChatKeys.has(rg.id)) ||
        activeGroup === rg.name);
      const finalUnread = isManuallyUnread ? Math.max(1, rg.unreadCount || unreadCount || 1) : (isChatRead ? 0 : Math.max(rg.unreadCount || 0, unreadCount));

      list.push({
        name: rg.name,
        id: rg.id,
        subtitle,
        time: formattedTime,
        unread: finalUnread,
        isGroup: isGrp,
        lastTimestamp: highestTs,
        avatarUrl: rg.avatarUrl,
        phone: rg.phone,
        latestMsg,
        archived: typeof rg.archived === 'boolean' ? rg.archived : undefined,
      });
    }

    // 2. فحص الرسائل لإضافة أي محادثة فردية لم تكن موجودة في realGroups دون تكرار
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const jid = m.chatJid;
      const cName = m.chatName || m.senderName;
      if (!cName && !jid) continue;

      const cleanPhone = cName ? cName.replace(/\D/g, '') : '';
      const rawDigits = jid ? jid.split('@')[0].replace(/\D/g, '') : '';

      // فحص صارم: هل الـ JID أو الاسم أو رقم الهاتف مسجل بالفعل في القائمة؟
      if (jid && seenJids.has(jid)) continue;
      if (!jid && cName && seenNames.has(cName)) continue;
      if (cleanPhone && cleanPhone.length >= 7 && seenPhones.has(cleanPhone)) continue;
      if (rawDigits && rawDigits.length >= 7 && seenPhones.has(rawDigits)) continue;

      // فحص إضافي: هل هذا الـ JID أو الرقم موجود في realGroups تحت اسم آخر؟
      const matchedRg = realGroups.find(
        (rg) => (jid && rg.id === jid) || (cleanPhone && cleanPhone.length >= 7 && rg.phone && rg.phone.replace(/\D/g, '') === cleanPhone)
      );
      if (matchedRg) {
        continue;
      }

      if (jid) seenJids.add(jid);
      if (cName) seenNames.add(cName);
      if (cleanPhone && cleanPhone.length >= 7) seenPhones.add(cleanPhone);
      if (rawDigits && rawDigits.length >= 7) seenPhones.add(rawDigits);

      const isGrp = Boolean(m.chatJid ? m.chatJid.endsWith('@g.us') : false);
      const groupMsgs = getMsgsForGroup(cName, m.chatJid);

      let latestMsg: any = null;
      let highestTs = 0;
      let unreadCount = 0;
      for (let j = 0; j < groupMsgs.length; j++) {
        const msg = groupMsgs[j];
        const ts = getMessageTimestampMs(msg);
        if (ts > highestTs) {
          highestTs = ts;
          latestMsg = msg;
        }
        if (!isMsgRead(msg)) {
          unreadCount++;
        }
      }
      if (!latestMsg && groupMsgs.length > 0) {
        latestMsg = groupMsgs[0];
        highestTs = getMessageTimestampMs(latestMsg);
      }

      let subtitle = isGrp ? 'مجموعة واتساب' : 'محادثة خاصة';
      if (latestMsg) {
        if (latestMsg.isDeleted) {
          subtitle = 'تم حذف هذه الرسالة';
        } else if (latestMsg.text?.trim()) {
          subtitle = (latestMsg.isEdited ? '(معدلة) ' : '') + latestMsg.text.trim().substring(0, 36) + (latestMsg.text.length > 36 ? '...' : '');
        } else if (latestMsg.hasMedia) {
          subtitle = 'صورة إيصال / مستند';
        }
      }

      const formattedTime = formatWhatsAppChatTime(highestTs, latestMsg ? latestMsg.timestamp : '');
      const matchedGroup = realGroups.find((rg) => rg.name === cName || rg.id === m.chatJid);

      const isManuallyUnread =
        markedUnreadChatKeys.has(cName) ||
        (m.chatJid && markedUnreadChatKeys.has(m.chatJid));
      const isChatRead =
        !isManuallyUnread &&
        (readChatKeys.has(cName) ||
        (m.chatJid && readChatKeys.has(m.chatJid)) ||
        activeGroup === cName);
      const finalUnread = isManuallyUnread ? Math.max(1, unreadCount || 1) : (isChatRead ? 0 : unreadCount);

      list.push({
        name: cName,
        id: m.chatJid || cName,
        subtitle,
        time: formattedTime,
        unread: finalUnread,
        isGroup: isGrp,
        lastTimestamp: highestTs,
        avatarUrl: matchedGroup?.avatarUrl,
        phone: matchedGroup?.phone,
        archived: typeof matchedGroup?.archived === 'boolean' ? matchedGroup.archived : undefined,
      });
    }

    // فرز القائمة:
    // 1. المحادثات المثبتة أولاً (Pinned chats)
    // 2. الترتيب حسب وقت أحدث رسالة تنازلياً (من الأحدث إلى الأقدم)
    return list.sort((a, b) => {
      const aKey = a.id || a.name;
      const bKey = b.id || b.name;
      const aPinned = pinnedChatKeys.has(aKey) || pinnedChatKeys.has(a.name);
      const bPinned = pinnedChatKeys.has(bKey) || pinnedChatKeys.has(b.name);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      if (b.lastTimestamp !== a.lastTimestamp) {
        return b.lastTimestamp - a.lastTimestamp;
      }
      if (b.unread !== a.unread) {
        return b.unread - a.unread;
      }
      return a.name.localeCompare(b.name, 'ar');
    });
  }, [realGroups, messages, isMsgRead, readChatKeys, activeGroup, pinnedChatKeys, markedUnreadChatKeys]);

  // قائمة جميع المحادثات والمجموعات المتاحة للتحويل بدون تكرار
  const allForwardableChats = useMemo(() => {
    const map = new Map<string, { id: string; name: string; avatarUrl?: string; isGroup?: boolean; subtitle?: string }>();
    for (const rg of realGroups) {
      if (!rg || !rg.name) continue;
      map.set(rg.name, {
        id: rg.id || rg.name,
        name: rg.name,
        isGroup: true,
        subtitle: 'مجموعة واتساب متصلة',
      });
    }
    for (const gl of groupsList) {
      if (!gl || !gl.name) continue;
      const existing = map.get(gl.name);
      map.set(gl.name, {
        id: gl.id || gl.name,
        name: gl.name,
        avatarUrl: gl.avatarUrl || existing?.avatarUrl,
        isGroup: gl.isGroup ?? existing?.isGroup ?? true,
        subtitle: existing?.subtitle || (gl.isGroup ? 'مجموعة واتساب' : 'محادثة خاصة'),
      });
    }
    return Array.from(map.values());
  }, [realGroups, groupsList]);

  // التحقق مما إذا كانت المحادثة النشطة حالياً هي مجموعة (قروب)
  const isCurrentChatGroup = useMemo(() => {
    if (!activeGroup) return false;
    const fromList = groupsList.find((g) => g.name === activeGroup);
    if (fromList) return Boolean(fromList.isGroup);
    const fromReal = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
    if (fromReal) return Boolean(fromReal.isGroup);
    return false;
  }, [activeGroup, groupsList, realGroups]);

  // تصفية المحادثات والرسائل بنظام البحث المطابق تماماً لواتساب (Image 2)
  const searchResults = useMemo(() => {
    const rawQ = searchQuery.trim();
    if (!rawQ) {
      return {
        isSearching: false,
        matchingChats: [] as typeof groupsList,
        matchingMessages: [] as Array<{
          id: string;
          chatName: string;
          chatJid?: string;
          timestampMs: number;
          dateFormatted: string;
          senderName: string;
          isFromMe: boolean;
          text: string;
          snippet: string;
        }>,
      };
    }

    const normQ = normalizeSearchText(rawQ);
    const cleanDigitsQ = rawQ.replace(/\D/g, '');
    // البحث بالأرقام فقط إذا أدخل المستخدم استعلاماً رقمياً خالصاً (مثل أرقام هواتف أو مبالغ) وليس نصاً أو إيميل
    const isPureDigitsQuery = /^[+0-9\s\-()]+$/.test(rawQ) && cleanDigitsQ.length >= 3;

    // 1. المحادثات والمجموعات المطابقة بالاسم أو رقم الهاتف (قسم المحادثات Chats)
    const matchingChats = groupsList.filter((g) => {
      if (chatFilterTab === 'groups' && !g.isGroup) return false;
      if (chatFilterTab === 'direct' && g.isGroup) return false;
      if (chatFilterTab === 'unread' && (g.unread || 0) === 0) return false;
      if (selectedTagFilter) {
        const chatKey = g.id || g.name;
        const record = crmData[chatKey] || crmData[g.name];
        if (!record || !record.tags || !record.tags.includes(selectedTagFilter)) return false;
      }

      const normName = normalizeSearchText(g.name);
      const cleanPhone = (g.phone || '').replace(/\D/g, '');

      if (normName.includes(normQ)) return true;
      if (isPureDigitsQuery && cleanPhone.includes(cleanDigitsQ)) return true;
      return false;
    });

    // 2. الرسائل المطابقة داخل كل محادثة (قسم الرسائل Messages كما في واتساب الأصلي تماماً)
    const matchingMessages: Array<{
      id: string;
      chatName: string;
      chatJid?: string;
      timestampMs: number;
      dateFormatted: string;
      senderName: string;
      isFromMe: boolean;
      text: string;
      snippet: string;
    }> = [];

    const chatFilterMap = new Map<string, { isGroup?: boolean; unread?: number }>();
    for (const g of groupsList) {
      chatFilterMap.set(g.name, { isGroup: g.isGroup, unread: g.unread });
      if (g.id) chatFilterMap.set(g.id, { isGroup: g.isGroup, unread: g.unread });
    }

    // فحص كافة الرسائل لجمع المطابقات من جميع المحادثات
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const text = m.text || '';
      if (!text) continue;

      const normText = normalizeSearchText(text);
      const sender = normalizeSearchText(m.sender || m.senderName || '');

      let isMatch = false;
      if (normText.includes(normQ) || sender.includes(normQ)) {
        isMatch = true;
      } else if (isPureDigitsQuery) {
        const cleanMsgText = text.replace(/\D/g, '');
        if (cleanMsgText.includes(cleanDigitsQ)) {
          isMatch = true;
        }
      }

      if (isMatch) {
        const chatName = m.chatName || m.chatJid || '';
        const chatMeta = chatFilterMap.get(chatName) || (m.chatJid ? chatFilterMap.get(m.chatJid) : undefined);

        if (chatFilterTab === 'groups' && chatMeta && !chatMeta.isGroup) continue;
        if (chatFilterTab === 'direct' && chatMeta && chatMeta.isGroup) continue;

        const ts = getMessageTimestampMs(m);
        const dateFormatted = formatSearchDate(ts, m.timestamp);

        // تنظيف النص وتكوين المقتطف كواتساب
        const cleanText = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
        let snippet = cleanText;
        if (cleanText.length > 95) {
          const idx = normText.indexOf(normQ);
          if (idx !== -1 && idx > 50) {
            const start = Math.max(0, idx - 20);
            const end = Math.min(cleanText.length, idx + normQ.length + 45);
            snippet = (start > 0 ? '...' : '') + cleanText.slice(start, end) + (end < cleanText.length ? '...' : '');
          } else {
            snippet = cleanText.slice(0, 90) + '...';
          }
        }

        const isFromMe = Boolean(m.isFromMe || m.fromMe);
        const senderName = isFromMe ? 'أنت' : (m.senderName || m.sender || '');

        matchingMessages.push({
          id: m.id,
          chatName,
          chatJid: m.chatJid,
          timestampMs: ts,
          dateFormatted,
          senderName,
          isFromMe,
          text,
          snippet,
        });
      }
    }

    // فرز الرسائل المطابقة تنازلياً بدقة متناهية: الأحدث وصولاً وتوقيتاً وتاريخاً في الأعلى، ثم التدرج نزولاً نحو الأقدم
    matchingMessages.sort((a, b) => b.timestampMs - a.timestampMs);

    // تحديد الحد الأقصى للعرض بـ 100 رسالة بعد الفرز لضمان الحصول على أحدث الرسائل دائماً
    const sortedMatchingMessages = matchingMessages.slice(0, 100);

    return {
      isSearching: true,
      matchingChats,
      matchingMessages: sortedMatchingMessages,
    };
  }, [searchQuery, groupsList, messages, chatFilterTab, selectedTagFilter, crmData]);

  // القائمة العادية لكافة المحادثات عند عدم تفعيل البحث
  const filteredGroupsList = useMemo(() => {
    return groupsList.filter((g) => {
      const chatKey = g.id || g.name;
      const isArchived = typeof g.archived === 'boolean'
        ? g.archived
        : archivedChatKeys.has(chatKey) || archivedChatKeys.has(g.name);

      // إذا تم اختيار فلتر المؤرشفة، نعرض فقط المحادثات المؤرشفة
      if (chatFilterTab === 'archived') {
        return isArchived;
      }

      // في أي تبويب آخر، نخفي المحادثات المؤرشفة من القائمة الرئيسية
      if (isArchived) return false;

      if (chatFilterTab === 'groups' && !g.isGroup) return false;
      if (chatFilterTab === 'direct' && g.isGroup) return false;
      if (chatFilterTab === 'unread') {
        if ((g.unread || 0) === 0) return false;
      }
      if (chatFilterTab === 'favorites') {
        const isFav = favoriteChatKeys.has(chatKey) || favoriteChatKeys.has(g.name);
        if (!isFav) return false;
      }
      if (chatFilterTab.startsWith('list:')) {
        const listName = chatFilterTab.slice(5);
        const members = customLists[listName] || [];
        if (!members.includes(chatKey) && !members.includes(g.name)) return false;
      }

      if (selectedTagFilter) {
        const record = crmData[chatKey] || crmData[g.name];
        if (!record || !record.tags || !record.tags.includes(selectedTagFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [groupsList, chatFilterTab, selectedTagFilter, crmData, archivedChatKeys, favoriteChatKeys, customLists]);

  useEffect(() => {
    setVisibleChatCount(80);
  }, [chatFilterTab, selectedTagFilter]);

  const archivedCount = useMemo(() => {
    return groupsList.filter((g) => {
      const chatKey = g.id || g.name;
      return typeof g.archived === 'boolean'
        ? g.archived
        : archivedChatKeys.has(chatKey) || archivedChatKeys.has(g.name);
    }).length;
  }, [groupsList, archivedChatKeys]);

  // دالة عرض فقاعة ألبوم الصور المجمعة بنظام واتساب الأصلي (2x2 grid أو قسمين أو 3 أقسام)
  const renderAlbumMessage = (item: { msgs: any[]; id: string; index: number }, itemIdx: number) => {
    const { msgs, id } = item;
    const firstMsg = msgs[0];
    const lastMsg = msgs[msgs.length - 1];
    const isFromMe = Boolean(
      firstMsg.sender === 'أنا' ||
      firstMsg.senderName === 'أنا' ||
      firstMsg.rawBaileysMessage?.key?.fromMe ||
      (firstMsg as any).isFromMe
    );
    const isGroupChat = isActiveChatGroup;
    const prevItem = groupedMessageItems[itemIdx - 1];
    const prevMsg = prevItem ? (prevItem.type === 'album' ? prevItem.msgs[prevItem.msgs.length - 1] : prevItem.msg) : null;
    const isFirstOfSenderRun = !prevMsg || isOwnMessage(prevMsg) || getSenderKey(prevMsg) !== getSenderKey(firstMsg);
    const showGroupAvatar = isGroupChat && !isFromMe;
    const senderColor = getSenderColor(getSenderKey(firstMsg));

    const isAlbumSelected = msgs.some((m) => selectedMsgIds.includes(m.id));
    const allAlbumSelected = msgs.every((m) => selectedMsgIds.includes(m.id));

    // استخراج تعليق الرسالة إن وجد في أي من صور الألبوم
    const albumCaption = msgs.find((m) => m.text && !['ملصق', 'صورة', 'مقطع فيديو', 'تسجيل صوتي', 'مقطع صوتي'].includes(m.text.trim()))?.text;

    const senderAvatarEl = showGroupAvatar ? (
      <div className="w-7 shrink-0 mt-0.5">
        {isFirstOfSenderRun &&
          (firstMsg.senderAvatarUrl ? (
            <img src={firstMsg.senderAvatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
          ) : (
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={{ backgroundColor: senderColor + '33', color: senderColor }}
            >
              {(firstMsg.sender || '?').trim().charAt(0)}
            </div>
          ))}
      </div>
    ) : null;

    const handleSlotClick = (e: React.MouseEvent, m: any) => {
      e.stopPropagation();
      if (isMediaCurrentlyDragging()) return;
      if (isSelectionMode) {
        handleToggleSelectMsg(m.id);
      } else {
        openLightbox(m, undefined, msgs);
      }
    };

    // دالة رسم فتحة الصورة داخل الألبوم مع دعم كامل لحالات التنزيل والأخطاء وإعادة المحاولة
    const renderAlbumSlot = (
      m: any,
      idx: number,
      slotHeightClass: string,
      isLastSlot: boolean,
      extraOverlay?: React.ReactNode
    ) => {
      const u = m.mediaUrl || linkedReceipts[m.id]?.receiptUrl;
      const isDownloading = downloadingMediaIds.includes(m.id);
      const isFailed = failedMediaIds.has(m.id);
      const hasValidImage = Boolean(u && !isFailed);

      return (
        <div
          key={m.id}
          id={`msg_${m.id}`}
          draggable={hasValidImage}
          onDragStart={(e) => {
            if (u) handleMediaDragStart(e, u, { fileName: `whatsapp_album_${m.id}.jpg` });
          }}
          onDragEnd={handleMediaDragEnd}
          onClick={(e) => {
            if (!hasValidImage) {
              e.stopPropagation();
              handleRetryDownloadMedia(m.id);
              return;
            }
            handleSlotClick(e, m);
          }}
          onContextMenu={(e) => {
            e.stopPropagation();
            handleContextMenu(e, m);
          }}
          className={`relative ${slotHeightClass} w-full overflow-hidden rounded-lg cursor-grab active:cursor-grabbing group/item bg-[#182229] flex items-center justify-center`}
          title={hasValidImage ? 'اسحب الصورة لسطح المكتب أو انقر للتكبير' : 'انقر لتنزيل وتحميل الصورة'}
        >
          {hasValidImage ? (
            <NextImage
              src={u}
              alt={`صورة ${idx + 1}`}
              width={350}
              height={350}
              sizes="(max-width: 640px) 45vw, 175px"
              unoptimized
              className="w-full h-full object-cover group-hover/item:brightness-105 transition-all select-none pointer-events-none"
              loading={activeGroupMessages.slice(-10).some((item) => item.id === m.id) ? 'eager' : 'lazy'}
              draggable={false}
              onError={() => {
                setFailedMediaIds((prev) => new Set(prev).add(m.id));
              }}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-[#182229] border border-[#2a3942] rounded-lg select-none gap-1.5">
              <div className="w-8 h-8 rounded-full bg-[#202c33] border border-[#2e2f2f] flex items-center justify-center text-[#21c063]">
                {isDownloading ? (
                  <RotateCw className="w-4 h-4 animate-spin text-sky-400" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-[#8696a0]" />
                )}
              </div>
              <button
                type="button"
                disabled={isDownloading}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetryDownloadMedia(m.id);
                }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#202c33] hover:bg-[#2a3942] border border-[#2e2f2f] text-[11px] font-bold text-sky-400 hover:text-white cursor-pointer transition-colors shadow-xs"
              >
                <RotateCw className={`w-3 h-3 ${isDownloading ? 'animate-spin' : ''}`} />
                <span>{isDownloading ? 'جاري التنزيل...' : 'تنزيل الصورة'}</span>
              </button>
            </div>
          )}

          {extraOverlay}

          {linkedReceipts[m.id] && (
            <div className="absolute top-1.5 left-1.5 bg-black/75 backdrop-blur-xs text-emerald-300 text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-emerald-500/40 shadow-xs z-10 pointer-events-none">
              <Link2 className="w-2.5 h-2.5 text-emerald-400" />
              <span>وصل</span>
            </div>
          )}

          {isLastSlot && (
            <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-[10px] text-white/95 flex items-center gap-1 select-none font-sans z-10 pointer-events-none shadow-sm">
              <span>{lastMsg.timestamp}</span>
              {renderMessageStatusTicks(lastMsg)}
            </div>
          )}
        </div>
      );
    };

    return (
      <div
        key={id}
        id={`msg_${firstMsg.id}`}
        className={`w-full flex ${isFromMe ? 'justify-start' : 'justify-end'} group select-none my-1 transition-all duration-200 ${
          isAlbumSelected ? 'bg-[#005c4b]/20 -mx-3 px-3 py-1 rounded-lg' : ''
        }`}
      >
        <div
          className={`relative flex items-start gap-2 w-fit max-w-[85%] sm:max-w-[75%] lg:max-w-[520px] ${
            isFromMe ? 'ml-auto mr-0' : 'mr-auto ml-0 flex-row-reverse'
          }`}
        >
          {!isFromMe && senderAvatarEl}

          {/* فقاعة ألبوم الصور المجمعة المطابقة تماماً لواتساب */}
          <div
            onContextMenu={(e) => handleContextMenu(e, firstMsg)}
            {...getMsgTouchProps(firstMsg, false)}
            onDoubleClick={() => handleStartReply(firstMsg)}
            onClick={() => {
              if (isSelectionMode) {
                if (allAlbumSelected) {
                  const toRemove = new Set(msgs.map((m) => m.id));
                  setSelectedMsgIds((prev) => prev.filter((id) => !toRemove.has(id)));
                } else {
                  const toAdd = msgs.map((m) => m.id);
                  setSelectedMsgIds((prev) => Array.from(new Set([...prev, ...toAdd])));
                }
              }
            }}
            className={`relative rounded-2xl p-1 overflow-hidden shadow-md transition-all touch-pan-y w-[280px] sm:w-[320px] md:w-[350px] max-w-[85vw] ${
              isFromMe
                ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-xs'
                : 'bg-[#202c33] text-[#e9edef] rounded-tl-xs'
            } ${isAlbumSelected ? '!bg-[#025144]/80 ring-2 ring-[#00a884]' : 'border border-white/[0.08]'}`}
          >
            {/* رأس اسم المرسل في المجموعات */}
            {isGroupChat && !isFromMe && isFirstOfSenderRun && (
              <div className="text-[12px] font-bold px-2 pt-1 pb-1 select-none" style={{ color: senderColor }}>
                <bdi>{firstMsg.sender}</bdi>
              </div>
            )}

            {/* شبكة الصور: قسمين أو 3 أقسام أو 4 أقسام مع إمكانية البلور للصور الإضافية (+N) */}
            {msgs.length === 2 ? (
              <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden w-full">
                {msgs.slice(0, 2).map((m, idx) => renderAlbumSlot(m, idx, 'h-44 sm:h-52', idx === 1))}
              </div>
            ) : msgs.length === 3 ? (
              <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden w-full">
                <div className="col-span-2 w-full">
                  {renderAlbumSlot(msgs[0], 0, 'h-40 sm:h-44', false)}
                </div>
                {msgs.slice(1, 3).map((m, idx) => renderAlbumSlot(m, idx + 1, 'h-32 sm:h-36', idx === 1))}
              </div>
            ) : (
              /* 4 صور أو أكثر: شبكة 2x2 من أربعة أقسام بالضبط كواتساب */
              <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden w-full">
                {msgs.slice(0, 3).map((m, idx) => renderAlbumSlot(m, idx, 'h-32 sm:h-36', false))}

                {msgs.length === 4 ? (
                  renderAlbumSlot(msgs[3], 3, 'h-32 sm:h-36', true)
                ) : (
                  renderAlbumSlot(
                    msgs[3],
                    3,
                    'h-32 sm:h-36',
                    false,
                    <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex flex-col items-center justify-center transition-colors group-hover/more:bg-black/45 pointer-events-none">
                      <span className="text-white text-3xl sm:text-4xl font-extrabold tracking-wider font-sans drop-shadow-md">
                        +{msgs.length - 3}
                      </span>
                      <span className="text-[10px] text-white/85 font-medium select-none mt-0.5">
                        عرض الكل
                      </span>
                    </div>
                  )
                )}
              </div>
            )}

            {/* التعليق إن وجد أسفل الألبوم */}
            {albumCaption && (
              <div className="px-2 pt-1.5 pb-1 text-[13.5px] leading-relaxed text-[#fafafa] whitespace-pre-wrap break-words font-sans" dir="auto">
                {renderMessageTextWithMentions(albumCaption, { onPhoneClick: openPhoneMenu, highlightQuery: searchQuery })}
              </div>
            )}

            {/* التفاعلات في زاوية الألبوم */}
            {msgs.some((m) => m.reactions && Object.keys(m.reactions).length > 0) && (
              <div className="flex items-center gap-1 px-1 pt-0.5">
                {msgs.map((m) => renderMessageReactions(m, isFromMe))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full bg-[#161717] flex flex-col md:flex-row font-sans select-none overflow-hidden" dir="rtl">
      {/* القائمة الجانبية للمحادثات (شريط واتساب الجانبي الممتد عمودياً بالكامل) */}
      <div className={`${isPopoutMode ? 'hidden' : activeGroup ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-[380px] bg-[#161717] border-l border-[#2e2f2f] flex-col shrink-0 h-full`}>
        {/* رأس الشريط الجانبي مع حالة الاتصال الحية المباشرة */}
        <div className="px-3.5 py-3 bg-[#161717] flex items-center justify-between gap-2 border-b border-[#2e2f2f] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-10 h-10 rounded-full bg-[#21c063] flex items-center justify-center text-white font-bold text-sm shadow-xs">
                وا
              </div>
              {/* مؤشر حالة الاتصال المباشر على صورة البروفايل */}
              <span
                className={`absolute bottom-0 left-0 w-3 h-3 rounded-full border-2 border-[#161717] ${
                  waStatus.status === 'CONNECTED'
                    ? 'bg-emerald-500 animate-pulse'
                    : waStatus.status === 'SCAN_QR'
                    ? 'bg-amber-400 animate-ping'
                    : waStatus.status === 'CONNECTING'
                    ? 'bg-blue-400'
                    : 'bg-rose-500'
                }`}
              />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-[#fafafa] truncate">
                  {waStatus.user?.name ? `واتساب: ${waStatus.user.name}` : 'واتساب الحوالات'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {waStatus.status === 'CONNECTED' ? (
                  <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1 whitespace-nowrap">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>متصل (<bdi dir="ltr">{waStatus.user?.phone ? (waStatus.user.phone.startsWith('+') ? waStatus.user.phone : `+${waStatus.user.phone}`) : '+970 56 724 6963'}</bdi>)</span>
                  </span>
                ) : waStatus.status === 'CONNECTING' ? (
                  <span className="text-[11px] font-medium text-blue-400 flex items-center gap-1 whitespace-nowrap">
                    <RotateCw className="w-3 h-3 animate-spin text-blue-400 shrink-0" />
                    <span>جاري الاتصال بالسيرفر...</span>
                  </span>
                ) : waStatus.status === 'SCAN_QR' ? (
                  <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1 whitespace-nowrap">
                    <QrCode className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>بانتظار مسح الرمز QR</span>
                  </span>
                ) : (
                  <button
                    onClick={handleQuickReconnect}
                    className="text-[11px] font-medium text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer hover:underline whitespace-nowrap"
                    title="انقر لإعادة الاتصال التلقائي بواتساب فوراً"
                  >
                    <span>غير متصل - انقر للاتصال</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {waStatus.status === 'CONNECTED' ? (
              <button
                type="button"
                onClick={handleSyncChats}
                disabled={isSyncingChats}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#a5a5a5] hover:text-[#21c063] hover:bg-[#202c33] transition-colors cursor-pointer"
                title="مزامنة وتحديث مجموعات الواتساب"
              >
                <RotateCw className={`w-4 h-4 ${isSyncingChats ? 'animate-spin' : ''}`} />
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {waStatus.hasCreds && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleQuickReconnect}
                    className="h-7.5 px-2 text-[11px] font-bold border-amber-500/40 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 rounded-lg cursor-pointer gap-1 shadow-xs whitespace-nowrap shrink-0"
                    title="إعادة الاتصال التلقائي بنفس الجلسة المحفوظة"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>اتصال</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={onOpenQRModal}
                  className="h-7.5 px-2.5 text-[11px] font-bold text-white bg-[#21c063] hover:bg-[#1daa55] gap-1 rounded-lg shadow-xs cursor-pointer whitespace-nowrap shrink-0"
                  title="مسح رمز QR للربط أو تبديل الحساب"
                >
                  <QrCode className="w-3 h-3" />
                  <span>ربط QR</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* شريط البحث في المحادثات وزر محادثة خاصة جديدة */}
        <div className="p-2.5 bg-[#161717] border-b border-[#2e2f2f] shrink-0 flex items-center gap-1.5">
          <div className="relative flex-1 flex items-center bg-[#242626] rounded-lg px-3 py-1.5">
            <Search className="w-4 h-4 text-[#a5a5a5] shrink-0 ml-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث عن اسم، رقم، إيميل، أو نص رسالة..."
              className="bg-transparent text-xs text-[#fafafa] placeholder-[#a5a5a5] focus:outline-none w-full"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-[#a5a5a5] hover:text-[#fafafa] p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => setIsNewChatModalOpen(true)}
            className="h-8 px-2.5 text-xs font-semibold bg-[#21c063] hover:bg-[#1daa55] text-white rounded-lg flex items-center gap-1 cursor-pointer shrink-0 shadow-xs"
            title="بدء محادثة خاصة جديدة برقم هاتف"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">محادثة جديدة</span>
          </Button>
        </div>

        {/* أزرار تصفية وقوائم المحادثات (مطابقة لنظام قوائم واتساب الأصلية) */}
        <div className="px-2.5 py-1.5 flex items-center gap-1.5 border-b border-[#2e2f2f] bg-[#161717] shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setChatFilterTab('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              chatFilterTab === 'all'
                ? 'bg-[#21c063] text-white shadow-xs'
                : 'text-[#a5a5a5] hover:text-[#fafafa] hover:bg-[#242626]'
            }`}
          >
            الكل
          </button>
          <button
            type="button"
            onClick={() => setChatFilterTab('unread')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              chatFilterTab === 'unread'
                ? 'bg-[#21c063] text-white shadow-xs'
                : 'text-[#a5a5a5] hover:text-[#fafafa] hover:bg-[#242626]'
            }`}
          >
            غير مقروءة {groupsList.filter((g) => (g.unread || 0) > 0).length > 0 && `(${groupsList.filter((g) => (g.unread || 0) > 0).length})`}
          </button>
          <button
            type="button"
            onClick={() => setChatFilterTab('favorites')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              chatFilterTab === 'favorites'
                ? 'bg-[#21c063] text-white shadow-xs'
                : 'text-[#a5a5a5] hover:text-[#fafafa] hover:bg-[#242626]'
            }`}
          >
            المفضلة {favoriteChatKeys.size > 0 && `(${favoriteChatKeys.size})`}
          </button>
          <button
            type="button"
            onClick={() => setChatFilterTab('groups')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              chatFilterTab === 'groups'
                ? 'bg-[#21c063] text-white shadow-xs'
                : 'text-[#a5a5a5] hover:text-[#fafafa] hover:bg-[#242626]'
            }`}
          >
            المجموعات
          </button>
          <button
            type="button"
            onClick={() => setChatFilterTab('direct')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              chatFilterTab === 'direct'
                ? 'bg-[#21c063] text-white shadow-xs'
                : 'text-[#a5a5a5] hover:text-[#fafafa] hover:bg-[#242626]'
            }`}
          >
            خاصة
          </button>

          {/* القوائم المخصصة الديناميكية التي أنشأها المستخدم كواتساب */}
          {Object.keys(customLists).map((listName) => {
            const count = (customLists[listName] || []).length;
            const isSelected = chatFilterTab === `list:${listName}`;
            return (
              <button
                key={listName}
                type="button"
                onClick={() => setChatFilterTab(isSelected ? 'all' : `list:${listName}`)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                  isSelected
                    ? 'bg-[#21c063] text-white shadow-xs'
                    : 'text-[#a5a5a5] hover:text-[#fafafa] hover:bg-[#242626]'
                }`}
              >
                <span>{listName}</span>
                {count > 0 && <span className="text-[10px] opacity-80">({count})</span>}
              </button>
            );
          })}

          {/* زر إضافة قائمة جديدة (+) */}
          <button
            type="button"
            onClick={handleCreateNewList}
            className="p-1.5 rounded-full text-[#a5a5a5] hover:text-white hover:bg-[#242626] transition-colors cursor-pointer shrink-0"
            title="إنشاء قائمة مخصصة جديدة"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* تبويب المؤرشفة (متاح دائماً لتسهيل الوصول للأرشيف كواتساب تماماً) */}
          <button
            type="button"
            onClick={() => setChatFilterTab(chatFilterTab === 'archived' ? 'all' : 'archived')}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 shrink-0 ${
              chatFilterTab === 'archived'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-400 hover:text-amber-300 hover:bg-[#242626]'
            }`}
            title="عرض المحادثات المؤرشفة"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>المؤرشفة</span>
            {archivedCount > 0 && <span className="text-[10px]">({archivedCount})</span>}
          </button>
        </div>

        {/* قائمة المجموعات والمحادثات الممتدة كامل الارتفاع */}
        <div
          className="flex-1 overflow-y-auto divide-y divide-[#2e2f2f]/60"
          onScroll={(event) => {
            const list = event.currentTarget;
            if (list.scrollHeight - list.scrollTop - list.clientHeight < 500) {
              setVisibleChatCount((count) => Math.min(filteredGroupsList.length, count + 80));
            }
          }}
        >
          {searchResults.isSearching ? (
            searchResults.matchingChats.length === 0 && searchResults.matchingMessages.length === 0 ? (
              <div className="p-8 text-center text-[#8696a0] flex flex-col items-center justify-center gap-2">
                <Search className="w-8 h-8 text-[#8696a0]/40 mb-1" />
                <p className="text-sm font-semibold text-[#fafafa]">لا توجد نتائج مطابقة</p>
                <p className="text-xs text-[#8696a0]">لم يتم العثور على أي محادثات أو رسائل تطابق "{searchQuery}"</p>
              </div>
            ) : (
              <div className="divide-y divide-[#2e2f2f]/30">
                {/* 1. قسم المحادثات المطابقة (Chats) */}
                {searchResults.matchingChats.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1.5 text-xs font-semibold text-[#8696a0] tracking-wide select-none">
                      المحادثات
                    </div>
                    {searchResults.matchingChats.map((g: any) => {
                      const isActive = activeGroup === (g.id || g.name);
                      const isDragHovered = dragHoverChatKey === g.name;
                      return (
                        <div
                          key={g.id || g.name}
                          onClick={() => handleSelectChat(g.id || g.name)}
                          onDragEnter={(e) => handleSidebarChatDragEnter(e, g.name)}
                          onDragOver={handleSidebarChatDragOver}
                          onDragLeave={(e) => handleSidebarChatDragLeave(e, g.name)}
                          onDrop={(e) => handleSidebarChatDrop(e, g.name)}
                          className={`relative flex items-center gap-3 px-4 py-3 cursor-pointer transition-all ${
                            isDragHovered
                              ? '!bg-[#21c063]/25 ring-2 ring-[#21c063] scale-[1.01] shadow-lg shadow-[#21c063]/20'
                              : isActive
                              ? 'bg-[#202c33]'
                              : 'hover:bg-[#202c33]/70'
                          }`}
                        >
                          {isDragHovered && (
                            <div className="absolute inset-0 bg-[#21c063]/25 backdrop-blur-xs flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#21c063] z-20 pointer-events-none animate-in fade-in duration-100">
                              <ImageIcon className="w-4 h-4 text-[#21c063] animate-bounce" />
                              <span className="text-[11px] font-bold text-white bg-black/85 px-2 py-0.5 rounded shadow-sm">
                                أفلت هنا لفتح المحادثة وإرفاق الصورة
                              </span>
                            </div>
                          )}
                          <div className="w-10 h-10 rounded-full bg-[#242626] border border-[#2e2f2f] flex items-center justify-center text-[#a5a5a5] shrink-0 overflow-hidden relative">
                            {g.avatarUrl ? (
                              <img
                                src={g.avatarUrl}
                                alt={g.name}
                                className="w-full h-full object-cover rounded-full"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : g.isGroup ? (
                              <Building className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <User className="w-5 h-5 text-sky-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-[#fafafa] truncate" dir="auto">
                                <bdi>{g.name}</bdi>
                              </span>
                              <span className="text-xs text-[#8696a0] shrink-0">{g.time}</span>
                            </div>
                            <div className="text-xs text-[#8696a0] truncate mt-0.5">
                              {g.phone && g.phone !== g.name ? g.phone : g.subtitle}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. قسم الرسائل المطابقة (Messages) كما في واتساب الأصلي تماماً (Image 2) */}
                {searchResults.matchingMessages.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1.5 text-xs font-semibold text-[#8696a0] tracking-wide select-none">
                      الرسائل
                    </div>
                    {searchResults.matchingMessages.map((msg) => {
                      return (
                        <div
                          key={msg.id}
                          onClick={() => handleSelectChat(msg.chatJid || msg.chatName, msg.id)}
                          className="px-4 py-3 hover:bg-[#202c33] cursor-pointer transition-colors border-b border-[#2e2f2f]/30"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold text-[#fafafa] truncate" dir="auto">
                              <bdi>{msg.chatName}</bdi>
                            </span>
                            <span className="text-xs text-[#8696a0] shrink-0 font-normal">
                              {msg.dateFormatted}
                            </span>
                          </div>
                          <div className="text-xs text-[#8696a0] truncate flex items-center gap-1.5" dir="auto">
                            {msg.isFromMe ? (
                              <span className="text-[#8696a0] flex items-center gap-1 shrink-0 font-normal">
                                <span>أنت:</span>
                                <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                              </span>
                            ) : msg.senderName ? (
                              <span className="text-[#8696a0] shrink-0 font-normal">
                                {msg.senderName}:
                              </span>
                            ) : null}
                            <span className="truncate text-[#8696a0]">
                              {renderHighlightedSnippet(msg.snippet, searchQuery)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          ) : (
            /* القائمة العادية لكافة المحادثات عند عدم تفعيل البحث */
            <div>
              {/* شريط رأس المحادثات المؤرشفة عند تفعيل فلتر المؤرشفة */}
              {chatFilterTab === 'archived' && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#202c33] border-b border-[#2e2f2f] text-sm font-bold text-[#fafafa] shrink-0 sticky top-0 z-10 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setChatFilterTab('all')}
                      className="p-1 hover:bg-[#2a3942] rounded-full text-[#8696a0] hover:text-[#fafafa] transition-colors cursor-pointer"
                      title="الرجوع إلى كافة المحادثات"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <Archive className="w-4 h-4 text-amber-400" />
                    <span>المحادثات المؤرشفة ({archivedCount})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChatFilterTab('all')}
                    className="text-xs text-[#21c063] hover:underline font-normal cursor-pointer"
                  >
                    عرض الكل
                  </button>
                </div>
              )}

              {/* صف المؤرشفة في أعلى القائمة الرئيسية كواتساب تماماً */}
              {chatFilterTab !== 'archived' && archivedCount > 0 && (
                <div
                  role="button"
                  onClick={() => setChatFilterTab('archived')}
                  className="flex items-center justify-between px-4 py-3 border-b border-[#2e2f2f] hover:bg-[#202c33] cursor-pointer transition-colors group/archived select-none"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#202c33] border border-[#2e2f2f] flex items-center justify-center text-[#21c063] group-hover/archived:text-emerald-300 shrink-0">
                      <Archive className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-[#fafafa]">المؤرشفة</span>
                      <span className="text-[11px] text-[#8696a0]">المحادثات المحفوظة في الأرشيف</span>
                    </div>
                  </div>
                  <span className="text-xs text-[#21c063] font-bold px-2 py-0.5 rounded-full bg-[#21c063]/10 border border-[#21c063]/20">
                    {archivedCount}
                  </span>
                </div>
              )}

              {filteredGroupsList.length === 0 ? (
                <div className="p-6 text-center flex flex-col items-center justify-center gap-3 h-64 text-[#a5a5a5]">
                  <div className="w-12 h-12 rounded-full bg-[#242626] border border-[#2e2f2f] flex items-center justify-center text-[#a5a5a5]">
                    {chatFilterTab === 'archived' ? (
                      <Archive className="w-6 h-6 text-amber-400" />
                    ) : (
                      <QrCode className="w-6 h-6 text-[#21c063]" />
                    )}
                  </div>
                  <p className="text-xs text-[#fafafa] font-semibold">
                    {chatFilterTab === 'archived'
                      ? 'لا توجد محادثات مؤرشفة حالياً'
                      : chatFilterTab !== 'all'
                      ? 'لا توجد نتائج مطابقة لفلتر البحث'
                      : (waStatus.status === 'CONNECTED'
                          ? 'جاري مزامنة المحادثات من واتساب...'
                          : 'لا توجد محادثات محملة')}
                  </p>
                  <p className="text-[11px] text-[#a5a5a5] max-w-xs leading-relaxed">
                    {chatFilterTab === 'archived'
                      ? 'لأرشفة أي محادثة، انقر بزر الفأرة الأيمن على أي محادثة في القائمة واختر "أرشفة المحادثة".'
                      : chatFilterTab !== 'all'
                      ? 'جرب اختيار تبويب الكل لعرض كافة المحادثات.'
                      : (waStatus.status === 'CONNECTED'
                          ? 'انقر على زر مزامنة بالأعلى لجلب المحادثات والمجموعات الحقيقية من هاتفك فوراً.'
                          : 'قم بربط حساب واتساب عبر رمز الاستجابة السريعة (QR) لتحميل كافة المحادثات الحقيقية من هاتفك.')}
                  </p>
                {waStatus.status === 'CONNECTED' ? (
                  <Button
                    size="sm"
                    onClick={handleSyncChats}
                    disabled={isSyncingChats}
                    className="h-8 text-xs font-bold bg-[#21c063] hover:bg-[#1daa55] text-white px-3 rounded-lg cursor-pointer gap-1"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isSyncingChats ? 'animate-spin' : ''}`} />
                    <span>مزامنة المحادثات الآن</span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={onOpenQRModal}
                    className="h-8 text-xs font-bold bg-[#21c063] hover:bg-[#1daa55] text-white px-3 rounded-lg cursor-pointer gap-1"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>ربط واتساب بالرمز QR</span>
                  </Button>
                )}
              </div>
            ) : (
              filteredGroupsList.slice(0, visibleChatCount).map((g: any) => {
                const isActive = activeGroup === (g.id || g.name);
                const isDragHovered = dragHoverChatKey === g.name;
                const isRead =
                  readChatKeys.has(g.name) ||
                  (g.id && readChatKeys.has(g.id)) ||
                  (isActive && isAtBottom);
                const displayCount = isRead ? 0 : (g.unread || 0);

                return (
                  <div
                    key={g.id || g.name}
                    onClick={() => handleSelectChat(g.id || g.name)}
                    onDragEnter={(e) => handleSidebarChatDragEnter(e, g.name)}
                    onDragOver={handleSidebarChatDragOver}
                    onDragLeave={(e) => handleSidebarChatDragLeave(e, g.name)}
                    onDrop={(e) => handleSidebarChatDrop(e, g.name)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setChatContextMenu({
                        open: true,
                        x: e.clientX,
                        y: e.clientY,
                        chat: g,
                      });
                    }}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      const touchX = touch.clientX;
                      const touchY = touch.clientY;
                      longPressTimerRef.current = setTimeout(() => {
                        if (navigator.vibrate) navigator.vibrate(40);
                        setChatContextMenu({
                          open: true,
                          x: touchX,
                          y: touchY,
                          chat: g,
                        });
                      }, 450);
                    }}
                    onTouchEnd={() => {
                      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                    }}
                    onTouchMove={() => {
                      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
                    }}
                    className={`group relative flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-all ${
                      isDragHovered
                        ? '!bg-[#21c063]/25 ring-2 ring-[#21c063] scale-[1.01] shadow-lg shadow-[#21c063]/20'
                        : isActive
                        ? 'bg-[#2e2f2f]'
                        : 'hover:bg-[#242626]'
                    }`}
                  >
                    {isDragHovered && (
                      <div className="absolute inset-0 bg-[#21c063]/25 backdrop-blur-xs flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#21c063] z-20 pointer-events-none animate-in fade-in duration-100">
                        <ImageIcon className="w-5 h-5 text-[#21c063] animate-bounce" />
                        <span className="text-xs font-bold text-white bg-black/85 px-2.5 py-1 rounded-md shadow-md">
                          أفلت هنا لفتح المحادثة وإرفاق الصورة
                        </span>
                      </div>
                    )}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        openAvatarLightbox(
                          g.id,
                          g.avatarUrl || '',
                          g.name,
                          g.phone || (g.isGroup ? 'مجموعة واتساب' : 'محادثة خاصة'),
                          g.isGroup,
                        );
                      }}
                      className="w-12 h-12 rounded-full bg-[#242626] border border-[#2e2f2f] flex items-center justify-center text-[#a5a5a5] shrink-0 overflow-hidden relative cursor-pointer hover:ring-2 hover:ring-[#21c063] transition-all"
                      title="انقر لتكبير صورة المحادثة ورؤيتها كاملة"
                    >
                      {g.avatarUrl ? (
                        <img
                          src={g.avatarUrl}
                          alt={g.name}
                          className="w-full h-full object-cover rounded-full"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : g.isGroup ? (
                        <Building className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <User className="w-5 h-5 text-sky-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#fafafa] truncate" dir="auto">
                          <bdi>{g.name}</bdi>
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] text-[#a5a5a5]">{g.time}</span>
                          {pinnedChatKeys.has(g.id || g.name) && (
                            <Pin className="w-3.5 h-3.5 text-[#8696a0] rotate-45 shrink-0" />
                          )}
                          {Boolean(mutedChats[g.id || g.name]) && (
                            <VolumeX className="w-3.5 h-3.5 text-[#8696a0] shrink-0" />
                          )}
                          {favoriteChatKeys.has(g.id || g.name) && (
                            <Heart className="w-3 h-3 text-rose-400 fill-rose-400 shrink-0" />
                          )}
                        </div>
                      </div>
                      {g.phone && g.phone !== g.name && (
                        <div className="text-[11px] text-emerald-400/90 font-mono -mt-0.5 truncate" dir="ltr">
                          {g.phone}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          {g.latestMsg && renderMessageStatusTicks(g.latestMsg, false, "w-3 h-3")}
                          <span className="text-xs text-[#a5a5a5] truncate">{g.subtitle}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 mr-1">
                          {displayCount > 0 && (
                            <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#21c063] text-[10px] font-bold text-white flex items-center justify-center shadow-xs">
                              {displayCount}
                            </span>
                          )}
                          {/* سهم الخيارات عند التحويم كواتساب ويب بيتا تماماً */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setChatContextMenu({
                                open: true,
                                x: rect.left,
                                y: rect.bottom + 4,
                                chat: g,
                              });
                            }}
                            className="p-1 rounded-full text-[#8696a0] hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="خيارات المحادثة"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* وسوم الـ CRM الملونة والملاحظات السرية للعميل في القائمة الجانبية */}
                      {(() => {
                        const chatKey = g.id || g.name;
                        const crmRec = crmData[chatKey] || crmData[g.name];
                        if (!crmRec || (!crmRec.tags?.length && !crmRec.notes?.length)) return null;
                        const activeTags = crmTagsList.filter((t) => crmRec.tags?.includes(t.id));
                        return (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {activeTags.slice(0, 2).map((t) => (
                              <span
                                key={t.id}
                                style={{ backgroundColor: `${t.color}22`, color: t.color, borderColor: `${t.color}44` }}
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded border truncate max-w-[85px]"
                              >
                                {t.name}
                              </span>
                            ))}
                            {activeTags.length > 2 && (
                              <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-[#2e2f2f] text-[#a5a5a5]">
                                +{activeTags.length - 2}
                              </span>
                            )}
                            {crmRec.notes && crmRec.notes.length > 0 && (
                              <span
                                className="text-[9px] text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20 font-bold flex items-center gap-0.5"
                                title={`${crmRec.notes.length} ملاحظات داخلية سرية`}
                              >
                                <Lock className="w-3.5 h-3.5 inline" />
                                <span>{crmRec.notes.length}</span>
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })
            )
          }
          </div>
        )}
        </div>
      </div>

      {/* منطقة المحادثة المفتوحة (تمتد على كامل المساحة المتبقية شاشة كاملة) مع دعم كليك يمين لإغلاق المحادثة والسحب والإفلات */}
      <div
        onContextMenu={handleChatAreaContextMenu}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handleClipboardPaste}
        className={`${isPopoutMode || activeGroup ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-[#161717] relative h-full overflow-hidden min-w-0`}
      >
        {/* خلفية واتساب المزخرفة الناعمة */}
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#ffffff 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* نافذة معلومات الرسالة (Message info) */}
        {messageInfo && messageInfo.chatKey === activeGroup && (() => {
          const { msg: infoMsg, data, loading, error } = messageInfo;
          const renderPerson = (p: any) => (
            <div key={p.jid} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#1d1f1f] transition-colors">
              {p.avatarUrl ? (
                <img src={p.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#2e2f2f] flex items-center justify-center text-sm font-bold text-[#a5a5a5] shrink-0">
                  {(p.name || '?').trim().charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm text-[#fafafa] truncate">{p.name}</div>
                <div className="text-xs text-[#a5a5a5]">{formatInfoTime(p.at)}</div>
              </div>
            </div>
          );
          const hasNoTimes = data && (data.isGroup
            ? data.readBy.length === 0 && data.deliveredTo.length === 0 && ['delivered', 'read'].includes(data.deliveryStatus)
            : !data.deliveredAt && !data.readAt && ['delivered', 'read'].includes(data.deliveryStatus));

          return (
            <div className="absolute inset-y-0 end-0 z-40 w-full sm:w-[380px] bg-[#161717] border-s border-[#2e2f2f] flex flex-col shadow-2xl animate-in fade-in slide-in-from-left-4 duration-150">
              <div className="px-4 py-3 flex items-center gap-3 border-b border-[#2e2f2f] shrink-0">
                <button
                  type="button"
                  onClick={closeMessageInfo}
                  className="p-1.5 rounded-full text-[#a5a5a5] hover:text-[#fafafa] hover:bg-[#2e2f2f] transition-colors cursor-pointer"
                  title="إغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
                <h3 className="text-sm font-bold text-[#fafafa]">معلومات الرسالة</h3>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* معاينة الرسالة */}
                <div className="p-4 flex justify-start border-b border-[#2e2f2f]">
                  <div className="max-w-[85%] rounded-lg rounded-tr-xs bg-[#144d37] px-2.5 py-1.5 text-[13px] text-[#fafafa] shadow-xs">
                    <p className="whitespace-pre-wrap break-words line-clamp-6">
                      {infoMsg.text || (infoMsg.hasMedia ? 'وسائط' : '')}
                    </p>
                    <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px] text-[#a5a5a5]">
                      <span>{infoMsg.timestamp}</span>
                      {renderMessageStatusTicks({ ...infoMsg, deliveryStatus: data?.deliveryStatus || infoMsg.deliveryStatus })}
                    </div>
                  </div>
                </div>

                {loading && (
                  <div className="flex items-center justify-center gap-2 py-8 text-xs text-[#a5a5a5]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري جلب المعلومات...
                  </div>
                )}
                {error && !loading && <p className="px-4 py-6 text-xs text-red-400 text-center">{error}</p>}

                {data && data.isGroup && (
                  <>
                    <div className="px-4 pt-4 pb-1 flex items-center gap-2 text-sm text-[#a5a5a5]">
                      <CheckCheck className="w-4 h-4 text-[#53bdeb]" />
                      قرأها
                    </div>
                    {data.readBy.map(renderPerson)}
                    {data.readBy.length === 0 && <p className="px-4 py-2 text-xs text-[#7a7c7c]">لم يقرأها أحد بعد</p>}
                    {data.totalMembers !== null && data.readRemaining > 0 && (
                      <p className="px-4 pb-3 text-xs text-[#a5a5a5]">{data.readRemaining} متبقٍ</p>
                    )}

                    <div className="border-t border-[#2e2f2f] mt-1" />

                    <div className="px-4 pt-4 pb-1 flex items-center gap-2 text-sm text-[#a5a5a5]">
                      <CheckCheck className="w-4 h-4 text-[#a5a5a5]" />
                      وصلت إلى
                    </div>
                    {data.deliveredTo.map(renderPerson)}
                    {data.deliveredTo.length === 0 && (
                      <p className="px-4 py-2 text-xs text-[#7a7c7c]">
                        {data.readBy.length > 0 ? 'كل من استلمها قرأها' : 'لم تصل لأحد بعد'}
                      </p>
                    )}
                    {data.totalMembers !== null && data.deliveredRemaining > 0 && (
                      <p className="px-4 pb-3 text-xs text-[#a5a5a5]">{data.deliveredRemaining} متبقٍ</p>
                    )}
                  </>
                )}

                {data && !data.isGroup && (
                  <div className="py-2">
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-[#fafafa]">
                        <CheckCheck className="w-4 h-4 text-[#53bdeb]" />
                        تمت القراءة
                      </div>
                      <div className="text-xs text-[#a5a5a5] mt-1 ps-6">
                        {data.readAt ? formatInfoTime(data.readAt) : data.deliveryStatus === 'read' ? 'الوقت غير متوفر' : 'لم تُقرأ بعد'}
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-[#fafafa]">
                        <CheckCheck className="w-4 h-4 text-[#a5a5a5]" />
                        تم التسليم
                      </div>
                      <div className="text-xs text-[#a5a5a5] mt-1 ps-6">
                        {data.deliveredAt
                          ? formatInfoTime(data.deliveredAt)
                          : ['delivered', 'read'].includes(data.deliveryStatus) ? 'الوقت غير متوفر' : 'لم تصل بعد'}
                      </div>
                    </div>
                  </div>
                )}

                {hasNoTimes && (
                  <p className="mx-4 my-3 p-3 rounded-lg bg-[#1d1f1f] text-[11px] leading-5 text-[#a5a5a5]">
                    هذه رسالة قديمة: أوقات الاستلام والقراءة تُسجَّل للرسائل المرسلة بعد هذا التحديث فقط.
                  </p>
                )}
              </div>
            </div>
          );
        })()}

        {/* تراكب السحب والإفلات الزجاجي للملفات والوصولات (Drag & Drop Overlay) */}
        {isDraggingOverChat && (
          <div
            className="absolute inset-0 z-50 bg-[#161717]/90 backdrop-blur-md flex flex-col items-center justify-center p-6 select-none animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
            dir="rtl"
          >
            <div className="w-full h-full max-w-2xl max-h-[85%] border-3 border-dashed border-[#21c063] rounded-3xl bg-[#21c063]/5 flex flex-col items-center justify-center p-8 text-center shadow-2xl relative pointer-events-none">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-[#21c063]/20 border border-[#21c063]/40 flex items-center justify-center text-[#21c063] mb-5 shadow-xl animate-bounce">
                <Upload className="w-10 h-10 sm:w-12 sm:h-12 stroke-[2.5]" />
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-white mb-2 tracking-tight">
                أفلت الملف هنا للإرسال في المحادثة
              </h3>

              <p className="text-xs sm:text-sm text-[#a5a5a5] max-w-md leading-relaxed mb-5">
                يدعم صور الإيصالات (JPG, PNG)، المستندات والملفات (PDF, Word, Excel)، والفيديوهات والمقاطع الصوتية
              </p>

              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#242626] border border-[#2e2f2f] text-xs text-emerald-400 font-bold shadow-md">
                <span className="w-2 h-2 rounded-full bg-[#21c063] animate-ping" />
                <span>إرسال مباشر إلى: <strong className="text-white">{resolvedActiveContactName}</strong></span>
              </div>
            </div>
          </div>
        )}

        {!activeGroup ? (
          /* واجهة إغلاق المحادثة الرسمية - شاشة الترحيب الأنيقة عند عدم اختيار أو إغلاق المحادثة */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-24 h-24 rounded-full bg-[#161717] border border-[#2e2f2f] flex items-center justify-center shadow-2xl mb-6 relative group">
              <div className="absolute inset-0 rounded-full bg-[#21c063]/15 blur-xl group-hover:bg-[#21c063]/25 transition-all" />
              <MessageSquare className="w-12 h-12 text-[#21c063] relative z-10" />
            </div>

            <h2 className="text-xl font-bold text-[#fafafa] mb-2 tracking-tight">
              اختر محادثة لعرضها
            </h2>
            <p className="text-xs sm:text-sm text-[#a5a5a5] max-w-md leading-relaxed mb-6">
              المحادثات مغلقة افتراضياً. انقر على أي محادثة أو مجموعة من القائمة الجانبية لعرض الرسائل والحوالات، أو ابدأ محادثة مباشرة جديدة.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                onClick={() => setIsNewChatModalOpen(true)}
                className="h-9 px-4 bg-[#21c063] hover:bg-[#1daa55] text-white text-xs font-bold rounded-xl gap-2 cursor-pointer shadow-md"
              >
                <Plus className="w-4 h-4" />
                <span>محادثة جديدة</span>
              </Button>
            </div>

            <div className="mt-16 flex items-center gap-2 text-xs text-[#a5a5a5]/70 border-t border-[#2e2f2f] pt-6">
              <ShieldCheck className="w-4 h-4 text-[#21c063]" />
              <span>نظام إدارة الحوالات الفوري - مشفر وآمن ومربوط بـ Airtable</span>
            </div>
          </div>
        ) : (
          <>
        {/* رأس المحادثة الأصلي أو شريط التحديد المتعدد عند تفعيل وضع التحديد */}
        {/* شريط التحديد المتعدد الاحترافي المطابق لواتساب الجوال والويب بالكامل */}
        {isSelectionMode ? (
          <div className="px-3 md:px-5 py-2 bg-[#202c33] border-b border-[#2a3942] flex items-center justify-between relative z-20 shrink-0 shadow-lg animate-in slide-in-from-top-1 select-none h-14" dir="rtl">
            {/* الطرف الأيمن: زر الرجوع / إلغاء التحديد + عدد الرسائل المحددة (مثل الصور 2 و 3) */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsSelectionMode(false);
                  setSelectedMsgIds([]);
                  setSelectionMenuOpen(false);
                }}
                className="text-[#aebac1] hover:text-white p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer"
                title="إلغاء التحديد"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-white tracking-wide">
                  {selectedMsgIds.length}
                </span>
                <span className="text-xs text-[#8696a0] hidden sm:inline">
                  {selectedMsgIds.length === 1 ? 'رسالة محددة' : 'رسائل محددة'}
                </span>
              </div>
            </div>

            {/* الطرف الأيسر: أيقونات الإجراءات (رد، نجمة، حذف، نسخ، تحويل ➡️، 3 نقاط) */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* زر شبك صورة الوصل مع نص الحوالة (يظهر للجوال وسطح المكتب عند تحديد وصل + نص أو عدة نصوص) */}
              {canLinkSelected && (
                <Button
                  size="sm"
                  onClick={handleLinkSelectedMessages}
                  className="flex h-8 text-xs font-black gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg px-2 sm:px-3 shadow-md"
                  title="شبك صورة الوصل المحددة مع نصوص الحوالات"
                >
                  <Link2 className="w-4 h-4 text-white shrink-0" />
                  <span className="hidden sm:inline">
                    {isTwoImagesSelected
                      ? 'شبك الصورتين'
                      : (selectedTextMsgs && selectedTextMsgs.length > 1)
                      ? `شبك الوصل مع (${selectedTextMsgs.length}) حوالات`
                      : 'شبك الوصل مع الحوالة'}
                  </span>
                  <span className="sm:hidden">
                    {isTwoImagesSelected ? 'شبك الصورتين' : 'شبك الوصل'}
                  </span>
                </Button>
              )}

              {/* زر فك الشبك في حال تم تحديد حوالة مشبوكة */}
              {selectedHasLinkedReceipt && !canLinkSelected && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleUnlinkSelectedMessages}
                  className="flex h-8 text-xs font-bold gap-1.5 border-rose-500/50 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 rounded-lg px-2 sm:px-3 cursor-pointer"
                  title="فك ارتباط صورة الوصل عن الحوالة المحددة"
                >
                  <Link2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="hidden sm:inline">فك الشبك ✕</span>
                  <span className="sm:hidden">فك</span>
                </Button>
              )}

              {/* زر تحديد الرسائل المحددة كـ تم الاستلام */}
              <button
                type="button"
                onClick={handleToggleReceivedForSelected}
                className="text-[#aebac1] hover:text-purple-400 p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer"
                title="تحديد الرسائل المحددة كـ تم الاستلام"
              >
                <CheckCircle2 className="w-5 h-5 text-purple-400" />
              </button>

              {/* رد (إذا كانت رسالة واحدة فقط محددة كواتساب الأصلي) */}
              {selectedMsgIds.length === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const m = messages.find((x) => x.id === selectedMsgIds[0]);
                    if (m) handleStartReply(m);
                    setIsSelectionMode(false);
                    setSelectedMsgIds([]);
                  }}
                  className="text-[#aebac1] hover:text-white p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer"
                  title="رد (Reply)"
                >
                  <Reply className="w-5 h-5 text-sky-400" />
                </button>
              )}

              {/* تمييز بنجمة ⭐ */}
              <button
                type="button"
                onClick={handleStarSelectedMessages}
                className="text-[#aebac1] hover:text-amber-400 p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer"
                title="تمييز بنجمة ⭐"
              >
                <Star className="w-5 h-5" />
              </button>

              {/* حذف الرسائل 🗑️ */}
              <button
                type="button"
                onClick={handleBulkDelete}
                className="text-[#aebac1] hover:text-rose-400 p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer"
                title="حذف الرسائل المحددة"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              {/* نسخ النص 📋 */}
              <button
                type="button"
                onClick={handleCopySelectedMessages}
                className="text-[#aebac1] hover:text-white p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer"
                title="نسخ نص الرسائل المحددة"
              >
                <Copy className="w-5 h-5" />
              </button>

              {/* تحويل الرسائل ➡️ (Forward to... - يفتح الشاشة الشبيهة بواتساب والقوائم المخصصة) */}
              <button
                type="button"
                onClick={() => {
                  setTargetChatsToForward([]);
                  setForwardSearchQuery('');
                  setIsForwardModalOpen(true);
                }}
                className="text-[#aebac1] hover:text-emerald-400 p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer relative"
                title="تحويل إلى... (Forward to)"
              >
                <Forward className="w-5 h-5 text-[#00a884]" />
              </button>

              {/* قائمة الـ 3 نقاط ⋮ (خيارات إضافية كالصورة 4) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSelectionMenuOpen(!selectionMenuOpen)}
                  className="text-[#aebac1] hover:text-white p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer"
                  title="خيارات إضافية"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>

                {selectionMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-11 left-0 z-50 w-52 bg-[#233138] border border-[#2a3942] rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 text-xs sm:text-sm text-[#e9edef] animate-in fade-in duration-100"
                  >
                    {selectedMsgIds.length === 1 && (() => {
                      const selectedMsg = messages.find((x) => x.id === selectedMsgIds[0]);
                      const canReplyPrivately = isCurrentChatGroup && selectedMsg && !isOutgoingMessage(selectedMsg);
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectionMenuOpen(false);
                              if (selectedMsg) openMessageInfo(selectedMsg);
                            }}
                            className="w-full text-right px-3 py-2 hover:bg-[#182229] rounded-lg transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <span>معلومات الرسالة</span>
                            <Info className="w-4 h-4 text-[#8696a0]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectionMenuOpen(false);
                              toast.success('تم تثبيت الرسالة', 'تثبيت');
                            }}
                            className="w-full text-right px-3 py-2 hover:bg-[#182229] rounded-lg transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <span>تثبيت (Pin)</span>
                            <Pin className="w-4 h-4 text-[#8696a0]" />
                          </button>
                          {canReplyPrivately && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectionMenuOpen(false);
                                handleReplyPrivately(selectedMsg);
                              }}
                              className="w-full text-right px-3 py-2 hover:bg-[#182229] rounded-lg transition-colors flex items-center justify-between cursor-pointer text-emerald-400 font-medium"
                            >
                              <span>رد في الخاص (Reply privately)</span>
                              <Reply className="w-4 h-4 text-emerald-400 rtl:rotate-180" />
                            </button>
                          )}
                        </>
                      );
                    })()}
                    {canLinkSelected && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectionMenuOpen(false);
                          handleLinkSelectedMessages();
                        }}
                        className="w-full text-right px-3 py-2 hover:bg-[#182229] rounded-lg transition-colors flex items-center justify-between cursor-pointer text-emerald-400 font-bold"
                      >
                        <span>
                          {isTwoImagesSelected
                            ? 'شبك الصورتين معاً'
                            : (selectedTextMsgs && selectedTextMsgs.length > 1)
                            ? `شبك الوصل مع (${selectedTextMsgs.length}) حوالات`
                            : 'شبك الوصل مع الحوالة'}
                        </span>
                        <Link2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectionMenuOpen(false);
                        handleToggleReceivedForSelected();
                      }}
                      className="w-full text-right px-3 py-2 hover:bg-[#182229] rounded-lg transition-colors flex items-center justify-between cursor-pointer text-purple-300 font-medium"
                    >
                      <span>تحديد كـ تم الاستلام ({selectedMsgIds.length})</span>
                      <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectionMenuOpen(false);
                        if (selectedMsgIds.length === activeGroupMessages.length) {
                          setSelectedMsgIds([]);
                          setIsSelectionMode(false);
                        } else {
                          setSelectedMsgIds(activeGroupMessages.map((m) => m.id));
                        }
                      }}
                      className="w-full text-right px-3 py-2 hover:bg-[#182229] rounded-lg transition-colors flex items-center justify-between cursor-pointer"
                    >
                      <span>{selectedMsgIds.length === activeGroupMessages.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}</span>
                      <CheckSquare className="w-4 h-4 text-[#8696a0]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectionMenuOpen(false);
                        setIsSelectionMode(false);
                        setSelectedMsgIds([]);
                      }}
                      className="w-full text-right px-3 py-2 hover:bg-[#182229] text-rose-300 rounded-lg transition-colors flex items-center justify-between cursor-pointer border-t border-[#2a3942]"
                    >
                      <span>إلغاء التحديد</span>
                      <X className="w-4 h-4 text-rose-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-2 md:px-5 py-2 md:py-3 bg-[#161717] border-b border-[#2e2f2f] flex items-center justify-between gap-2 relative z-10 shrink-0">
            <div className="flex items-center gap-1 md:gap-3 min-w-0 flex-1">
              {/* زر الرجوع لقائمة المحادثات (الجوال فقط إذا لم يكن نافذة مستقلة) */}
              {!isPopoutMode && (
                <button
                  type="button"
                  onClick={handleMobileBack}
                  className="md:hidden h-11 w-11 -ms-1 rounded-full text-[#fafafa] hover:bg-[#2e2f2f] cursor-pointer shrink-0 flex items-center justify-center"
                  title="رجوع"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              )}
              {(() => {
                const currentChat = groupsList.find((g) => g.name === activeGroup || g.id === activeGroup) || activeChatInfo;
                return (
                  <>
                    <div
                      onClick={() => {
                        setAvatarLightbox({
                          isOpen: true,
                          url: currentChat?.avatarUrl || '',
                          title: resolvedActiveContactName,
                          subtitle: currentChat?.phone || (currentChat?.isGroup ? 'مجموعة واتساب' : 'محادثة خاصة'),
                          isGroup: currentChat?.isGroup,
                        });
                      }}
                      className="w-10 h-10 rounded-full bg-[#21c063]/20 border border-[#21c063]/40 flex items-center justify-center text-[#21c063] font-bold shrink-0 overflow-hidden relative cursor-pointer hover:ring-2 hover:ring-[#21c063] transition-all"
                      title="انقر لتكبير صورة المحادثة ورؤيتها كاملة"
                    >
                      {currentChat?.avatarUrl ? (
                        <img
                          src={currentChat.avatarUrl}
                          alt={resolvedActiveContactName}
                          className="w-full h-full object-cover rounded-full"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : currentChat?.isGroup ? (
                        <Building className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <User className="w-5 h-5 text-sky-400" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isEditingChatName ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editChatNameValue}
                              onChange={(e) => setEditChatNameValue(e.target.value)}
                              className="bg-[#161717] text-xs text-[#fafafa] px-2 py-1 rounded border border-[#21c063] focus:outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveChatName();
                                if (e.key === 'Escape') setIsEditingChatName(false);
                              }}
                            />
                            <button onClick={handleSaveChatName} className="text-emerald-400 hover:text-white p-1 cursor-pointer">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setIsEditingChatName(false)} className="text-[#a5a5a5] hover:text-white p-1 cursor-pointer">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span
                              onClick={() => fetchChatInfo(activeGroup)}
                              className="text-sm font-bold text-[#fafafa] cursor-pointer hover:underline truncate max-w-[42vw] md:max-w-none"
                              dir="auto"
                              title="عرض معلومات المحادثة / المجموعة"
                            >
                              <bdi>{resolvedActiveContactName}</bdi>
                            </span>
                            <button
                              onClick={() => {
                                setEditChatNameValue(resolvedActiveContactName);
                                setIsEditingChatName(true);
                              }}
                              className="text-[#a5a5a5] hover:text-[#21c063] p-0.5 cursor-pointer"
                              title="تعديل وتسمية هذه المحادثة باسم المشترك"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                      {currentChat?.phone && currentChat.phone !== activeGroup && (
                        <div className="text-[11px] text-emerald-400 font-mono -mt-0.5" dir="ltr">
                          {currentChat.phone}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className={`max-w-[54vw] truncate text-[11px] font-medium ${activePresenceLabel.includes('متصل الآن') || activePresenceLabel.includes('يكتب الآن') ? 'text-[#21c063]' : 'text-[#a5a5a5]'}`} title={activePresenceLabel}>
                          {activePresenceLabel}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex items-center gap-1 md:gap-2 text-[#b8b9b9] shrink-0">
              {/* زر معلومات وبيانات المحادثة أو المجموعة */}
              <button
                type="button"
                onClick={() => fetchChatInfo(activeGroup)}
                className="h-11 w-11 md:h-8 md:w-8 flex items-center justify-center rounded-full text-[#8696a0] hover:text-[#fafafa] hover:bg-[#242626] transition-colors cursor-pointer"
                title="معلومات وبيانات المحادثة"
              >
                <Info className="w-5 h-5" />
              </button>

              {/* زر فتح المحادثة في نافذة مستقلة (Pop-out Window) */}
              {!isPopoutMode ? (
                <button
                  type="button"
                  onClick={() => handlePopoutChat({ name: activeGroup })}
                  className="hidden md:flex h-8 w-8 items-center justify-center rounded-full text-[#8696a0] hover:text-[#21c063] hover:bg-[#242626] transition-colors cursor-pointer"
                  title="فتح المحادثة في نافذة مستقلة (Pop-out)"
                >
                  <ExternalLink className="w-5 h-5" />
                </button>
              ) : (
                <span className="text-[10px] bg-[#21c063]/15 text-[#21c063] border border-[#21c063]/30 px-2 py-0.5 rounded-md font-medium">
                  نافذة مستقلة
                </span>
              )}

              {/* زر إظهار واسترجاع الرسائل المخفية بالعين */}
              {(hiddenInCurrentGroupCount > 0 || showHiddenMessages) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowHiddenMessages(!showHiddenMessages)}
                  className={`h-7.5 text-xs font-bold gap-1.5 rounded-xl cursor-pointer transition-all shadow-sm ${
                    showHiddenMessages
                      ? 'border-amber-500/50 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 shadow-amber-500/20'
                      : 'border-[#2e2f2f] bg-[#161717] text-[#b8b9b9] hover:text-[#fafafa] hover:bg-[#242626]'
                  }`}
                  title={showHiddenMessages ? 'إخفاء الرسائل المستبعدة' : 'عرض الرسائل المخفية واسترجاعها'}
                >
                  <Eye className="w-4 h-4" />
                  <span>{showHiddenMessages ? 'إخفاء المستبعد' : `المخفية (${hiddenInCurrentGroupCount})`}</span>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* جسم المحادثة وقسم الرسائل مع دعم لوحة CRM الجانبية */}
        <div className="flex-1 flex flex-row overflow-hidden relative">
          <div className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
            {/* منطقة الرسائل والفقاعات الممتدة بارتفاع الشاشة */}
            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-y-auto px-3 py-3 sm:px-4 lg:px-5 flex flex-col gap-1 relative z-10"
            >
          {/* تنبيه حالة جلب الرسائل السابقة من الهاتف */}
          {historyBanner && (
            <div
              className={`px-4 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 shadow-lg transition-all animate-in fade-in slide-in-from-top-2 ${
                historyBanner.type === 'success'
                  ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                  : historyBanner.type === 'warning'
                  ? 'bg-amber-950/90 border-amber-500/40 text-amber-200'
                  : historyBanner.type === 'error'
                  ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                  : 'bg-sky-950/90 border-sky-500/40 text-sky-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {historyLoading ? (
                  <RotateCw className="w-4 h-4 animate-spin shrink-0 text-sky-400" />
                ) : historyBanner.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span className="font-medium leading-relaxed">{historyBanner.text}</span>
              </div>
              <button
                onClick={() => setHistoryBanner(null)}
                className="text-white/60 hover:text-white p-1 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* شريط فاصل زمني */}
          <div className="flex justify-center my-1">
            <span className="bg-[#1d1f1f] text-[#a5a5a5] text-xs px-3.5 py-1 rounded-lg border border-[#2e2f2f] shadow-xs">
              سجل المحادثة
            </span>
          </div>

          {/* في حالة عدم وجود رسائل في هذه المجموعة أو المحادثة المحددة */}
          {activeGroupMessages.length === 0 ? (
            readMessagesCount > 0 && hideReadMessages ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3 my-auto">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <CheckCheck className="w-7 h-7 stroke-[2.5]" />
                </div>
                <h3 className="text-base font-bold text-[#fafafa]">تمت قراءة ومعالجة جميع الرسائل</h3>
                <p className="text-xs text-[#a5a5a5] max-w-sm leading-relaxed">
                  لا توجد رسائل جديدة بانتظار الإجراء في هذه المحادثة. تم إخفاء ({readMessagesCount}) رسائل تمت قراءتها سابقاً.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setHideReadMessages(false)}
                  className="h-8 text-xs font-semibold border-[#2e2f2f] bg-[#161717] text-[#21c063] hover:bg-[#242626] px-3.5 rounded-lg cursor-pointer gap-1.5 mt-2"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>عرض الرسائل المقروءة ({readMessagesCount})</span>
                </Button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4 my-auto">
                <div className="w-16 h-16 rounded-full bg-[#242626] border border-[#2e2f2f] flex items-center justify-center text-[#a5a5a5]">
                  <FileText className="w-8 h-8 text-[#a5a5a5]" />
                </div>
                <div className="flex flex-col gap-1 max-w-md">
                  <h3 className="text-base font-bold text-[#fafafa]">
                    {!activeGroup
                      ? 'اختر محادثة أو مجموعة من القائمة الجانبية'
                      : `لا توجد رسائل في (${resolvedActiveContactName}) حالياً`}
                  </h3>
                  <p className="text-xs text-[#a5a5a5] leading-relaxed">
                    {!activeGroup
                      ? 'انقر على أي محادثة أو مجموعة من القائمة الجانبية لعرض رسائلها.'
                      : (waStatus.status === 'CONNECTED'
                          ? 'المحادثة فارغة أو لم يتم استقبال رسائل بها بعد. ستظهر أي رسائل حقيقية جديدة تصل عبر واتساب هنا فوراً.'
                          : 'واتساب غير متصل حالياً. يرجى مسح رمز الاستجابة السريعة (QR) لمزامنة الحساب وجلب الرسائل.')}
                  </p>
                </div>
                <div className="flex items-center flex-wrap justify-center gap-2 mt-2">
                  {waStatus.status === 'CONNECTED' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleSyncChats}
                      disabled={isSyncingChats}
                      className="h-8 text-xs font-bold text-emerald-400 hover:text-white hover:bg-[#242626] px-3 rounded-lg cursor-pointer border border-emerald-500/30"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ml-1.5 ${isSyncingChats ? 'animate-spin' : ''}`} />
                      <span>مزامنة المحادثات</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onOpenQRModal}
                      className="h-8 text-xs font-bold text-emerald-400 hover:text-white hover:bg-[#242626] px-3 rounded-lg cursor-pointer border border-emerald-500/30"
                    >
                      <QrCode className="w-3.5 h-3.5 ml-1.5" />
                      <span>ربط واتساب بالرمز QR</span>
                    </Button>
                  )}
                </div>
              </div>
            )
          ) : (
            <>
              {olderMessagesCount > 0 && (
                <div className="flex items-center justify-center gap-2 py-2 mb-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDisplayMessageLimit((prev) => prev + 60)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#242626] hover:bg-[#2e2f2f] text-xs text-[#a5a5a5] hover:text-[#fafafa] border border-[#3b3d3d] shadow-xs transition-all cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>تحميل رسائل أقدم ({olderMessagesCount} متبقية)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisplayMessageLimit(activeGroupMessages.length)}
                    className="text-[11px] text-[#a5a5a5] hover:text-emerald-400 underline underline-offset-4 cursor-pointer px-1"
                  >
                    عرض الكل
                  </button>
                </div>
              )}
              {groupedMessageItems.map((item, itemIdx) => {
                const firstMessage = item.type === 'album' ? item.msgs[0] : item.msg;
                const previousItem = groupedMessageItems[itemIdx - 1];
                const previousMessage = previousItem
                  ? previousItem.type === 'album' ? previousItem.msgs[previousItem.msgs.length - 1] : previousItem.msg
                  : null;
                const firstTimestamp = getMessageTimestampMs(firstMessage);
                const previousTimestamp = previousMessage ? getMessageTimestampMs(previousMessage) : 0;
                const showDay = firstTimestamp > 0 && (!previousMessage || localMessageDay(firstTimestamp) !== localMessageDay(previousTimestamp));
                const showUnread = unreadStartId === firstMessage.id;
                const timelineMarkers = (
                  <>
                    {showDay && (
                      <div className="flex justify-center py-2" aria-label={`تاريخ الرسائل: ${formatMessageDay(firstTimestamp)}`}>
                        <span className="rounded-lg bg-[#242626]/90 border border-white/10 px-3 py-1 text-[11px] text-[#d1d5d5] shadow-sm">
                          {formatMessageDay(firstTimestamp)}
                        </span>
                      </div>
                    )}
                    {showUnread && (
                      <div id="whatsapp-unread-divider" className="flex items-center gap-3 py-2" role="separator" aria-label="رسائل جديدة">
                        <div className="h-px flex-1 bg-white/30" />
                        <span className="text-[11px] font-medium text-white/80">رسائل جديدة</span>
                        <div className="h-px flex-1 bg-white/30" />
                      </div>
                    )}
                  </>
                );
                if (item.type === 'album') {
                  return <React.Fragment key={item.id}>{timelineMarkers}{renderAlbumMessage(item, itemIdx)}</React.Fragment>;
                }
                const msg = item.msg;
                const msgIdx = item.index;
              const parsed = getCachedParsedTransfer(msg.text, msg);
              const status = actionStatus[msg.id] || {};
              const isProcessing = processingMsgId === msg.id;
              const isSelected = selectedMsgIds.includes(msg.id);

              // تحديد الحالة الشاملة للرسالة بدقة فائقة
              const currentStatus = {
                ...(msg.status || {}),
                ...status,
              };

              const hasAirtable = Boolean(
                currentStatus.airtable ||
                currentStatus.airtableSaved
              );

              // البوابة: تُعتبر الحوالة مسجلة في البوابة حصراً إذا وُجدت بياناتها المؤكدة في مجموعة "حوالات تم رفعها"
              const isUploadedInGroup = checkIsUploadedInGroup(msg, parsed);
              const effectivePortal = isUploadedInGroup;

              // أيرتيبل: تُعتبر مسجلة في أيرتيبل إذا كانت موجودة في قاعدة بيانات أيرتيبل الفعلية أو مسجلة محلياً
              const isRegisteredInAirtable = checkIsRegisteredInAirtable(msg, parsed);
              const effectiveAirtable = hasAirtable || isRegisteredInAirtable;

              const isRegistered = effectiveAirtable || effectivePortal;

              const isReceived = Boolean(
                currentStatus.isReceived ||
                currentStatus.forwardedTo?.includes('استلام')
              );

              const isBoth = (effectiveAirtable && effectivePortal) || (isRegistered && isReceived);
              const isFromMe = Boolean(
                msg.sender === 'أنا' ||
                msg.senderName === 'أنا' ||
                msg.rawBaileysMessage?.key?.fromMe ||
                (msg as any).isFromMe
              );

              // القروبات: صورة المرسل ولون اسمه، وتظهر الصورة والاسم على أول رسالة من سلسلة رسائل نفس الشخص فقط (مثل واتساب)
              const isGroupChat = isActiveChatGroup;
              const prevItem = groupedMessageItems[itemIdx - 1];
              const prevMsg = prevItem ? (prevItem.type === 'album' ? prevItem.msgs[prevItem.msgs.length - 1] : prevItem.msg) : null;
            const isFirstOfSenderRun = !prevMsg || isOwnMessage(prevMsg) || getSenderKey(prevMsg) !== getSenderKey(msg);
            const showGroupAvatar = isGroupChat && !isFromMe;
            const senderColor = getSenderColor(getSenderKey(msg));
            const senderAvatarEl = showGroupAvatar ? (
              <div className="w-7 shrink-0 mt-0.5">
                {isFirstOfSenderRun &&
                  (msg.senderAvatarUrl ? (
                    <img src={msg.senderAvatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                      style={{ backgroundColor: senderColor + '33', color: senderColor }}
                    >
                      {(msg.sender || '?').trim().charAt(0)}
                    </div>
                  ))}
              </div>
            ) : null;

            // تحديد هل الرسالة عبارة عن ملصق واتساب (لكي تظهر بدون فقاعة أو حواف خضراء كواتساب الأصلي تماماً)
            const isStickerMsg = Boolean(
              msg.mediaType === 'sticker' ||
              (msg.mediaUrl && (msg.mediaUrl.endsWith('.webp') || msg.mediaUrl.includes('/stickers/'))) ||
              (!msg.text && msg.hasMedia && msg.mediaType === 'sticker') ||
              (msg.text === 'ملصق' && msg.hasMedia)
            );

            // فحص هل الرسالة تحتوي على بيانات متدربين فعلية
            const hasTraineeName = !isStickerMsg && Boolean(parsed.participantName && parsed.participantName.trim().length >= 3);
            const hasTraineeFormHeaders = !isStickerMsg && /(اسم\s*(المشترك|المتدرب|الطالب|العميل)|بيانات\s*(البوابة|المتدرب|المشترك|الدخول)|قيمة\s*الرسوم)/i.test(msg.text || '');
            const hasExplicitTransferData = !isStickerMsg && Boolean(
              parsed.transferNumber &&
              /حوال[ةه]|دينار|شيكل|دولار|إيداع|ايداع|بنك|كاش|تسليم|ايصال|إيصال|وصل|عقليات|سند|قبض|صراف|دفعة|دفع|تحويل/.test(msg.text || '')
            );
            const hasTraineeData = Boolean(hasTraineeName || hasTraineeFormHeaders || hasExplicitTransferData);

            // تظهر بطاقة إجراءات الحوالة حصراً على الرسائل التي تحتوي على بيانات متدربين
            // ولا تظهر نهائياً للصور المستقلة أو الإيصالات المجردة لتظل واجهة الصور نظيفة كواتساب
            const isTransfer = !msg.uploadState && !isStickerMsg && hasTraineeData;

            // في حال كانت الرسالة عادية (محادثة أو نص قصير أو ملصق أو إيموجي) وليست حوالة أو بيانات متدرب
            if (!isTransfer) {
              return (
                <React.Fragment key={msg.id}>
                {timelineMarkers}
                <div
                  key={msg.id}
                  id={`msg_${msg.id}`}
                  className={`w-full flex ${isFromMe ? 'justify-start' : 'justify-end'} group select-none my-1 transition-all duration-200 ${
                    isSelected ? 'bg-[#005c4b]/20 -mx-3 px-3 py-1 rounded-lg' : ''
                  }`}
                >
                  <div
                    className={`relative flex items-start gap-2 w-fit max-w-[85%] sm:max-w-[75%] lg:max-w-[520px] ${
                      isFromMe ? 'ml-auto mr-0' : 'mr-auto ml-0 flex-row-reverse'
                    }`}
                  >
                    {senderAvatarEl}

                    {/* فقاعة رسالة واتساب (الملصقات بدون أي خلفية أو حواف تماماً كواتساب الرسمي) */}
                    <div
                      onContextMenu={(e) => handleContextMenu(e, msg)}
                      {...getMsgTouchProps(msg, false)}
                      onDoubleClick={() => handleStartReply(msg)}
                      onClick={() => {
                        if (isSelectionMode) {
                          handleToggleSelectMsg(msg.id);
                        }
                      }}
                      className={`text-[#fafafa] relative touch-pan-y [-webkit-touch-callout:none] transition-all duration-200 ${
                        isStickerMsg
                          ? 'bg-transparent border-0 shadow-none p-0 w-fit flex flex-col group/sticker-container'
                          : `rounded-2xl px-3.5 py-2 w-fit max-w-full flex flex-col gap-1 ${
                              isFromMe
                                ? 'rounded-tr-xs bg-[#144d37] border border-[#144d37]/30 shadow-xs'
                                : 'rounded-tl-xs bg-[#242626] border border-[#2e2f2f]/60 shadow-xs'
                            }`
                      } ${
                        hiddenMessageIds.has(msg.id)
                          ? 'border-dashed !border-amber-500/60 bg-amber-950/20'
                          : ''
                      } ${
                        highlightedMsgId === msg.id
                          ? 'ring-4 ring-[#21c063] ring-offset-2 ring-offset-[#161717] bg-[#21c063]/30 scale-[1.02] shadow-2xl'
                          : isSelected
                          ? 'ring-1.5 ring-[#00a884]/80 !bg-[#025144]/60'
                          : ''
                      } ${msg.reactions && msg.reactions.length > 0 ? 'mb-3.5' : ''} ${isSelectionMode ? 'cursor-pointer hover:brightness-110' : ''}`}
                    >
                      {/* وسم الرسالة المخفية عند تفعيل وضع عرض الرسائل المستبعدة */}
                      {hiddenMessageIds.has(msg.id) && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleHideMessage(msg.id);
                          }}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold mb-1 w-fit cursor-pointer hover:bg-amber-500/30 transition-all select-none"
                          title="انقر لاسترجاع هذه الرسالة إلى المحادثة"
                        >
                          <span>رسالة مخفية</span>
                          <span className="text-[9px] underline opacity-80">(انقر للاسترجاع ↩)</span>
                        </div>
                      )}

                      {/* اسم المرسل للرسائل الواردة من أعضاء المجموعة */}
                      {!isFromMe && (!isGroupChat || isFirstOfSenderRun) && (
                        <span className="text-[12px] font-bold block" style={{ color: isGroupChat ? senderColor : '#53bdeb' }} dir="auto">
                          <bdi>{msg.sender}</bdi>
                        </span>
                      )}

                      {/* شارة التحذير إذا كانت الرسالة قد حذفت في واتساب (Anti-Delete) */}
                      {msg.isDeleted && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] font-bold mb-1 w-fit select-none">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 inline" />
                          <span>تم حذف هذه الرسالة في واتساب</span>
                          {msg.deletedAt && (
                            <span className="text-[10px] text-red-400/80 mr-0.5">
                              ({new Date(msg.deletedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})
                            </span>
                          )}
                        </div>
                      )}

                      {/* معاينة الرسالة المقتبس منها (الرد على رسالة) */}
                      {msg.quotedMessage && renderQuotedMessagePreview(msg.quotedMessage, isFromMe)}

                      {/* عرض وسائط الرسالة (صوت، فيديو، صورة، ملصق) مع إمكانية التشغيل والعرض المباشر */}
                      {renderMessageMedia(msg, isFromMe)}

                      {/* إذا كانت الرسالة معدلة ولديها نص قديم، يظهر فوق الرسالة بخط خفيف وشطب خفيف */}
                      {Boolean(msg.isEdited && msg.originalText) && (
                        <div className="mb-1 p-1.5 px-2 rounded-lg bg-black/25 border-r-2 border-amber-400/70 text-[11.5px] text-[#a5a5a5] select-none">
                          <div className="flex items-center gap-1 text-[10px] text-amber-300/90 font-bold mb-0.5">
                            <Pencil className="w-2.5 h-2.5" />
                            <span>الرسالة السابقة:</span>
                          </div>
                          <div className="line-through opacity-75 font-sans whitespace-pre-wrap break-words italic">
                            {msg.originalText}
                          </div>
                        </div>
                      )}

                      {/* نص الرسالة بحجم طبيعي ومباشر بدون صناديق ضخمة (لا يظهر نص للملصقات) */}
                      {!msg.isViewOnce && !isStickerMsg && Boolean(
                        msg.text &&
                          !['ملصق', 'صورة', 'مقطع فيديو', 'تسجيل صوتي', 'مقطع صوتي'].includes(msg.text.trim())
                      ) && (
                        <div className={`text-[13.5px] sm:text-[14px] leading-relaxed text-[#fafafa] whitespace-pre-wrap break-words font-sans ${msg.isDeleted ? 'opacity-80' : ''}`} dir="auto">
                          {renderMessageTextWithMentions(msg.text, { onPhoneClick: openPhoneMenu, highlightQuery: searchQuery })}
                        </div>
                      )}

                      {/* التوقيت وعلامات القراءة وزر الخيارات السريع (عائم فوق الملصق للملصقات كواتساب، أو بالأسفل للرسائل العادية) */}
                      {isStickerMsg ? (
                        <>
                          <div className="absolute bottom-1.5 right-2 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-[10px] text-white/95 flex items-center gap-1 shadow-sm select-none pointer-events-none z-10 font-sans">
                            <span>{msg.timestamp}</span>
                            {renderMessageStatusTicks(msg)}
                          </div>

                          {/* أزرار خيارات سريعة للملصق تطفو عند التحويم كواتساب ويب */}
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleContextMenu(e, msg);
                              }}
                              className="w-6 h-6 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center shadow-md cursor-pointer transition-transform hover:scale-110"
                              title="خيارات الملصق"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                closeAllPopups();
                                handleStartReply(msg);
                              }}
                              className="w-6 h-6 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center shadow-md cursor-pointer transition-transform hover:scale-110"
                              title="رد على الملصق"
                            >
                              <Reply className="w-3 h-3 rtl:rotate-180" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5 text-[10px] text-[#a5a5a5] mt-0.5 select-none self-end">
                          {msg.isEdited && (
                            <span
                              className="text-[9.5px] text-amber-300/90 font-medium inline-flex items-center gap-0.5"
                              title={msg.editedAt ? `تم التعديل: ${new Date(msg.editedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}` : 'رسالة معدلة'}
                            >
                              <Pencil className="w-2.5 h-2.5" />
                              <span>معدلة</span>
                            </span>
                          )}
                          <span>{msg.timestamp}</span>
                          {renderMessageStatusTicks(msg)}

                          {/* زر رد سريع يظهر عند التحويم كواتساب ويب */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              closeAllPopups();
                              handleStartReply(msg);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-[#a5a5a5] hover:text-sky-300 p-0.5 rounded transition-all cursor-pointer inline-flex items-center"
                            title="رد واقتباس (Reply)"
                          >
                            <Reply className="w-3.5 h-3.5 rtl:rotate-180" />
                          </button>

                          {/* زر تفاعل سريع كواتساب ويب */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const willOpen = reactionPickerMsgId !== msg.id;
                              closeAllPopups();
                              if (willOpen) {
                                setReactionPickerMsgId(msg.id);
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 text-[#a5a5a5] hover:text-amber-400 p-0.5 rounded transition-all cursor-pointer inline-flex items-center"
                            title="تفاعل (React)"
                          >
                            <Smile className="w-3.5 h-3.5" />
                          </button>

                          {/* زر خيارات خفي يظهر عند التمرير */}
                          <div className="relative inline-block">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const willOpen = dropdownOpenId !== msg.id;
                                closeAllPopups();
                                if (willOpen) {
                                  setDropdownOpenId(msg.id);
                                }
                              }}
                              className="opacity-0 group-hover:opacity-100 hover:text-white p-0.5 rounded transition-opacity cursor-pointer inline-flex items-center"
                              title="خيارات"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>

                            {dropdownOpenId === msg.id && (
                              <div
                                data-dropdown-menu="true"
                                className="absolute bottom-5 left-0 z-50 w-48 bg-[#242626] border border-[#2e2f2f] rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 text-xs"
                              >
                                <button
                                  onClick={() => {
                                    closeAllPopups();
                                    handleStartReply(msg);
                                  }}
                                  className="text-right px-2.5 py-1.5 hover:bg-[#1d1f1f] text-sky-300 rounded-md flex items-center gap-2 cursor-pointer"
                                >
                                  <Reply className="w-3.5 h-3.5 text-sky-400" />
                                  <span>رد (Reply)</span>
                                </button>
                                {isOutgoingMessage(msg) && !msg.isDeleted && Boolean(msg.text) && (
                                  <button
                                    onClick={() => {
                                      closeAllPopups();
                                      handleStartEditMessage(msg);
                                    }}
                                    className="text-right px-2.5 py-1.5 hover:bg-[#1d1f1f] text-amber-300 rounded-md flex items-center gap-2 cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-amber-400" />
                                    <span>تعديل الرسالة</span>
                                  </button>
                                )}
                                {isOutgoingMessage(msg) && !msg.isDeleted && (
                                  <button
                                    onClick={() => {
                                      closeAllPopups();
                                      handleDeleteOnWhatsApp(msg.id);
                                    }}
                                    className="text-right px-2.5 py-1.5 hover:bg-[#1d1f1f] text-rose-400 rounded-md flex items-center gap-2 cursor-pointer"
                                    title="حذف لدى الجميع في واتساب"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                    <span>حذف لدى الجميع (واتساب)</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    closeAllPopups();
                                    handleToggleHideMessage(msg.id);
                                  }}
                                  className="text-right px-2.5 py-1.5 hover:bg-[#1d1f1f] text-[#fafafa] rounded-md flex items-center gap-2 cursor-pointer"
                                >
                                  {hiddenMessageIds.has(msg.id) ? (
                                    <>
                                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                                      <span>استرجاع الرسالة</span>
                                    </>
                                  ) : (
                                    <>
                                      <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                      <span>إخفاء الرسالة</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    closeAllPopups();
                                    const effReceipt = getEffectiveReceipt(msg);
                                    onOpenReview(parsed, effReceipt?.receiptUrl || msg.mediaUrl, msg.id);
                                  }}
                                  className="text-right px-2.5 py-1.5 hover:bg-[#1d1f1f] text-[#fafafa] rounded-md flex items-center gap-2 cursor-pointer"
                                >
                                  <FileText className="w-3.5 h-3.5 text-[#21c063]" />
                                  <span>تسجيل كحوالة / مراجعة</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* منتقي التفاعل السريع والشارة العائمة للتفاعلات */}
                      {renderQuickReactionPicker(msg, isFromMe)}
                      {renderMessageReactions(msg, isFromMe)}
                    </div>
                  </div>
                </div>
                </React.Fragment>
              );
            }

            // رسالة متدرب أو إيصال حوالة مالية: تظهر فقاعة واتساب أصلية ونظيفة، وأزرار الإجراءات تظهر على الجانب عند تمرير الماوس
            return (
              <React.Fragment key={msg.id}>
              {timelineMarkers}
              <div
                key={msg.id}
                id={`msg_${msg.id}`}
                className={`w-full flex ${isFromMe ? 'justify-start' : 'justify-end'} group relative select-none my-1.5 transition-all duration-200 ${
                  isSelected ? 'bg-[#005c4b]/20 -mx-3 px-3 py-1 rounded-lg' : ''
                }`}
              >
                <div
                  className={`relative flex items-start gap-2 w-fit max-w-[85%] sm:max-w-[75%] lg:max-w-[560px] ${
                    isFromMe ? 'ml-auto mr-0' : 'mr-auto ml-0 flex-row-reverse'
                  }`}
                >
                  {senderAvatarEl}

                  {/* فقاعة رسالة واتساب الطبيعية والنظيفة 100% تماماً كرسالة واتساب الحقيقية */}
                  <div
                    onContextMenu={(e) => handleContextMenu(e, msg, true)}
                    {...getMsgTouchProps(msg, true)}
                    onDoubleClick={() => handleStartReply(msg)}
                    onClick={() => {
                      if (isSelectionMode) {
                        handleToggleSelectMsg(msg.id);
                      }
                    }}
                    className={`text-[#fafafa] rounded-2xl ${
                      isFromMe
                        ? 'rounded-tr-xs bg-[#144d37] border border-[#144d37]/30 shadow-xs'
                        : 'rounded-tl-xs bg-[#242626] border border-[#2e2f2f]/60 shadow-xs'
                    } px-3.5 py-2 w-fit max-w-full flex flex-col gap-1 relative touch-pan-y [-webkit-touch-callout:none] transition-all duration-200 ${
                      highlightedMsgId === msg.id
                        ? 'ring-4 ring-[#21c063] ring-offset-2 ring-offset-[#161717] bg-[#21c063]/30 scale-[1.01] shadow-2xl'
                        : isSelected
                        ? 'ring-1.5 ring-[#00a884]/80 !bg-[#025144]/60'
                        : ''
                    } ${msg.reactions && msg.reactions.length > 0 ? 'mb-3.5' : ''} ${isSelectionMode ? 'cursor-pointer hover:brightness-110' : ''}`}
                  >
                    {/* رأس الرسالة: اسم المرسل وشارة الحالة المصغرة غير المعيقة */}
                    <div className="flex items-center justify-between gap-2.5 select-none">
                      {!isFromMe ? (
                        <span className="text-[12.5px] font-bold block truncate max-w-[220px]" style={{ color: isGroupChat ? senderColor : '#53bdeb' }} dir="auto">
                          <bdi>{msg.sender}</bdi>
                        </span>
                      ) : (
                        <span className="text-[11px] font-bold text-emerald-300/80">أنا</span>
                      )}

                      {/* شارات المنصات المسجلة بدقة: أيرتيبل (داتا بيس) والبوابة (بوابة) واستلام */}
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        {effectiveAirtable && (
                          <span
                            title="مسجلة في قاعدة بيانات أيرتيبل (Airtable)"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-bold shadow-xs hover:bg-blue-500/30 transition-all cursor-default"
                          >
                            <Database className="w-3 h-3 text-blue-400 stroke-[2.5]" />
                            <span>أيرتيبل</span>
                          </span>
                        )}

                        {effectivePortal && (
                          <span
                            title="مسجلة في بوابة عقليات"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold shadow-xs hover:bg-emerald-500/30 transition-all cursor-default"
                          >
                            <Globe className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
                            <span>البوابة</span>
                          </span>
                        )}

                        {isReceived && (
                          <span
                            title="تم استلام الحوالة (كاش/تحويل)"
                            className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold shadow-xs hover:bg-purple-500/30 transition-all cursor-default"
                          >
                            <CheckCircle2 className="w-3 h-3 text-purple-400 stroke-[2.5]" />
                            <span>مستلمة</span>
                          </span>
                        )}

                        {/* زر استلام / تم الاستلام المخصص للجوال */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleReceived(msg);
                          }}
                          className={`md:hidden inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold border transition-all cursor-pointer active:scale-95 ${
                            isReceived
                              ? 'bg-purple-600/30 text-purple-200 border-purple-500/60 shadow-xs'
                              : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/15'
                          }`}
                          title={isReceived ? 'إلغاء وسم الاستلام' : 'تحديد الحوالة بأنها تم استلامها'}
                        >
                          <CheckCircle2 className={`w-3.5 h-3.5 ${isReceived ? 'text-purple-400' : 'text-gray-300'}`} />
                          <span>{isReceived ? 'تم الاستلام' : 'استلام'}</span>
                        </button>
                      </div>
                    </div>

                    {/* شارة التحذير إذا كانت رسالة الحوالة قد حذفت في واتساب (Anti-Delete) */}
                    {msg.isDeleted && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-[11px] font-bold mb-1 w-fit select-none">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 inline" />
                        <span>تم حذف هذه الرسالة في واتساب</span>
                        {msg.deletedAt && (
                          <span className="text-[10px] text-red-400/80 mr-0.5">
                            ({new Date(msg.deletedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })})
                          </span>
                        )}
                      </div>
                    )}

                    {/* معاينة الرسالة المقتبس منها (الرد على رسالة) إن وجدت */}
                    {msg.quotedMessage && renderQuotedMessagePreview(msg.quotedMessage, isFromMe)}

                    {/* وسائط الحوالة أو صورة الإيصال بمظهر واتساب نظيف وتفاعلي مع إمكانية الفتح داخل الصفحة */}
                    {renderMessageMedia(msg, isFromMe)}

                    {/* إذا كانت الرسالة معدلة ولديها نص قديم، يظهر فوق الرسالة بخط خفيف وشطب خفيف */}
                    {Boolean(msg.isEdited && msg.originalText) && (
                      <div className="mb-1 p-1.5 px-2 rounded-lg bg-black/25 border-r-2 border-amber-400/70 text-[11.5px] text-[#a5a5a5] select-none">
                        <div className="flex items-center gap-1 text-[10px] text-amber-300/90 font-bold mb-0.5">
                          <Pencil className="w-2.5 h-2.5" />
                          <span>الرسالة السابقة:</span>
                        </div>
                        <div className="line-through opacity-75 font-sans whitespace-pre-wrap break-words italic">
                          {msg.originalText}
                        </div>
                      </div>
                    )}

                    {/* نص الحوالة / المشترك: نظيف وطبيعي 100% مثل واتساب الحقيقي (لا يُعرض نص إذا كانت الكلمة 'صورة') */}
                    {Boolean(
                      msg.text &&
                        !['ملصق', 'صورة', 'مقطع فيديو', 'تسجيل صوتي', 'مقطع صوتي'].includes(msg.text.trim())
                    ) && (
                      <div className={`text-[13.5px] sm:text-[14px] leading-relaxed text-[#fafafa] whitespace-pre-wrap break-words font-sans py-0.5 ${msg.isDeleted ? 'opacity-80' : ''}`} dir="auto">
                        {renderMessageTextWithMentions(msg.text, { onPhoneClick: openPhoneMenu, highlightQuery: searchQuery })}
                      </div>
                    )}

                    {/* التوقيت وعلامات القراءة في زاوية الرسالة تماماً كواتساب */}
                    <div className="flex items-center justify-end gap-1.5 text-[11px] text-[#a5a5a5] mt-0.5 select-none self-end">
                      {msg.isEdited && (
                        <span
                          className="text-[9.5px] text-amber-300/90 font-medium inline-flex items-center gap-0.5"
                          title={msg.editedAt ? `تم التعديل: ${new Date(msg.editedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}` : 'رسالة معدلة'}
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          <span>معدلة</span>
                        </span>
                      )}
                      <span>{msg.timestamp}</span>
                      {renderMessageStatusTicks(msg, isBoth)}
                    </div>

                    {/* شارة التفاعلات على زاوية الرسالة نفسها (وليس داخل بطاقة الإجراءات) */}
                    {renderMessageReactions(msg, isFromMe)}
                  </div>

                  {/* كبسات الإجراءات تظهر حصراً على الجانب عند تمرير الماوس فوق الرسالة بتصميم عصري فخم */}
                  <div
                    className={`max-md:hidden absolute z-30 opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-200 md:top-0 ${
                      isFromMe ? 'md:right-full md:mr-3' : 'md:left-full md:ml-3'
                    } max-md:bottom-1 max-md:start-2 max-md:end-2 w-[248px] bg-[#111212]/95 backdrop-blur-2xl border border-white/10 hover:border-emerald-500/30 rounded-2xl p-3 shadow-[0_18px_50px_rgba(0,0,0,0.85)] flex flex-col gap-2.5 transition-all`}
                  >
                    {/* رأس شريط الإجراءات الجانبي */}
                    <div className="flex items-center justify-between px-0.5 text-[11px] font-bold border-b border-white/[0.07] pb-2 select-none">
                      <span className="flex items-center gap-1.5 text-white/90">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        <span>إجراءات الحوالة</span>
                      </span>
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {effectiveAirtable && (
                          <span
                            title="مسجلة في قاعدة بيانات أيرتيبل"
                            className="bg-blue-500/20 text-blue-300 border border-blue-500/40 px-1.5 py-0.5 rounded-full text-[9.5px] font-extrabold flex items-center gap-1 shadow-xs"
                          >
                            <Database className="w-2.5 h-2.5 text-blue-400" />
                            <span>أيرتيبل</span>
                          </span>
                        )}

                        {effectivePortal && (
                          <span
                            title="مسجلة في بوابة عقليات"
                            className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded-full text-[9.5px] font-extrabold flex items-center gap-1 shadow-xs"
                          >
                            <Globe className="w-2.5 h-2.5 text-emerald-400" />
                            <span>البوابة</span>
                          </span>
                        )}

                        {!effectiveAirtable && !effectivePortal && isReceived && (
                          <span
                            title="تم استلام الحوالة"
                            className="bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 shadow-xs"
                          >
                            <CheckCircle2 className="w-3 h-3 text-purple-400 stroke-[2.5]" />
                            <span>مستلمة</span>
                          </span>
                        )}

                        {!effectiveAirtable && !effectivePortal && !isReceived && (
                          <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            بانتظار الإجراء
                          </span>
                        )}
                      </div>
                    </div>

                    {/* أزرار التسجيل في أيرتيبل والبوابة (تظهر على أجهزة سطح المكتب فقط كما طلب المستخدم) */}
                    <div className="hidden md:flex md:flex-col gap-1.5 pt-1">
                      {/* زر التسجيل الشامل الأساسي - يفتح صفحة البوابة وتعبئة البيانات تلقائياً ويسجل في أيرتيبل */}
                      <Button
                        size="sm"
                        onClick={() => handleDirectFullSubmit(msg)}
                        disabled={isProcessing}
                        className={`h-9 text-xs font-bold w-full rounded-xl gap-2 cursor-pointer transition-all duration-200 active:scale-[0.98] ${
                          isBoth
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-950/40 border border-emerald-400/20'
                            : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-950/30 border border-emerald-400/20'
                        }`}
                        title={isBoth ? 'انقر لإعادة الاعتماد والتسجيل مجدداً' : 'فتح صفحة البوابة وتعبئة البيانات تلقائياً وحفظ السجل في أيرتيبل'}
                      >
                        {isBoth ? <RotateCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span>{isBoth ? 'إعادة التسجيل والاعتماد' : 'تسجيل وحفظ شامل'}</span>
                      </Button>

                      {/* شبكة الأزرار السريعة بتصميم عصري وأنيق */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {/* زر تعبئة البوابة */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenPortalWithAutoFill(msg)}
                          disabled={isProcessing}
                          className={`h-8 text-[11px] font-bold px-2 rounded-xl gap-1.5 cursor-pointer transition-all hover:-translate-y-0.5 ${
                            effectivePortal
                              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 shadow-xs'
                              : 'border-teal-500/35 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 hover:border-teal-500/50 shadow-xs'
                          }`}
                          title="فتح صفحة البوابة وتعبئة الحقول تلقائياً"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-teal-300 shrink-0" />
                          <span className="truncate">{effectivePortal ? 'إعادة البوابة' : 'البوابة'}</span>
                        </Button>

                        {/* زر أيرتيبل فقط */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDirectAirtableSubmit(msg)}
                          disabled={isProcessing}
                          className={`h-8 text-[11px] font-bold px-2 rounded-xl gap-1.5 cursor-pointer transition-all hover:-translate-y-0.5 ${
                            effectiveAirtable
                              ? 'border-blue-500/40 bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 shadow-xs'
                              : 'border-blue-500/35 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:border-blue-500/50 shadow-xs'
                          }`}
                          title="حفظ السجل في قاعدة بيانات أيرتيبل"
                        >
                          <Database className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                          <span className="truncate">{currentStatus.airtable ? 'إعادة أيرتيبل' : 'أيرتيبل'}</span>
                        </Button>

                        {/* زر إرسال للقروب */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSendCredentialsToGroup(msg)}
                          disabled={isProcessing}
                          className={`h-8 text-[11px] font-bold px-2 rounded-xl gap-1.5 cursor-pointer transition-all hover:-translate-y-0.5 ${
                            currentStatus.forwardedTo === 'حوالات تم رفعها'
                              ? 'border-emerald-500/50 bg-emerald-500/25 text-emerald-300 hover:bg-emerald-500/35 shadow-xs'
                              : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:border-emerald-500/50 shadow-xs'
                          }`}
                          title="إرسال بيانات الدخول إلى مجموعة حوالات تم رفعها"
                        >
                          <SendHorizontal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="truncate">للإداريين</span>
                        </Button>

                        {/* زر تأكيد الاستلام */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleReceived(msg)}
                          className={`h-8 text-[11px] font-bold px-2 rounded-xl gap-1.5 cursor-pointer transition-all hover:-translate-y-0.5 ${
                            isReceived
                              ? 'border-emerald-500/60 bg-emerald-500/25 text-emerald-300 hover:bg-emerald-500/35 shadow-xs'
                              : 'border-[#2e2f2f] bg-[#1d1f1f] text-[#a5a5a5] hover:text-white hover:bg-[#242626]'
                          }`}
                          title={isReceived ? 'إلغاء وسم الاستلام' : 'تحديد الحوالة بأنها تم استلامها'}
                        >
                          <CheckCircle2 className={`w-3.5 h-3.5 shrink-0 ${isReceived ? 'text-emerald-400' : 'text-[#a5a5a5]'}`} />
                          <span className="truncate">{isReceived ? 'تم الاستلام' : 'استلام'}</span>
                        </Button>
                      </div>
                    </div>

                    {/* زر تحويل الحوالة لمجموعات أخرى - يفتح شاشة التحويل الشبيهة بواتساب والقوائم المخصصة */}
                    <div className="relative w-full">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMsgIds([msg.id]);
                          setTargetChatsToForward([]);
                          setForwardSearchQuery('');
                          setIsForwardModalOpen(true);
                        }}
                        className="h-8 text-[11px] font-bold w-full border-purple-500/35 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20 hover:border-purple-500/50 rounded-xl justify-between px-2.5 cursor-pointer transition-all hover:-translate-y-0.5 shadow-xs"
                      >
                        <span className="flex items-center gap-1.5">
                          <Share2 className="w-3.5 h-3.5 text-purple-300" />
                          <span>تحويل لمجموعة / قوائم الشغل</span>
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 text-purple-300" />
                      </Button>
                    </div>

                    {/* شريط الإجراءات السريعة (رد، تفاعل، مراجعة، إخفاء بالعين، فك القفل) */}
                    <div className="flex items-center justify-between border-t border-white/[0.07] pt-2 px-1">
                      {/* رد */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeAllPopups();
                          handleStartReply(msg);
                        }}
                        className="p-1.5 rounded-lg text-sky-400 hover:bg-sky-500/15 hover:text-sky-300 transition-all cursor-pointer"
                        title="رد واقتباس (Reply)"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>

                      {/* تفاعل */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const willOpen = reactionPickerMsgId !== msg.id;
                          closeAllPopups();
                          if (willOpen) {
                            setReactionPickerMsgId(msg.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/15 hover:text-amber-300 transition-all cursor-pointer"
                        title="تفاعل (React)"
                      >
                        <Smile className="w-3.5 h-3.5" />
                      </button>

                      {/* مراجعة وتعديل (سطح المكتب فقط) */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeAllPopups();
                          const effReceipt = getEffectiveReceipt(msg);
                          onOpenReview(parsed, effReceipt?.receiptUrl || msg.mediaUrl || (linkedReceipts[msg.id]?.receiptUrl), msg.id);
                        }}
                        className="hidden md:inline-flex p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300 transition-all cursor-pointer"
                        title="مراجعة وتدقيق الحوالة"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>

                      {/* إخفاء / استرجاع الرسالة بإيموجي العين 👁️ */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeAllPopups();
                          handleToggleHideMessage(msg.id);
                        }}
                        className={`w-7 h-7 rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                          hiddenMessageIds.has(msg.id)
                            ? 'bg-amber-500/25 ring-1 ring-amber-400/60 shadow-xs'
                            : 'hover:bg-white/10 opacity-70 hover:opacity-100'
                        }`}
                        title={hiddenMessageIds.has(msg.id) ? 'استرجاع الرسالة وإظهارها' : 'إخفاء الرسالة من المحادثة'}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {/* فك القفل إن كانت مسجلة */}
                      {(effectivePortal || effectiveAirtable || isReceived) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            closeAllPopups();
                            handleResetMessageStatus(msg.id);
                          }}
                          className="p-1.5 rounded-lg text-amber-400 hover:bg-amber-500/15 transition-all cursor-pointer"
                          title="فك القفل / إعادة تعيين الحالة للتسجيل مجدداً"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* فك الشبك إن كان هناك وصل مشبوك */}
                      {linkedReceipts[msg.id] && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            closeAllPopups();
                            handleUnlinkReceipt(msg.id);
                          }}
                          className="p-1.5 rounded-lg text-rose-400 hover:bg-[#242626] transition-colors cursor-pointer"
                          title="فك ارتباط صورة الوصل"
                        >
                          <Link2 className="w-3.5 h-3.5 line-through" />
                        </button>
                      )}
                    </div>

                    {/* منتقي التفاعل السريع */}
                    {renderQuickReactionPicker(msg, isFromMe)}
                  </div>
                </div>
              </div>
              </React.Fragment>
            );
          })}
        </>
      )}
          {/* مرساة التمرير الدقيقة لآخر رسالة */}
          <div ref={messagesEndRef} className="h-1 shrink-0" />
        </div>

        {/* شريط عائم سفلي لشبك صورة الوصل مع نص الحوالة أو شبك صورتين معاً عند تحديدهما */}
        {isSelectionMode && canLinkSelected && (
          <div className="fixed sm:absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] bg-[#1d1f1f]/95 border-2 border-[#21c063] shadow-2xl rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-center gap-2 sm:gap-2.5 animate-in fade-in slide-in-from-bottom-3 backdrop-blur-md">
            <div className="flex items-center gap-2 text-xs text-[#fafafa]">
              <span className="w-2 h-2 rounded-full bg-[#21c063] animate-ping" />
              <span className="font-bold text-emerald-400">
                {isTwoImagesSelected
                  ? 'صورتان محددتان (صورة حوالة + وصل)'
                  : (selectedTextMsgs && selectedTextMsgs.length > 1)
                  ? `صورة وصل واحدة + (${selectedTextMsgs.length}) حوالات نصية`
                  : `صورة وصل + حوالة (${getCachedParsedTransfer(selectedTextMsg?.text || '', selectedTextMsg).participantName || 'نص الحوالة'})`}
              </span>
            </div>

            <Button
              size="sm"
              onClick={handleLinkSelectedMessages}
              className="h-8 text-xs font-black bg-[#21c063] hover:bg-[#1daa55] text-white px-3.5 rounded-xl shadow-md cursor-pointer gap-1.5"
            >
              <Link2 className="w-4 h-4" />
              <span>
                {isTwoImagesSelected
                  ? 'شبك الصورتين معاً'
                  : (selectedTextMsgs && selectedTextMsgs.length > 1)
                  ? `شبك الوصل مع (${selectedTextMsgs.length}) حوالات`
                  : 'شبك الوصل مع الحوالة'}
              </span>
            </Button>

            {isTwoImagesSelected && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleMergeSelectedImages}
                className="h-8 text-xs font-bold border-[#21c063]/50 text-emerald-300 hover:bg-[#21c063]/15 px-3 rounded-xl cursor-pointer gap-1.5"
                title="دمج الصورتين في ملف صورة موحد عالي الدقة"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>دمج في صورة واحدة</span>
              </Button>
            )}

            <button
              onClick={() => {
                setIsSelectionMode(false);
                setSelectedMsgIds([]);
              }}
              className="text-[#a5a5a5] hover:text-white p-1 cursor-pointer"
              title="إلغاء التحديد"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* زر التمرير السريع لآخر رسالة (يظهر عند الصعود للأعلى) */}
        {showScrollBottomBtn && (
          <button
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-20 left-6 z-30 bg-[#242626] hover:bg-[#2e2f2f] text-[#21c063] hover:text-[#21c063] border border-[#2e2f2f] shadow-2xl rounded-full p-2.5 flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer animate-in fade-in zoom-in-90"
            title="الانتقال إلى آخر رسالة"
          >
            <ChevronDown className="w-5 h-5 stroke-[2.5]" />
          </button>
        )}

        {/* شريط الرد المقتبس العائم فوق حقل الإدخال مباشرة */}
        {replyingToMessage && (
          <div className="px-3.5 py-2 bg-[#1d1f1f] border-t border-[#2e2f2f] flex items-center justify-between gap-3 relative z-10 shrink-0 select-none animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-1 self-stretch rounded-full bg-[#21c063] shrink-0" />
              <div className="flex-1 min-w-0 text-right">
                <div className="flex items-center gap-1.5">
                  <Reply className="w-3.5 h-3.5 text-[#21c063] shrink-0" />
                  <span className="text-xs font-bold text-[#21c063] truncate">
                    الرد على: {replyingToMessage.isFromMe || replyingToMessage.sender === 'أنا' ? 'أنت' : replyingToMessage.sender}
                  </span>
                </div>
                <div className="text-xs text-[#a5a5a5] truncate mt-0.5">
                  {(() => {
                    const rUrl = replyingToMessage.mediaUrl || linkedReceipts[replyingToMessage.id]?.receiptUrl || '';
                    const rLower = (rUrl || replyingToMessage.text || '').toLowerCase();
                    const isPdf = rLower.endsWith('.pdf') || rLower.includes('.pdf') || replyingToMessage.mediaType === 'document';
                    const hasMedia = Boolean(rUrl || replyingToMessage.hasMedia);

                    if (hasMedia) {
                      return (
                        <span className="inline-flex items-center gap-1">
                          {isPdf ? (
                            <>
                              <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              <span className="text-rose-300 font-medium shrink-0">[مستند PDF]</span>
                            </>
                          ) : (
                            <>
                              <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              {replyingToMessage.text &&
                              !['ملصق', 'صورة', 'مقطع فيديو', 'تسجيل صوتي', 'مقطع صوتي'].includes(replyingToMessage.text.trim()) ? (
                                <span className="text-[#d1d7db]">{replyingToMessage.text}</span>
                              ) : null}
                            </>
                          )}
                        </span>
                      );
                    }
                    return <span>{replyingToMessage.text || 'رسالة'}</span>;
                  })()}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {(() => {
                const rUrl = replyingToMessage.mediaUrl || linkedReceipts[replyingToMessage.id]?.receiptUrl;
                if (!rUrl) return null;
                const isPdf = rUrl.toLowerCase().endsWith('.pdf') || rUrl.toLowerCase().includes('.pdf') || replyingToMessage.mediaType === 'document';
                return (
                  <div className="w-10 h-10 rounded-md overflow-hidden bg-black/40 border border-[#2e2f2f] shrink-0 flex items-center justify-center">
                    {isPdf ? (
                      <div className="flex flex-col items-center justify-center text-rose-400">
                        <FileText className="w-4 h-4 mb-0.5 text-rose-500" />
                        <span className="text-[8px] font-bold uppercase text-white bg-rose-600 px-1 rounded-xs leading-none">PDF</span>
                      </div>
                    ) : (
                      <img
                        src={rUrl}
                        alt="معاينة"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                );
              })()}
              <button
                type="button"
                onClick={handleCancelReply}
                className="p-1 text-[#a5a5a5] hover:text-white hover:bg-[#242626] rounded-full transition-colors cursor-pointer"
                title="إلغاء الرد"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* شريط تعديل الرسالة العائم فوق حقل الإدخال مباشرة */}
        {editingMessage && (
          <div className="px-3.5 py-2 bg-[#1f1d18] border-t border-amber-500/30 flex items-center justify-between gap-3 relative z-10 shrink-0 select-none animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-1 self-stretch rounded-full bg-amber-500 shrink-0" />
              <div className="flex-1 min-w-0 text-right">
                <div className="flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-xs font-bold text-amber-400 truncate">
                    تعديل الرسالة (سيتم تحديثها أيضاً في واتساب):
                  </span>
                </div>
                <div className="text-xs text-[#a5a5a5] truncate mt-0.5 font-sans">
                  {editingMessage.text || 'رسالة'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="p-1 text-[#a5a5a5] hover:text-white hover:bg-[#242626] rounded-full transition-colors cursor-pointer"
                title="إلغاء التعديل (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* شريط الإدخال الفعلي والتفاعلي لواتساب في المجموعة المحددة */}
        <div className="px-3 py-2 bg-[#242626] border-t border-[#2e2f2f] flex flex-col gap-2 relative z-10 shrink-0 select-none">
          {isRecordingAudio ? (
            /* شريط التسجيل الصوتي الحي المباشر (Voice Recording Bar) */
            <div className="flex items-center justify-between gap-3 bg-[#1d1f1f] border border-[#2e2f2f] rounded-2xl px-4 py-2 shadow-lg animate-in fade-in zoom-in-95 duration-150">
              {/* زر حذف وإلغاء التسجيل */}
              <button
                type="button"
                onClick={cancelVoiceRecording}
                disabled={isSendingAudio}
                className="w-8.5 h-8.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50 shrink-0"
                title="إلغاء وحذف التسجيل"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* مؤشر التسجيل النابض والموجات الصوتية والعداد */}
              <div className="flex-1 flex items-center justify-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  <span className="text-xs font-bold text-rose-400">تسجيل صوتي...</span>
                </div>

                {/* موجات صوتية متحركة بنبضات حية */}
                <div className="flex items-center gap-1 h-5 px-2">
                  <span className="w-1 bg-[#21c063] rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-3" />
                  <span className="w-1 bg-[#21c063] rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-5" />
                  <span className="w-1 bg-[#21c063] rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-2" />
                  <span className="w-1 bg-[#21c063] rounded-full animate-[pulse_0.9s_ease-in-out_infinite] h-5" />
                  <span className="w-1 bg-[#21c063] rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-4" />
                  <span className="w-1 bg-[#21c063] rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-3" />
                  <span className="w-1 bg-[#21c063] rounded-full animate-[pulse_0.8s_ease-in-out_infinite] h-5" />
                  <span className="w-1 bg-[#21c063] rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-2" />
                </div>

                {/* عداد وقت التسجيل الحي */}
                <span className="font-mono text-xs font-bold text-[#fafafa] bg-[#242626] px-2.5 py-1 rounded-lg border border-[#2e2f2f]">
                  {formatRecordingDuration(recordingDuration)}
                </span>
              </div>

              {/* زر إرسال التسجيل الصوتي الأخضر */}
              <button
                type="button"
                onClick={stopAndSendVoiceRecording}
                disabled={isSendingAudio}
                className="w-8.5 h-8.5 rounded-full bg-[#21c063] hover:bg-[#1daa55] text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50 shrink-0"
                title="إرسال البصمة الصوتية للعميل"
              >
                {isSendingAudio ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <SendHorizontal className="w-4 h-4 rtl:rotate-180" />
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
            {/* زر وقائمة المرفقات (Attachment Menu 📎) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAttachmentMenuOpen((prev) => !prev)}
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  attachmentMenuOpen
                    ? 'bg-[#3b3d3d] text-[#21c063]'
                    : 'text-[#a5a5a5] hover:text-[#fafafa] hover:bg-[#2e2f2f]'
                }`}
                title="إرفاق ملفات أو وسائط (مستندات، صور، فيديوهات، ملصقات)"
              >
                <Paperclip className={`w-5 h-5 transition-transform duration-200 ${attachmentMenuOpen ? 'rotate-45' : ''}`} />
              </button>

              {/* القائمة المنبثقة لأعلى للمرفقات بتصميم واتساب الدائري الأصلي */}
              {attachmentMenuOpen && (
                <div
                  ref={attachmentMenuRef}
                  className="absolute bottom-12 right-0 bg-[#242626] border border-[#2e2f2f] rounded-2xl p-2.5 shadow-2xl z-50 flex flex-col gap-1.5 min-w-[210px] animate-in fade-in slide-in-from-bottom-3 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 1. مستند أو ملف */}
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentMenuOpen(false);
                      docInputRef.current?.click();
                    }}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#1d1f1f] transition-colors cursor-pointer group text-right w-full"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#7f66ff] group-hover:scale-105 transition-transform flex items-center justify-center text-white shadow-md shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#fafafa] group-hover:text-white">مستند أو ملف</div>
                      <div className="text-[10px] text-[#a5a5a5]">PDF، Word، Excel، مضغوط</div>
                    </div>
                  </button>

                  {/* 2. صور ومقاطع فيديو */}
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentMenuOpen(false);
                      imageVideoInputRef.current?.click();
                    }}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#1d1f1f] transition-colors cursor-pointer group text-right w-full"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#007bfc] group-hover:scale-105 transition-transform flex items-center justify-center text-white shadow-md shrink-0">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#fafafa] group-hover:text-white">صور ومقاطع فيديو</div>
                      <div className="text-[10px] text-[#a5a5a5]">JPG، PNG، MP4</div>
                    </div>
                  </button>

                  {/* 3. ملصق واتساب ومتجر الستيكرات */}
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentMenuOpen(false);
                      setIsStickerPickerOpen(true);
                    }}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#1d1f1f] transition-colors cursor-pointer group text-right w-full"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#02a698] group-hover:scale-105 transition-transform flex items-center justify-center text-white shadow-md shrink-0">
                      <Smile className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#fafafa] group-hover:text-white">متجر وملصقات واتساب ⭐</div>
                      <div className="text-[10px] text-[#a5a5a5]">تصفح الحزم، المفضلة، وإرسال الملصقات</div>
                    </div>
                  </button>

                  {/* 4. مقطع صوتي */}
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentMenuOpen(false);
                      audioInputRef.current?.click();
                    }}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#1d1f1f] transition-colors cursor-pointer group text-right w-full"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#e35d5b] group-hover:scale-105 transition-transform flex items-center justify-center text-white shadow-md shrink-0">
                      <Music className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#fafafa] group-hover:text-white">مقطع صوتي</div>
                      <div className="text-[10px] text-[#a5a5a5]">ملف صوتي MP3، M4A</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* زر ملصقات ومتجر ستيكرات واتساب والمفضلة ⭐ */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsStickerPickerOpen((prev) => !prev)}
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  isStickerPickerOpen
                    ? 'bg-[#3b3d3d] text-[#21c063]'
                    : 'text-[#a5a5a5] hover:text-[#fafafa] hover:bg-[#2e2f2f]'
                }`}
                title="الملصقات، المفضلة، ومتجر ستيكرات واتساب (WhatsApp Sticker Store)"
              >
                <Smile className="w-5 h-5" />
              </button>

              <WhatsAppStickerPicker
                isOpen={isStickerPickerOpen}
                onClose={() => setIsStickerPickerOpen(false)}
                onSendSticker={handleSendStickerDirect}
                favoriteStickers={favoriteStickers}
                onToggleFavorite={handleToggleFavoriteSticker}
                recentStickers={recentStickers}
                onInsertEmoji={handleInsertEmoji}
              />
            </div>

            {/* حقول رفع الملفات المخفية */}
            <input
              ref={imageVideoInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f);
                e.target.value = '';
              }}
            />
            <input
              ref={docInputRef}
              type="file"
              accept="*/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f, 'document');
                e.target.value = '';
              }}
            />
            <input
              ref={stickerInputRef}
              type="file"
              accept=".webp,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f, 'sticker');
                e.target.value = '';
              }}
            />
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelected(f, 'audio');
                e.target.value = '';
              }}
            />

            {/* زر القوالب والردود السريعة (/) */}
            <button
              type="button"
              data-quick-replies-trigger="true"
              onClick={() => {
                setIsQuickRepliesMenuOpen((prev) => !prev);
                setQuickRepliesQuery('');
                setQuickRepliesSelectedIndex(0);
              }}
              className={`p-2 rounded-full transition-colors cursor-pointer ${
                isQuickRepliesMenuOpen
                  ? 'bg-[#3b3d3d] text-[#21c063]'
                  : 'text-[#a5a5a5] hover:text-[#21c063] hover:bg-[#2e2f2f]'
              }`}
              title="القوالب والردود السريعة (اكتب / للاختصار)"
            >
              <Zap className="w-5 h-5" />
            </button>

            {/* قائمة المنشن (@): أعضاء القروب من بيانات واتساب */}
            {mentionMenu && isActiveChatGroup && (
              <div className="absolute bottom-full mb-2 right-3 left-3 sm:left-auto sm:right-12 sm:w-[360px] max-h-[320px] bg-[#242626] border border-[#2e2f2f] rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150 select-none">
                <div className="px-3.5 py-2 bg-[#1d1f1f] border-b border-[#2e2f2f] text-[11px] text-[#a5a5a5] flex items-center justify-between">
                  <span>منشن عضو من القروب</span>
                  <span className="font-mono">↑↓ Enter</span>
                </div>
                <div className="overflow-y-auto">
                  {mentionParticipants.loading && (
                    <div className="flex items-center justify-center gap-2 py-5 text-xs text-[#a5a5a5]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جاري جلب أعضاء القروب...
                    </div>
                  )}
                  {!mentionParticipants.loading && filteredMentionParticipants.length === 0 && (
                    <p className="py-5 text-center text-xs text-[#7a7c7c]">لا يوجد عضو بهذا الاسم</p>
                  )}
                  {filteredMentionParticipants.map((p: any, i: number) => (
                    <button
                      key={p.jid}
                      type="button"
                      onMouseDown={(e) => {
                        // منع فقدان التركيز من حقل الكتابة قبل الإدراج
                        e.preventDefault();
                        handleSelectMention(p);
                      }}
                      onMouseEnter={() => setMentionMenu((prev) => (prev ? { ...prev, index: i } : prev))}
                      className={`w-full flex items-center gap-3 px-3.5 py-2 text-right transition-colors cursor-pointer ${
                        i === mentionMenu.index ? 'bg-[#2e2f2f]' : 'hover:bg-[#2e2f2f]'
                      }`}
                    >
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#3b3d3d] flex items-center justify-center text-xs font-bold text-[#a5a5a5] shrink-0">
                          {(p.name || '?').trim().charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-[#fafafa] truncate">{p.name}</div>
                        {p.phone && p.phone !== p.name && (
                          <div className="text-[11px] text-[#a5a5a5] font-mono" dir="ltr">{p.phone}</div>
                        )}
                      </div>
                      {p.isAdmin && <span className="text-[10px] text-[#21c063] shrink-0">مشرف</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* قائمة القوالب والردود السريعة الذكية (Slash Menu) */}
            <QuickRepliesMenu
              isOpen={isQuickRepliesMenuOpen}
              searchQuery={quickRepliesQuery}
              templates={filteredQuickReplies}
              selectedIndex={quickRepliesSelectedIndex}
              onSelect={handleSelectQuickReply}
              onClose={() => setIsQuickRepliesMenuOpen(false)}
              onOpenManager={() => {
                setIsQuickRepliesMenuOpen(false);
                setIsQuickRepliesModalOpen(true);
              }}
              activeChatName={resolvedActiveContactName}
            />

            <div
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className="flex-1 flex items-center bg-[#2e2f2f] rounded-xl px-3 py-1.5 border border-[#3b3d3d] focus-within:border-[#21c063] transition-colors"
            >
              <input
                ref={messageInputRef}
                type="text"
                autoComplete="off"
                enterKeyHint="send"
                onPaste={handleClipboardPaste}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onChange={(e) => {
                  const val = e.target.value;
                  // لا نحفظ النص في state (لتفادي إعادة رسم الشاشة مع كل حرف)، فقط نبدّل زر الإرسال عند الحاجة
                  const nextHasText = Boolean(val.trim());
                  if (nextHasText !== hasMessageText) setHasMessageText(nextHasText);

                  // المنشن: فتح قائمة أعضاء القروب عند كتابة @
                  updateMentionMenu(val, e.target.selectionStart ?? val.length);

                  // التحقق من كتابة رمز القوالب السريعة (/)
                  const slashIdx = val.lastIndexOf('/');
                  if (slashIdx !== -1 && (slashIdx === 0 || /\s/.test(val[slashIdx - 1]))) {
                    const query = val.slice(slashIdx + 1);
                    if (!query.includes(' ')) {
                      setQuickRepliesQuery(query);
                      setQuickRepliesSelectedIndex(0);
                      setIsQuickRepliesMenuOpen(true);
                      return;
                    }
                  }
                  setIsQuickRepliesMenuOpen(false);
                }}
                onKeyDown={(e) => {
                  // التنقل داخل قائمة المنشن بالأسهم واختيار العضو بـ Enter
                  if (mentionMenu && filteredMentionParticipants.length > 0) {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      const n = filteredMentionParticipants.length;
                      setMentionMenu({
                        ...mentionMenu,
                        index: (mentionMenu.index + (e.key === 'ArrowDown' ? 1 : n - 1)) % n,
                      });
                      return;
                    }
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      handleSelectMention(filteredMentionParticipants[mentionMenu.index] || filteredMentionParticipants[0]);
                      return;
                    }
                  }
                  if (mentionMenu && e.key === 'Escape') {
                    e.preventDefault();
                    setMentionMenu(null);
                    return;
                  }
                  if (isQuickRepliesMenuOpen) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setQuickRepliesSelectedIndex((prev) =>
                        filteredQuickReplies.length > 0 ? (prev + 1) % filteredQuickReplies.length : 0
                      );
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setQuickRepliesSelectedIndex((prev) =>
                        filteredQuickReplies.length > 0
                          ? (prev - 1 + filteredQuickReplies.length) % filteredQuickReplies.length
                          : 0
                      );
                      return;
                    }
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      if (filteredQuickReplies.length > 0) {
                        e.preventDefault();
                        handleSelectQuickReply(
                          filteredQuickReplies[quickRepliesSelectedIndex] || filteredQuickReplies[0]
                        );
                        return;
                      }
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setIsQuickRepliesMenuOpen(false);
                      return;
                    }
                  }
                  if (e.key === 'Escape' && editingMessage) {
                    e.preventDefault();
                    handleCancelEdit();
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (editingMessage) {
                      handleSaveEdit();
                    } else {
                      handleSendCustomMessage();
                    }
                  }
                }}
                placeholder={
                  editingMessage
                    ? `تعديل الرسالة... (Enter للحفظ في التطبيق وواتساب، Esc للإلغاء)`
                    : replyingToMessage
                    ? `اكتب الرد على (${replyingToMessage.isFromMe || replyingToMessage.sender === 'أنا' ? 'أنت' : replyingToMessage.sender})...`
                    : `اكتب رسالة (أو اكتب / للردود الجاهزة) في (${resolvedActiveContactName})...`
                }
                className="w-full bg-transparent text-base md:text-xs text-[#fafafa] placeholder-[#a5a5a5] focus:outline-none"
              />
            </div>
            {editingMessage ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  className="h-8.5 px-2.5 text-[#a5a5a5] hover:text-white hover:bg-[#2e2f2f] text-xs rounded-xl"
                  title="إلغاء التعديل"
                >
                  إلغاء
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={!hasMessageText || isEditingSaving}
                  className="h-8.5 px-3.5 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-xl gap-1.5 cursor-pointer disabled:opacity-40 shadow-xs"
                  title="حفظ التعديل في التطبيق وعلى واتساب"
                >
                  {isEditingSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                  ) : (
                    <Check className="w-4 h-4 stroke-[2.5]" />
                  )}
                  <span className="hidden sm:inline text-xs">حفظ التعديل</span>
                </Button>
              </div>
            ) : hasMessageText ? (
              <Button
                size="sm"
                onClick={handleSendCustomMessage}
                disabled={!hasMessageText || isSendingMsg}
                className="h-8.5 px-3.5 bg-[#21c063] hover:bg-[#1daa55] text-white font-bold rounded-xl gap-1.5 cursor-pointer disabled:opacity-40 shadow-xs"
              >
                <SendHorizontal className="w-4 h-4 rtl:rotate-180" />
                <span className="hidden sm:inline text-xs">إرسال</span>
              </Button>
            ) : (
              <button
                type="button"
                onClick={startVoiceRecording}
                className="w-8.5 h-8.5 rounded-xl bg-[#2e2f2f] hover:bg-[#21c063] text-[#a5a5a5] hover:text-white border border-[#3b3d3d] hover:border-[#21c063] flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
                title="تسجيل رسالة صوتية حية (انقر للبدء)"
              >
                <Mic className="w-4.5 h-4.5" />
              </button>
            )}
          </div>
        )}
        </div>
          </div>

          {/* لوحة إدارة CRM للعميل والمحادثة المفتوحة */}
          <WhatsappCrmPanel
            isOpen={isCrmPanelOpen}
            onClose={() => setIsCrmPanelOpen(false)}
            chatKey={activeChatCrmKey}
            chatName={resolvedActiveContactName}
            chatPhone={activeChatInfo?.phone}
            isGroup={activeChatInfo?.isGroup}
            avatarUrl={activeChatInfo?.avatarUrl}
            crmRecord={activeChatCrmRecord}
            availableTags={crmTagsList}
            onToggleTag={handleToggleCrmTag}
            onAddCustomTag={handleAddCustomTag}
            onAddNote={handleAddCrmNote}
            onDeleteNote={handleDeleteCrmNote}
          />

          {/* لوحة معلومات وبيانات المحادثة أو المجموعة (Group / Contact Info) */}
          <WhatsappGroupInfoDrawer
            isOpen={isGroupInfoOpen}
            onClose={() => setIsGroupInfoOpen(false)}
            chatInfo={chatInfoData}
            isLoading={isLoadingChatInfo}
            activeGroup={activeGroup}
            isPinned={Boolean(pinnedChatKeys.has(activeChatCrmKey) || pinnedChatKeys.has(activeGroup))}
            isMuted={Boolean(mutedChats[activeChatCrmKey] || mutedChats[activeGroup])}
            isFavorite={Boolean(favoriteChatKeys.has(activeChatCrmKey) || favoriteChatKeys.has(activeGroup))}
            onTogglePin={() => {
              const currentChat = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
              togglePinChat(currentChat || { name: activeGroup, id: activeChatCrmKey });
            }}
            onToggleMute={() => {
              const currentChat = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
              const isM = Boolean(mutedChats[activeChatCrmKey] || mutedChats[activeGroup]);
              handleMuteChat(currentChat || { name: activeGroup, id: activeChatCrmKey }, isM ? 'unmute' : 'always');
            }}
            onToggleFavorite={() => {
              const currentChat = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
              toggleFavoriteChat(currentChat || { name: activeGroup, id: activeChatCrmKey });
            }}
            onZoomAvatar={(url, title, subtitle) => {
              openAvatarLightbox(chatInfoData?.id || realGroups.find((group) => group.name === title)?.id, url, title, subtitle, chatInfoData?.isGroup);
            }}
            onUpdateDescription={handleUpdateGroupDescription}
            onClearChat={() => {
              const currentChat = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
              handleClearChat(currentChat || { name: activeGroup, id: activeChatCrmKey });
            }}
            onExitOrDelete={() => {
              const currentChat = realGroups.find((g) => g.name === activeGroup || g.id === activeGroup);
              handleExitOrDeleteChat(currentChat || { name: activeGroup, id: activeChatCrmKey, isGroup: chatInfoData?.isGroup });
            }}
            onStartDirectChatWithParticipant={(phone, name) => {
              setIsGroupInfoOpen(false);
              const clean = phone.replace(/\D/g, '');
              const existing = groupsList.find((g) => g.phone && g.phone.replace(/\D/g, '') === clean);
              if (existing) {
                handleSelectChat(existing.name);
              } else {
                fetch('/api/whatsapp/messages', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'start_direct_chat', phone, name }),
                })
                  .then((res) => res.json())
                  .then((data) => {
                    if (data.chat) {
                      setRealGroups(data.groups || []);
                      handleSelectChat(data.chat.name);
                    }
                  });
              }
            }}
          />
        </div>
          </>
        )}
      </div>

      {/* طبقة حماية شفافة خلف القوائم السياقية لمنع التمرير والتقاط النقرات والكليك يمين */}
      {(contextMenu || chatAreaContextMenu) && (
        <div
          className="fixed inset-0 z-40 bg-transparent select-none cursor-default"
          style={{ touchAction: 'none' }}
          onWheel={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onTouchMove={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            closeAllPopups();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllPopups();
          }}
        />
      )}

      {/* قائمة الخيارات المنبثقة عند النقر بزر الفأرة الأيمن في أي مكان داخل المحادثة (كواتساب ويب الهادئ) */}
      {chatAreaContextMenu && !contextMenu && (
        <div
          ref={chatAreaMenuRefCallback}
          data-context-menu="true"
          className="fixed z-50 w-52 bg-[#233138] border border-[#2a3942] rounded-2xl shadow-2xl shadow-black/80 p-1.5 flex flex-col gap-0.5 text-[#d1d7db] animate-in fade-in zoom-in-95 duration-100 select-none"
          style={{
            top: `${Math.max(12, Math.min(chatAreaContextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 100))}px`,
            left: `${Math.max(12, Math.min(chatAreaContextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 225))}px`,
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {/* خيار بدء التحديد المتعدد للرسائل */}
          <button
            onClick={() => {
              setChatAreaContextMenu(null);
              setIsSelectionMode(true);
            }}
            className="w-full text-right px-3.5 py-2.5 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
          >
            <CheckSquare className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0" />
            <span>تحديد الرسائل</span>
          </button>

          {/* خيار إغلاق المحادثة الأساسي */}
          <button
            onClick={() => {
              setChatAreaContextMenu(null);
              setActiveGroup('');
            }}
            className="w-full text-right px-3.5 py-2.5 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
          >
            <X className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0" />
            <span>إغلاق المحادثة</span>
          </button>
        </div>
      )}

      {/* قائمة خيارات رقم الجوال داخل الرسالة (مثل واتساب الهادئ) */}
      {phoneMenu && (
        <>
          <div className="fixed inset-0 z-[85]" onClick={() => setPhoneMenu(null)} />
          <div
            className="fixed z-[86] w-60 bg-[#233138] border border-[#2a3942] rounded-2xl shadow-2xl shadow-black/80 py-1.5 px-1 text-[#d1d7db] animate-in fade-in zoom-in-95 duration-100 select-none"
            style={{ top: phoneMenu.y, left: phoneMenu.x }}
          >
            {phoneMenu.status === 'checking' && (
              <div className="flex items-center gap-2 px-3.5 py-2 text-xs text-[#8696a0]">
                <Loader2 className="w-4 h-4 animate-spin text-[#8696a0]" />
                جاري التحقق من الرقم...
              </div>
            )}
            {phoneMenu.status === 'yes' && (
              <button
                type="button"
                onClick={() => handleChatWithPhone(phoneMenu.phone)}
                className="w-full flex items-center gap-3 px-3.5 py-2 text-[13.5px] text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl text-right cursor-pointer transition-colors group"
              >
                <MessageSquare className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] shrink-0" />
                <span>
                  محادثة مع <bdi dir="ltr" className="whitespace-nowrap">{phoneMenu.phone}</bdi>
                </span>
              </button>
            )}
            {phoneMenu.status === 'no' && (
              <div className="px-3.5 py-2 text-xs text-[#8696a0]">هذا الرقم غير مسجل على واتساب</div>
            )}
            <button
              type="button"
              onClick={() => handleCopyPhone(phoneMenu.phone)}
              className="w-full flex items-center gap-3 px-3.5 py-2 text-[13.5px] text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl text-right cursor-pointer transition-colors group"
            >
              <Copy className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] shrink-0" />
              <span>نسخ الرقم</span>
            </button>
          </div>
        </>
      )}

      {/* الجوال: قائمة الضغط المطوّل على الرسالة (مثل واتساب الجوال) */}
      {mobileSheet && (() => {
        const sheetMsg = mobileSheet.msg;
        const run = (fn: (m: any) => unknown) => () => {
          closeMobileSheet();
          fn(sheetMsg);
        };
        const previewText =
          (sheetMsg.text || '').trim() || (sheetMsg.hasMedia || sheetMsg.mediaUrl ? 'وسائط' : '');
        return (
          <div
            className="md:hidden fixed inset-0 z-[80] bg-black/60 flex flex-col justify-end animate-in fade-in duration-150"
            onClick={handleMobileSheetBackdropClick}
          >
            <div
              className="px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] flex flex-col gap-2 max-h-[92dvh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* شريط التفاعلات فوق القائمة */}
              <div dir="ltr" className="self-center flex items-center gap-0.5 bg-[#242626] border border-[#2e2f2f] rounded-full px-1.5 py-1 shadow-2xl">
                {QUICK_REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      closeMobileSheet();
                      handleToggleReaction(sheetMsg, emoji);
                    }}
                    className="w-10 h-10 flex items-center justify-center rounded-full active:scale-90 active:bg-[#2e2f2f] transition-transform cursor-pointer"
                  >
                    <WhatsAppEmoji emoji={emoji} size={26} />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    closeMobileSheet();
                    setFullEmojiPickerMsg(sheetMsg);
                    setFullEmojiPickerAnchor({
                      msg: sheetMsg,
                      top: Math.max(10, (window.innerHeight - 380) / 2),
                      left: Math.max(10, (window.innerWidth - Math.min(410, window.innerWidth - 20)) / 2),
                    });
                    setEmojiSearchQuery('');
                    setActiveEmojiTab('recent');
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-[#a5a5a5] active:bg-[#2e2f2f] cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* معاينة الرسالة */}
              {previewText && (
                <div className="bg-[#1d1f1f] border border-[#2e2f2f] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed text-[#fafafa] whitespace-pre-wrap break-words line-clamp-4" dir="auto">
                  {previewText}
                </div>
              )}

              {/* خيارات التسجيل (لرسائل الحوالات فقط) */}
              {mobileSheet.isTransfer && (
                <div className="bg-[#1d1f1f] border border-[#2e2f2f] rounded-2xl p-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={run(handleMobileRegisterBoth)}
                    className="h-12 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    تسجيل شامل (البوابة + أيرتيبل)
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={run(handleOpenPortalWithAutoFill)}
                      className="h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
                    >
                      <Zap className="w-4 h-4" />
                      البوابة
                    </button>
                    <button
                      type="button"
                      onClick={run(handleDirectAirtableSubmit)}
                      className="h-11 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer"
                    >
                      <Database className="w-4 h-4" />
                      أيرتيبل
                    </button>
                  </div>
                </div>
              )}

              {/* الخيارات العامة */}
              <div className="bg-[#1d1f1f] border border-[#2e2f2f] rounded-2xl overflow-hidden flex flex-col">
                <button type="button" onClick={run(handleStartReply)} className="flex items-center gap-3 px-4 h-12 text-sm text-[#fafafa] active:bg-[#2e2f2f] cursor-pointer">
                  <Reply className="w-5 h-5 text-sky-400" />
                  رد
                </button>
                {Boolean(
                  sheetMsg.mediaType === 'sticker' ||
                  (sheetMsg.mediaUrl && (sheetMsg.mediaUrl.endsWith('.webp') || sheetMsg.mediaUrl.includes('/stickers/')))
                ) && (
                  <button
                    type="button"
                    onClick={run(() => handleToggleFavoriteSticker(sheetMsg.mediaUrl, sheetMsg.text))}
                    className="flex items-center gap-3 px-4 h-12 text-sm text-amber-400 border-t border-[#2e2f2f] active:bg-amber-500/10 cursor-pointer"
                  >
                    <Star className={`w-5 h-5 ${isStickerFavorited(sheetMsg.mediaUrl) ? 'fill-amber-400 text-amber-400' : 'text-amber-400'}`} />
                    <span>{isStickerFavorited(sheetMsg.mediaUrl) ? 'إزالة من الملصقات المفضلة ⭐' : 'إضافة إلى الملصقات المفضلة ⭐'}</span>
                  </button>
                )}
                {isOutgoingMessage(sheetMsg) && (
                  <button type="button" onClick={run(openMessageInfo)} className="flex items-center gap-3 px-4 h-12 text-sm text-[#fafafa] border-t border-[#2e2f2f] active:bg-[#2e2f2f] cursor-pointer">
                    <Info className="w-5 h-5 text-[#a5a5a5]" />
                    معلومات الرسالة
                  </button>
                )}
                {isOutgoingMessage(sheetMsg) && !sheetMsg.isDeleted && Boolean(sheetMsg.text) && (
                  <button
                    type="button"
                    onClick={run(handleStartEditMessage)}
                    className="flex items-center gap-3 px-4 h-12 text-sm text-amber-400 border-t border-[#2e2f2f] active:bg-amber-500/10 cursor-pointer"
                  >
                    <Pencil className="w-5 h-5 text-amber-400" />
                    تعديل الرسالة (وعلى واتساب)
                  </button>
                )}
                {Boolean(sheetMsg.mediaUrl || linkedReceipts[sheetMsg.id]?.receiptUrl) && (
                  <button
                    type="button"
                    onClick={run(async (m) => {
                      const imgUrl = m.mediaUrl || linkedReceipts[m.id]?.receiptUrl;
                      if (imgUrl) await copyImageToClipboard(imgUrl, m.text);
                    })}
                    className="flex items-center gap-3 px-4 h-12 text-sm text-[#fafafa] border-t border-[#2e2f2f] active:bg-[#2e2f2f] cursor-pointer"
                  >
                    <ImageIcon className="w-5 h-5 text-[#a5a5a5]" />
                    نسخ الصورة
                  </button>
                )}
                {Boolean(
                  sheetMsg.text &&
                  !['ملصق', 'صورة', 'مقطع فيديو', 'تسجيل صوتي', 'مقطع صوتي'].includes(sheetMsg.text.trim())
                ) && (
                  <button
                    type="button"
                    onClick={run(async (m) => {
                      try {
                        await navigator.clipboard.writeText(m.text || '');
                        toast.success('تم نسخ نص الرسالة', 'نسخ');
                      } catch {
                        toast.error('تعذر النسخ', 'نسخ');
                      }
                    })}
                    className="flex items-center gap-3 px-4 h-12 text-sm text-[#fafafa] border-t border-[#2e2f2f] active:bg-[#2e2f2f] cursor-pointer"
                  >
                    <Copy className="w-5 h-5 text-[#a5a5a5]" />
                    نسخ النص
                  </button>
                )}
                {isOutgoingMessage(sheetMsg) && !sheetMsg.isDeleted && (
                  <button
                    type="button"
                    onClick={run((m) => handleDeleteOnWhatsApp(m.id))}
                    className="flex items-center gap-3 px-4 h-12 text-sm text-rose-400 border-t border-[#2e2f2f] active:bg-rose-500/10 cursor-pointer"
                    title="حذف الرسالة لدى الجميع في واتساب"
                  >
                    <Trash2 className="w-5 h-5 text-rose-400" />
                    حذف لدى الجميع (في واتساب)
                  </button>
                )}
                <button
                  type="button"
                  onClick={run((m) => handleToggleReceived(m))}
                  className="flex items-center gap-3 px-4 h-12 text-sm text-purple-300 border-t border-[#2e2f2f] active:bg-purple-500/10 cursor-pointer font-medium"
                >
                  <CheckCircle2 className="w-5 h-5 text-purple-400" />
                  {Boolean(actionStatus[sheetMsg.id]?.isReceived || sheetMsg.status?.isReceived)
                    ? 'إلغاء وسم تم الاستلام'
                    : 'تحديد كـ تم الاستلام'}
                </button>
                <button
                  type="button"
                  onClick={run((m) => {
                    setIsSelectionMode(true);
                    setSelectedMsgIds((prev) => (prev.includes(m.id) ? prev : [...prev, m.id]));
                  })}
                  className="flex items-center gap-3 px-4 h-12 text-sm text-[#fafafa] border-t border-[#2e2f2f] active:bg-[#2e2f2f] cursor-pointer"
                >
                  <CheckSquare className="w-5 h-5 text-[#a5a5a5]" />
                  تحديد الرسالة (وضع التحديد)
                </button>
                <button type="button" onClick={run((m) => handleDeleteMessage(m.id))} className="flex items-center gap-3 px-4 h-12 text-sm text-[#a5a5a5] border-t border-[#2e2f2f] active:bg-[#2e2f2f] cursor-pointer">
                  <Trash2 className="w-5 h-5 text-[#a5a5a5]" />
                  حذف من التطبيق فقط
                </button>
              </div>

              <button
                type="button"
                onClick={closeMobileSheet}
                className="h-12 rounded-2xl bg-[#242626] border border-[#2e2f2f] text-[#fafafa] text-sm font-bold active:bg-[#2e2f2f] cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        );
      })()}

      {contextMenu && (
        <div
          ref={contextMenuRefCallback}
          data-context-menu="true"
          className="fixed z-50 w-64 max-h-[420px] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden overscroll-contain bg-[#233138] border border-[#2a3942] rounded-2xl shadow-2xl shadow-black/80 p-1.5 flex flex-col gap-0.5 text-[#d1d7db] animate-in fade-in zoom-in-95 duration-100 select-none"
          style={{
            maxHeight: '420px',
            top: `${Math.max(16, Math.min(contextMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 436))}px`,
            left: `${Math.max(12, Math.min(contextMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 275))}px`,
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {/* شريط التفاعلات السريعة في القائمة السياقية كواتساب ويب الهادئ */}
          <div dir="ltr" className="flex items-center justify-between px-2.5 py-1.5 bg-[#202c33] rounded-xl border border-[#2a3942]/60 mb-1">
            {QUICK_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  const m = contextMenu.msg;
                  closeAllPopups();
                  handleToggleReaction(m, emoji);
                }}
                className="w-7 h-7 flex items-center justify-center rounded-full transition-transform hover:scale-130 active:scale-95 cursor-pointer hover:bg-[#182229]"
                title={`تفاعل بـ ${emoji}`}
              >
                <WhatsAppEmoji emoji={emoji} size={18} />
              </button>
            ))}
            {/* زر (+) لفتح منتقي جميع الإيموجي من القائمة السياقية كواتساب ويب */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const m = contextMenu.msg;
                const buttonEl = e.currentTarget;
                const barRect = buttonEl.getBoundingClientRect();
                const pickerWidth = Math.min(410, window.innerWidth - 20);
                const pickerHeight = 380;

                let left = Math.max(12, Math.min(window.innerWidth - pickerWidth - 12, barRect.right - pickerWidth));
                if (left < 12) {
                  left = Math.max(12, Math.min(window.innerWidth - pickerWidth - 12, barRect.left));
                }

                let top = barRect.bottom + 8;
                if (top + pickerHeight > window.innerHeight - 12) {
                  if (barRect.top - pickerHeight - 8 >= 12) {
                    top = barRect.top - pickerHeight - 8;
                  } else {
                    top = Math.max(12, window.innerHeight - pickerHeight - 12);
                  }
                }

                setContextMenu(null);
                setChatAreaContextMenu(null);
                setFullEmojiPickerMsg(m);
                setFullEmojiPickerAnchor({
                  msg: m,
                  top,
                  left,
                });
                setEmojiSearchQuery('');
                setActiveEmojiTab('recent');
              }}
              className="w-7 h-7 flex items-center justify-center rounded-full text-[#8696a0] hover:text-[#d1d7db] hover:bg-[#182229] transition-transform hover:scale-125 active:scale-95 cursor-pointer font-bold text-base"
              title="المزيد من التفاعلات (+)"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* معلومات الرسالة: متى وصلت ومتى قُرئت (لرسائلي فقط كما في واتساب) */}
          {isOutgoingMessage(contextMenu.msg) && (
            <button
              onClick={() => {
                const m = contextMenu.msg;
                closeAllPopups();
                openMessageInfo(m);
              }}
              className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
            >
              <Info className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0" />
              <span>معلومات الرسالة</span>
            </button>
          )}

          {/* خيار الرد على الرسالة */}
          <button
            onClick={() => {
              const m = contextMenu.msg;
              closeAllPopups();
              handleStartReply(m);
            }}
            className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
          >
            <Reply className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0 rtl:rotate-180" />
            <span>رد</span>
          </button>

          {/* خيار تحديد كـ تم الاستلام أو إلغاء الوسم */}
          <button
            onClick={() => {
              const m = contextMenu.msg;
              closeAllPopups();
              handleToggleReceived(m);
            }}
            className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-purple-300 hover:text-purple-200 hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
          >
            <CheckCircle2 className="w-4 h-4 text-purple-400 group-hover:text-purple-300 transition-colors shrink-0" />
            <span>
              {Boolean(actionStatus[contextMenu.msg.id]?.isReceived || contextMenu.msg.status?.isReceived)
                ? 'إلغاء وسم تم الاستلام'
                : 'تحديد كـ تم الاستلام'}
            </span>
          </button>

          {/* خيار تحديد الرسالة (لبدء وضع التحديد وشبك الصور) */}
          <button
            onClick={() => {
              const m = contextMenu.msg;
              closeAllPopups();
              setIsSelectionMode(true);
              setSelectedMsgIds((prev) => (prev.includes(m.id) ? prev : [...prev, m.id]));
            }}
            className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
          >
            <CheckSquare className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0" />
            <span>تحديد الرسالة (وضع التحديد)</span>
          </button>

          {/* خيار الرد في الخاص على رسائل الأعضاء في القروبات فقط */}
          {isCurrentChatGroup && !isOutgoingMessage(contextMenu.msg) && (
            <button
              onClick={() => {
                const m = contextMenu.msg;
                closeAllPopups();
                handleReplyPrivately(m);
              }}
              className="w-full text-right px-3.5 py-2 text-[13.5px] font-medium text-emerald-400 hover:text-emerald-300 hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
            >
              <Reply className="w-4 h-4 text-emerald-400 group-hover:text-emerald-300 transition-colors shrink-0 rtl:rotate-180" />
              <span>رد في الخاص (Reply privately)</span>
            </button>
          )}

          {/* خيار نسخ الصورة إلى الحافظة (لصق كصورة مباشرة في أي برنامج) */}
          {Boolean(
            contextMenu.msg.mediaUrl ||
            linkedReceipts[contextMenu.msg.id]?.receiptUrl ||
            (contextMenu.msg.hasMedia && contextMenu.msg.mediaType === 'image')
          ) && (
            <button
              onClick={async () => {
                const u = contextMenu.msg.mediaUrl || linkedReceipts[contextMenu.msg.id]?.receiptUrl;
                closeAllPopups();
                if (u) {
                  await copyImageToClipboard(u, contextMenu.msg.text);
                } else {
                  toast.warning('الصورة غير متوفرة بعد أو لم يتم تنزيلها', 'نسخ الصورة');
                }
              }}
              className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
            >
              <ImageIcon className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0" />
              <span>نسخ الصورة</span>
            </button>
          )}

          {/* نسخ نص الرسالة إن وُجد نص حقيقي غير كلمة 'صورة' أو 'ملصق' */}
          {Boolean(
            contextMenu.msg.text &&
            !['ملصق', 'صورة', 'مقطع فيديو', 'تسجيل صوتي', 'مقطع صوتي'].includes(contextMenu.msg.text.trim())
          ) && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(contextMenu.msg.text);
                closeAllPopups();
                toast.info('تم نسخ نص الرسالة إلى الحافظة بنجاح.', 'نسخ');
              }}
              className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
            >
              <Copy className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0" />
              <span>نسخ النص</span>
            </button>
          )}

          {/* خيار إضافة / إزالة الملصق من المفضلة */}
          {Boolean(
            contextMenu.msg.mediaType === 'sticker' ||
            (contextMenu.msg.mediaUrl && (contextMenu.msg.mediaUrl.endsWith('.webp') || contextMenu.msg.mediaUrl.includes('/stickers/')))
          ) && (
            <button
              onClick={() => {
                const src = contextMenu.msg.mediaUrl || '';
                closeAllPopups();
                handleToggleFavoriteSticker(src, contextMenu.msg.text || 'ملصق محادثة');
              }}
              className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
            >
              <Star
                className={`w-4 h-4 shrink-0 transition-colors ${
                  isStickerFavorited(contextMenu.msg.mediaUrl || '')
                    ? 'fill-[#8696a0] text-[#8696a0]'
                    : 'text-[#8696a0] group-hover:text-[#aebac1]'
                }`}
              />
              <span>
                {isStickerFavorited(contextMenu.msg.mediaUrl || '')
                  ? 'إزالة من الملصقات المفضلة'
                  : 'إضافة إلى الملصقات المفضلة'}
              </span>
            </button>
          )}

          {/* خيار تعديل الرسالة لرسائل المستخدم */}
          {isOutgoingMessage(contextMenu.msg) && !contextMenu.msg.isDeleted && Boolean(contextMenu.msg.text) && (
            <button
              onClick={() => {
                const m = contextMenu.msg;
                closeAllPopups();
                handleStartEditMessage(m);
              }}
              className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
            >
              <Pencil className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0" />
              <span>تعديل</span>
            </button>
          )}

          {/* خيار التحديد لتحديد أكثر من رسالة */}
          <button
            onClick={() => {
              setIsSelectionMode(true);
              setSelectedMsgIds([contextMenu.msg.id]);
              closeAllPopups();
            }}
            className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
          >
            <CheckSquare className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0" />
            <span>تحديد</span>
          </button>

          {/* خيار إخفاء الرسالة بالعين */}
          <button
            onClick={() => {
              const id = contextMenu.msg.id;
              closeAllPopups();
              handleToggleHideMessage(id);
            }}
            className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
          >
            {hiddenMessageIds.has(contextMenu.msg.id) ? (
              <>
                <Eye className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0" />
                <span>استرجاع وإظهار الرسالة</span>
              </>
            ) : (
              <>
                <EyeOff className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0" />
                <span>إخفاء الرسالة</span>
              </>
            )}
          </button>

          {/* خيار فك الشبك في حال كانت الحوالة مشبوكة */}
          {linkedReceipts[contextMenu.msg.id] && (
            <button
              onClick={() => {
                const id = contextMenu.msg.id;
                closeAllPopups();
                handleUnlinkReceipt(id);
              }}
              className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
            >
              <Link2 className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0" />
              <span>فك شبك صورة الوصل</span>
            </button>
          )}

          {/* قائمة المجموعات للتحويل السريع */}
          {groupsList.filter((g) => g.name !== activeGroup).length > 0 && (
            <>
              <div className="border-t border-[#2a3942] my-1" />
              <div className="px-3.5 pt-1.5 pb-0.5 text-[11px] font-medium text-[#8696a0]">
                تحويل سريع إلى:
              </div>
              {groupsList.filter((g) => g.name !== activeGroup).slice(0, 5).map((grp) => (
                <button
                  key={grp.name}
                  onClick={() => {
                    const m = contextMenu.msg;
                    closeAllPopups();
                    handleDirectForward(m, grp.name);
                  }}
                  className="w-full text-right px-3.5 py-1.5 text-xs text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-2.5 cursor-pointer truncate group"
                >
                  <Forward className="w-3.5 h-3.5 text-[#8696a0] group-hover:text-[#aebac1] shrink-0 rtl:rotate-180" />
                  <span className="truncate" dir="auto"><bdi>{grp.name}</bdi></span>
                </button>
              ))}
            </>
          )}

          <div className="border-t border-[#2a3942] my-1" />

          {/* خيار الحذف لدى الجميع في واتساب لرسائل المستخدم */}
          {isOutgoingMessage(contextMenu.msg) && !contextMenu.msg.isDeleted && (
            <button
              onClick={() => {
                const id = contextMenu.msg.id;
                closeAllPopups();
                handleDeleteOnWhatsApp(id);
              }}
              className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-[#ea4335] hover:bg-[#ea4335]/10 rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
              title="حذف الرسالة لدى الجميع في واتساب"
            >
              <Trash2 className="w-4 h-4 text-[#ea4335] shrink-0" />
              <span>حذف لدى الجميع</span>
            </button>
          )}

          {/* خيار الحذف المحلي من التطبيق فقط */}
          <button
            onClick={() => {
              const id = contextMenu.msg.id;
              closeAllPopups();
              handleDeleteMessage(id);
            }}
            className="w-full text-right px-3.5 py-2 text-[13.5px] font-normal text-[#d1d7db] hover:text-[#e9edef] hover:bg-[#182229] rounded-xl transition-colors flex items-center gap-3 cursor-pointer group"
          >
            <Trash2 className="w-4 h-4 text-[#8696a0] group-hover:text-[#aebac1] transition-colors shrink-0" />
            <span>حذف من التطبيق</span>
          </button>
        </div>
      )}

      {/* نافذة بدء محادثة خاصة جديدة برقم هاتف */}
      {isNewChatModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsNewChatModalOpen(false)}
        >
          <div
            className="bg-[#242626] border border-[#2e2f2f] rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#2e2f2f]">
              <div className="flex items-center gap-2 text-[#fafafa] font-bold">
                <User className="w-5 h-5 text-sky-400" />
                <span>بدء محادثة خاصة برقم هاتف</span>
              </div>
              <button
                onClick={() => setIsNewChatModalOpen(false)}
                className="text-[#a5a5a5] hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStartDirectChat} className="mt-4 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#a5a5a5] mb-1.5">
                  رقم الهاتف (مع مقدمة الدولة أو رقم محلي):
                </label>
                <input
                  type="text"
                  dir="ltr"
                  placeholder="مثال: 0599123456 أو 970599123456 أو 962791234567"
                  value={newChatPhone}
                  onChange={(e) => setNewChatPhone(e.target.value)}
                  className="w-full bg-[#161717] border border-[#2e2f2f] rounded-xl px-3.5 py-2 text-sm text-[#fafafa] placeholder-[#a5a5a5] focus:outline-none focus:border-[#21c063]"
                  autoFocus
                  required
                />
                <p className="text-[11px] text-[#a5a5a5] mt-1">
                  يمكن إدخال الرقم بالصيغة الدولية أو المحلية وسيقوم النظام بتهيئته تلقائياً.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a5a5a5] mb-1.5">
                  اسم جهة الاتصال (اختياري):
                </label>
                <input
                  type="text"
                  placeholder="اسم المشترك أو العميل..."
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  className="w-full bg-[#161717] border border-[#2e2f2f] rounded-xl px-3.5 py-2 text-sm text-[#fafafa] placeholder-[#a5a5a5] focus:outline-none focus:border-[#21c063]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2e2f2f]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsNewChatModalOpen(false)}
                  className="text-xs text-[#a5a5a5] hover:text-white hover:bg-[#2e2f2f]"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={isCreatingNewChat || !newChatPhone.trim()}
                  className="text-xs font-bold bg-[#21c063] hover:bg-[#1daa55] text-white px-4 py-2 rounded-xl cursor-pointer"
                >
                  {isCreatingNewChat ? (
                    <RotateCw className="w-3.5 h-3.5 animate-spin ml-1" />
                  ) : (
                    <SendHorizontal className="w-3.5 h-3.5 ml-1" />
                  )}
                  <span>فتح المحادثة</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة التأكيد الذكية بعد التسجيل في البوابة وإمكانية الإرسال للقروب */}
      {pendingPortalConfirm && (
        <Dialog open={true} onOpenChange={(open) => !open && !isSendingPortalCreds && setPendingPortalConfirm(null)}>
          <DialogContent showCloseButton={false} dir="rtl" className="max-w-md bg-[#161717] border-[#2e2f2f] text-white p-6 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#2e2f2f] pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <ExternalLink className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">تأكيد التسجيل في بوابة عقليات</h3>
                  <p className="text-xs text-[#a5a5a5]">المتدرب: {pendingPortalConfirm.parsed.participantName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSendingPortalCreds && setPendingPortalConfirm(null)}
                disabled={isSendingPortalCreds}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#242626] transition-colors cursor-pointer disabled:opacity-50"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-[#e0e0e0] bg-[#202222] p-3.5 rounded-xl border border-[#2e2f2f]/80">
              <div className="flex justify-between items-center pb-2 border-b border-[#2e2f2f]/60">
                <span className="text-[#a5a5a5]">اسم المشترك:</span>
                <span className="font-bold text-white text-sm">{pendingPortalConfirm.parsed.participantName}</span>
              </div>
              <div className="flex justify-between items-center pb-1.5 border-b border-[#2e2f2f]/30">
                <span className="text-[#a5a5a5]">البريد الإلكتروني:</span>
                <span dir="ltr" className="font-mono text-emerald-400 text-xs font-semibold select-all">{pendingPortalConfirm.parsed.email || 'غير محدد'}</span>
              </div>
              <div className="flex justify-between items-center pb-1.5 border-b border-[#2e2f2f]/30">
                <span className="text-[#a5a5a5]">رقم الجوال:</span>
                <span dir="ltr" className="font-mono text-emerald-400 text-xs font-semibold select-all">{pendingPortalConfirm.targetPhone}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#a5a5a5]">المبلغ والعملة:</span>
                <span dir="ltr" className="text-white font-bold">{pendingPortalConfirm.parsed.amount || 85} {pendingPortalConfirm.parsed.currency || 'USD'}</span>
              </div>
            </div>

            <div className="space-y-1.5 my-3.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#e0e0e0] flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5 text-emerald-400" />
                  <span>نص الرسالة للمجموعة (يمكنك التعديل عليها قبل الإرسال):</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const defaultCredsMsg = `بيانات البوابة الالكترونية\n\nاسم المشترك :  \n${pendingPortalConfirm.parsed.participantName}\n\nالايميل أو اسم المستخدم:\n${pendingPortalConfirm.parsed.email}\n\nالرقم السري : \n${pendingPortalConfirm.targetPhone}\n\nرابط تسجيل الدخول إلى بوابة التدريبات العقلية:\n\nhttps://portal.aqleeat.com/trainees-portal\n\nرابط شرح استخدام البوابة من اليوتيوب:\n\nhttps://youtu.be/gFRQBtkQceE`;
                    setPortalConfirmMessage(defaultCredsMsg);
                  }}
                  className="text-[11px] text-[#a5a5a5] hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer"
                  title="استعادة النص الافتراضي"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>استعادة</span>
                </button>
              </div>
              <textarea
                value={portalConfirmMessage}
                onChange={(e) => setPortalConfirmMessage(e.target.value)}
                rows={8}
                dir="rtl"
                className="w-full bg-[#1c1d1d] border border-[#2e2f2f] focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/40 rounded-xl p-3 text-xs text-[#e0e0e0] leading-relaxed resize-y outline-none transition-all font-sans"
                placeholder="اكتب أو عدّل نص الرسالة هنا..."
              />
            </div>

            <p className="text-xs text-[#b8b9b9] my-3 leading-relaxed">
              بعد الضغط على زر <strong className="text-emerald-400">(تسجيل)</strong> في صفحة البوابة، هل تريد إرسال بيانات الدخول الرسمية أعلاه إلى مجموعة <strong className="text-white">"حوالات تم رفعها"</strong> على واتساب الآن؟
            </p>

            <div className="flex flex-col gap-2 pt-1">
              <Button
                disabled={isSendingPortalCreds}
                onClick={async () => {
                  if (isSendingPortalCreds) return;
                  setIsSendingPortalCreds(true);
                  try {
                    const targetMsg = pendingPortalConfirm.msg;
                    await updateStatus(targetMsg.id, { portal: true, registered: true });
                    await handleSendCredentialsToGroup(targetMsg, portalConfirmMessage);
                    setPendingPortalConfirm(null);
                  } catch (err: any) {
                    toast.error('حدث خطأ أثناء الإرسال: ' + (err?.message || 'خطأ غير معروف'));
                  } finally {
                    setIsSendingPortalCreds(false);
                  }
                }}
                className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-2.5 rounded-xl gap-2 cursor-pointer shadow-lg shadow-emerald-950/40 border border-emerald-400/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSendingPortalCreds ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>جاري الإرسال للمجموعة...</span>
                  </>
                ) : (
                  <>
                    <SendHorizontal className="w-4 h-4" />
                    <span>إرسال إلى مجموعة (حوالات تم رفعها)</span>
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                disabled={isSendingPortalCreds}
                onClick={async () => {
                  if (isSendingPortalCreds) return;
                  const targetMsg = pendingPortalConfirm.msg;
                  await updateStatus(targetMsg.id, { portal: true, registered: true });
                  toast.success(`تم تأكيد تسجيل المتدرب (${pendingPortalConfirm.parsed.participantName}) في البوابة بنجاح`, 'بوابة عقليات');
                  setPendingPortalConfirm(null);
                }}
                className="w-full border-[#2e2f2f] hover:bg-[#242626] text-[#e0e0e0] font-bold py-2 rounded-xl cursor-pointer gap-2 disabled:opacity-50"
              >
                <Check className="w-4 h-4 text-emerald-400" />
                <span>تم التسجيل في البوابة فقط (بدون إرسال)</span>
              </Button>

              <Button
                variant="ghost"
                disabled={isSendingPortalCreds}
                onClick={() => !isSendingPortalCreds && setPendingPortalConfirm(null)}
                className="w-full text-xs text-[#a5a5a5] hover:text-white py-1.5 cursor-pointer gap-1.5 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                <span>إلغاء / إغلاق</span>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* نافذة تفاصيل التفاعلات على الرسالة كواتساب ويب الحقيقي */}
      <Dialog open={Boolean(selectedReactionMsg)} onOpenChange={(open) => !open && setSelectedReactionMsg(null)}>
        <DialogContent className="sm:max-w-md bg-[#242626] text-[#fafafa] border-[#2e2f2f] p-0 overflow-hidden shadow-2xl rounded-2xl">
          <DialogHeader className="p-4 pb-3 border-b border-[#2e2f2f]">
            <DialogTitle className="text-base font-bold text-[#fafafa] flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Smile className="w-5 h-5 text-amber-400" />
                <span>تفاعلات الرسالة</span>
              </span>
              <span className="text-xs font-normal text-[#a5a5a5] bg-[#161717] px-2.5 py-1 rounded-full border border-[#2e2f2f]">
                {selectedReactionMsg?.reactions?.length || 0} تفاعل
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-[#a5a5a5]">
              قائمة المتفاعلين الحقيقيين من تطبيق واتساب مع الرموز التعبيرية
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[350px] overflow-y-auto divide-y divide-[#2e2f2f]/40 p-2">
            {selectedReactionMsg?.reactions && selectedReactionMsg.reactions.length > 0 ? (
              selectedReactionMsg.reactions.map((r: any, i: number) => {
                const isMe = r.isFromMe || r.sender === 'أنا' || r.senderName === 'أنا';
                const displayName = isMe ? 'أنت' : (r.senderName || r.sender || 'مشترك');
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 hover:bg-[#1d1f1f]/60 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="select-none leading-none transform hover:scale-125 transition-transform flex items-center justify-center">
                        <WhatsAppEmoji emoji={r.text} size={22} />
                      </span>
                      <div>
                        <p className={`text-sm font-semibold ${isMe ? 'text-emerald-400' : 'text-[#fafafa]'}`}>
                          {displayName}
                        </p>
                        {r.sender && r.sender !== 'أنا' && r.senderName && r.sender !== r.senderName && (
                          <p className="text-[11px] text-[#a5a5a5]" dir="ltr">
                            {r.sender}
                          </p>
                        )}
                      </div>
                    </div>

                    {isMe && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleReaction(selectedReactionMsg, r.text)}
                        className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/15 h-7 px-2.5 rounded-lg cursor-pointer"
                      >
                        إزالة تفاعلي
                      </Button>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6 text-xs text-[#a5a5a5]">لا توجد تفاعلات على هذه الرسالة</div>
            )}
          </div>

          {/* شريط إضافة أو تغيير التفاعل السريع من داخل النافذة */}
          <div dir="ltr" className="p-3 bg-[#161717] border-t border-[#2e2f2f] flex items-center justify-center gap-2.5">
            {QUICK_REACTION_EMOJIS.map((emoji) => {
              const isCurrent = selectedReactionMsg?.reactions?.some(
                (r: any) =>
                  (r.isFromMe || r.sender === 'أنا' || r.senderName === 'أنا') && r.text === emoji
              );
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleToggleReaction(selectedReactionMsg, emoji)}
                  className={`w-9 h-9 flex items-center justify-center rounded-full transition-all hover:scale-125 active:scale-95 cursor-pointer ${
                    isCurrent ? 'bg-emerald-500/30 ring-2 ring-emerald-400' : 'hover:bg-[#242626]'
                  }`}
                  title={isCurrent ? `إزالة ${emoji}` : `تفاعل بـ ${emoji}`}
                >
                  <WhatsAppEmoji emoji={emoji} size={22} />
                </button>
              );
            })}
            {/* زر (+) لفتح منتقي جميع الإيموجي من داخل نافذة تفاصيل التفاعلات */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const m = selectedReactionMsg;
                const buttonEl = e.currentTarget;
                const barRect = buttonEl.getBoundingClientRect();
                const pickerWidth = Math.min(410, window.innerWidth - 20);
                const pickerHeight = 380;
                let left = Math.max(12, Math.min(window.innerWidth - pickerWidth - 12, barRect.left - 150));
                let top = Math.max(12, Math.min(window.innerHeight - pickerHeight - 12, barRect.bottom + 8));

                setSelectedReactionMsg(null);
                setContextMenu(null);
                setChatAreaContextMenu(null);
                setFullEmojiPickerMsg(m);
                setFullEmojiPickerAnchor({ msg: m, top, left });
                setEmojiSearchQuery('');
                setActiveEmojiTab('recent');
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full text-[#a5a5a5] hover:text-[#21c063] hover:bg-[#242626] transition-all hover:scale-125 active:scale-95 cursor-pointer font-bold text-xl"
              title="المزيد من التفاعلات (+)"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة منتقي الإيموجي العائمة كواتساب ويب بالضبط عند النقر على (+) في شريط التفاعل (ملاصقة للشريط وليست بنصف الشاشة) */}
      {fullEmojiPickerAnchor && (
        <>
          {/* طبقة شفافة غير معتمة تلتقط النقر بالخارج لإغلاق المنتقي وشريط التفاعل فوراً دون تعتيم الشاشة */}
          <div
            className="fixed inset-0 z-50 bg-transparent"
            onClick={() => {
              setFullEmojiPickerAnchor(null);
              setFullEmojiPickerMsg(null);
              setReactionPickerMsgId(null);
            }}
          />

          <div
            data-full-emoji-picker="true"
            dir="ltr"
            style={{
              position: 'fixed',
              top: fullEmojiPickerAnchor.top,
              ...(fullEmojiPickerAnchor.right !== undefined
                ? { right: fullEmojiPickerAnchor.right }
                : { left: fullEmojiPickerAnchor.left ?? 16 }),
              width: Math.min(410, typeof window !== 'undefined' ? window.innerWidth - 24 : 410),
              height: 380,
            }}
            className="z-50 bg-[#202c33] border border-[#2a3942] rounded-2xl shadow-2xl overflow-hidden flex flex-col select-none animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. شريط التبويبات العلوي مطابق لواتساب ويب تماماً */}
            <div className="flex items-center px-1 pt-1 pb-0 bg-[#202c33] border-b border-[#2a3942]/60 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveEmojiTab('recent');
                  document.getElementById('emoji_sec_recent')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={`flex-1 h-9 flex flex-col items-center justify-center transition-colors relative cursor-pointer ${
                  activeEmojiTab === 'recent' ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-[#e9edef]'
                }`}
                title="Recent reactions"
              >
                <Clock className="w-4 h-4" />
                {activeEmojiTab === 'recent' && (
                  <span className="absolute bottom-0 left-2 right-2 h-[3px] bg-[#00a884] rounded-t-sm" />
                )}
              </button>

              {EMOJI_CATEGORIES.map((cat) => {
                const IconComponent =
                  cat.id === 'smileys' ? Smile :
                  cat.id === 'animals' ? PawPrint :
                  cat.id === 'food' ? Coffee :
                  cat.id === 'activity' ? Trophy :
                  cat.id === 'travel' ? Car :
                  cat.id === 'objects' ? Lightbulb :
                  cat.id === 'symbols' ? Percent :
                  Flag;

                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setActiveEmojiTab(cat.id);
                      document.getElementById(`emoji_sec_${cat.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className={`flex-1 h-9 flex flex-col items-center justify-center transition-colors relative cursor-pointer ${
                      activeEmojiTab === cat.id ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-[#e9edef]'
                    }`}
                    title={cat.name}
                  >
                    <IconComponent className="w-4 h-4" />
                    {activeEmojiTab === cat.id && (
                      <span className="absolute bottom-0 left-2 right-2 h-[3px] bg-[#00a884] rounded-t-sm" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* 2. شريط البحث "Search reaction" كواتساب ويب */}
            <div className="p-2.5 bg-[#202c33] shrink-0">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-[#8696a0] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={emojiSearchQuery}
                  onChange={(e) => setEmojiSearchQuery(e.target.value)}
                  placeholder="Search reaction"
                  className="w-full bg-[#111b21] text-xs text-[#e9edef] placeholder-[#8696a0] rounded-lg pl-9 pr-8 py-2 border border-[#222e35] focus:border-[#00a884] focus:outline-none transition-colors"
                  autoFocus
                />
                {emojiSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setEmojiSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* 3. شبكة الإيموجي والأقسام القابلة للتمرير */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:thin] [scrollbar-color:#374045_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[#374045] [&::-webkit-scrollbar-thumb]:rounded-full">
              {emojiSearchQuery.trim() ? (
                /* نتائج البحث */
                <div>
                  <div className="text-[11px] font-semibold text-[#8696a0] mb-2 px-1">
                    Matching reactions ({filteredEmojis.length})
                  </div>
                  {filteredEmojis.length > 0 ? (
                    <div className="grid grid-cols-9 gap-1 place-items-center">
                      {filteredEmojis.map((emoji) => {
                        const m = fullEmojiPickerAnchor.msg;
                        const isCurrent = m?.reactions?.some(
                          (r: any) =>
                            (r.isFromMe || r.sender === 'أنا' || r.senderName === 'أنا') && r.text === emoji
                        );
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              handleToggleReaction(m, emoji);
                              recordRecentReaction(emoji);
                              setFullEmojiPickerAnchor(null);
                              setFullEmojiPickerMsg(null);
                              setReactionPickerMsgId(null);
                            }}
                            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-transform hover:scale-125 active:scale-95 cursor-pointer ${
                              isCurrent ? 'bg-emerald-500/30 ring-1.5 ring-emerald-400' : 'hover:bg-[#182229]'
                            }`}
                            title={emoji}
                          >
                            <WhatsAppEmoji emoji={emoji} size={22} />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-xs text-[#8696a0]">
                      No reactions found for &quot;{emojiSearchQuery}&quot;
                    </div>
                  )}
                </div>
              ) : (
                /* العرض الافتراضي للأقسام كواتساب ويب */
                <div>
                  {/* قسم التفاعلات الأخيرة Recent reactions */}
                  {recentReactions.length > 0 && (
                    <div id="emoji_sec_recent" className="mb-3">
                      <div className="text-[11px] font-semibold text-[#8696a0] mb-1.5 px-1">
                        Recent reactions
                      </div>
                      <div className="grid grid-cols-9 gap-1 place-items-center">
                        {recentReactions.map((emoji) => {
                          const m = fullEmojiPickerAnchor.msg;
                          const isCurrent = m?.reactions?.some(
                            (r: any) =>
                              (r.isFromMe || r.sender === 'أنا' || r.senderName === 'أنا') && r.text === emoji
                          );
                          return (
                            <button
                              key={`recent_${emoji}`}
                              type="button"
                              onClick={() => {
                                handleToggleReaction(m, emoji);
                                recordRecentReaction(emoji);
                                setFullEmojiPickerAnchor(null);
                                setFullEmojiPickerMsg(null);
                                setReactionPickerMsgId(null);
                              }}
                              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-transform hover:scale-125 active:scale-95 cursor-pointer ${
                                isCurrent ? 'bg-emerald-500/30 ring-1.5 ring-emerald-400' : 'hover:bg-[#182229]'
                              }`}
                              title={emoji}
                            >
                              <WhatsAppEmoji emoji={emoji} size={22} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* بقية الأقسام: Smileys & People, Animals & Nature, etc. */}
                  {EMOJI_CATEGORIES.map((cat) => (
                    <div key={cat.id} id={`emoji_sec_${cat.id}`} className="mb-3">
                      <div className="text-[11px] font-semibold text-[#8696a0] mb-1.5 px-1">
                        {cat.name}
                      </div>
                      <div className="grid grid-cols-9 gap-1 place-items-center">
                        {cat.emojis.map((emoji) => {
                          const m = fullEmojiPickerAnchor.msg;
                          const isCurrent = m?.reactions?.some(
                            (r: any) =>
                              (r.isFromMe || r.sender === 'أنا' || r.senderName === 'أنا') && r.text === emoji
                          );
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                handleToggleReaction(m, emoji);
                                recordRecentReaction(emoji);
                                setFullEmojiPickerAnchor(null);
                                setFullEmojiPickerMsg(null);
                                setReactionPickerMsgId(null);
                              }}
                              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-transform hover:scale-125 active:scale-95 cursor-pointer ${
                                isCurrent ? 'bg-emerald-500/30 ring-1.5 ring-emerald-400' : 'hover:bg-[#182229]'
                              }`}
                              title={emoji}
                            >
                              <WhatsAppEmoji emoji={emoji} size={22} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* عارض الوسائط الشامل داخل نفس الصفحة (In-Page Media Lightbox) */}
      {lightboxState && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between select-none animate-in fade-in duration-150"
          onClick={closeLightbox}
        >
          {/* الشريط العلوي للتحكم والمعلومات */}
          <div
            className="flex items-center justify-between p-4 bg-black/60 border-b border-white/10 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* معلومات المرسل والتاريخ */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#21c063]/20 border border-[#21c063]/40 flex items-center justify-center text-[#21c063] font-bold">
                {lightboxState.type === 'document' ? (
                  <FileText className="w-5 h-5 text-rose-500" />
                ) : lightboxState.type === 'video' ? (
                  <Film className="w-5 h-5" />
                ) : lightboxState.type === 'audio' || lightboxState.type === 'voice' ? (
                  <Mic className="w-5 h-5" />
                ) : lightboxState.type === 'sticker' ? (
                  <Smile className="w-5 h-5" />
                ) : (
                  <ImageIcon className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#fafafa]">{lightboxState.sender}</h3>
                <p className="text-xs text-[#a5a5a5] font-mono">{lightboxState.timestamp}</p>
              </div>
            </div>

            {/* أزرار التحكم بالوسائط */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* أزرار التكبير والتدوير للصور والملصقات */}
              {(lightboxState.type === 'image' || lightboxState.type === 'sticker') && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLightboxZoom((z) => Math.min(z + 0.25, 4))}
                    className="h-9 w-9 p-0 rounded-full text-[#a5a5a5] hover:text-white hover:bg-white/10 cursor-pointer"
                    title="تكبير"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLightboxZoom((z) => {
                      const next = Math.max(z - 0.25, 1);
                      if (next === 1) setLightboxOffset({ x: 0, y: 0 });
                      return next;
                    })}
                    className="h-9 w-9 p-0 rounded-full text-[#a5a5a5] hover:text-white hover:bg-white/10 cursor-pointer"
                    title="تصغير"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLightboxRotation((r) => (r + 90) % 360)}
                    className="h-9 w-9 p-0 rounded-full text-[#a5a5a5] hover:text-white hover:bg-white/10 cursor-pointer"
                    title="تدوير 90 درجة"
                  >
                    <RotateCw className="w-4 h-4" />
                  </Button>
                </>
              )}

              {/* زر نسخ الصورة إلى الحافظة */}
              {(lightboxState.type === 'image' || lightboxState.type === 'sticker') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyImageToClipboard(lightboxState.url, lightboxState.caption)}
                  className="h-9 w-9 p-0 rounded-full text-[#a5a5a5] hover:text-white hover:bg-white/10 cursor-pointer"
                  title="نسخ الصورة إلى الحافظة (لصق كصورة في أي برنامج)"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              )}

              {/* زر التنزيل */}
              {(lightboxState.type === 'image' || lightboxState.type === 'sticker') && (
                <a
                  href={lightboxState.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 w-9 rounded-full flex items-center justify-center text-[#a5a5a5] hover:text-white hover:bg-white/10 transition-colors"
                  title="فتح الصورة الأصلية بحجمها الكامل"
                >
                  <Maximize2 className="w-4 h-4" />
                </a>
              )}
              <a
                href={lightboxState.url}
                download
                target="_blank"
                rel="noreferrer"
                className="h-9 w-9 rounded-full flex items-center justify-center text-[#a5a5a5] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="تنزيل إلى جهازك"
              >
                <Download className="w-4 h-4" />
              </a>

              {/* زر إغلاق */}
              <Button
                variant="ghost"
                size="sm"
                onClick={closeLightbox}
                className="h-9 w-9 p-0 rounded-full text-[#a5a5a5] hover:text-white hover:bg-red-500/20 hover:text-red-400 cursor-pointer"
                title="إغلاق (Esc)"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* مساحة العرض الرئيسية مع أزرار التنقل يميناً ويساراً */}
          <div
            className="flex-1 relative flex items-center justify-center p-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* زر السابق (التنقل بين وسائط المحادثة أو الألبوم) */}
            {Boolean((lightboxState.albumMsgs && lightboxState.albumMsgs.length > 1) || currentChatMediaMessages.length > 1) && (
              <button
                type="button"
                onClick={() => handleNavigateLightbox('prev')}
                className="absolute left-4 z-20 w-12 h-12 rounded-full bg-black/60 hover:bg-[#21c063] text-white flex items-center justify-center shadow-2xl transition-all hover:scale-110 cursor-pointer border border-white/10"
                title="الوسائط السابقة (السهم الأيسر)"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* عنصر الوسائط الفعلي */}
            <div className="w-full h-full min-h-0 flex items-center justify-center">
              {lightboxState.type === 'document' || lightboxState.url.toLowerCase().includes('.pdf') ? (
                <div className="flex flex-col items-center gap-3 w-full max-w-4xl h-[80vh]">
                  <iframe
                    src={lightboxState.url}
                    title="معاينة المستند"
                    className="w-full flex-1 rounded-2xl bg-white shadow-2xl border border-white/20"
                  />
                  <div className="flex items-center gap-3">
                    <a
                      href={lightboxState.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-[#21c063] hover:bg-[#1da857] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-lg"
                    >
                      <Maximize2 className="w-4 h-4" />
                      <span>فتح في نافذة كاملة</span>
                    </a>
                    <a
                      href={lightboxState.url}
                      download
                      className="px-4 py-2 bg-[#242626] hover:bg-[#2e2f2f] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer border border-[#374248]"
                    >
                      <Download className="w-4 h-4" />
                      <span>تنزيل الملف</span>
                    </a>
                  </div>
                </div>
              ) : lightboxState.type === 'video' ? (
                <video
                  key={lightboxState.url}
                  src={lightboxState.url}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[75vh] max-w-[85vw] rounded-2xl shadow-2xl bg-black"
                />
              ) : lightboxState.type === 'audio' || lightboxState.type === 'voice' ? (
                <div className="bg-[#242626] border border-[#2e2f2f] p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 min-w-[320px]">
                  <div className="w-20 h-20 rounded-full bg-[#21c063]/20 border-2 border-[#21c063] flex items-center justify-center text-[#21c063] shadow-lg">
                    <Mic className="w-10 h-10 animate-pulse" />
                  </div>
                  <audio src={lightboxState.url} controls autoPlay className="w-full" />
                </div>
              ) : (
                <img
                  key={lightboxState.url}
                  src={lightboxState.url}
                  alt={lightboxState.caption || 'عرض الوسائط'}
                  style={{
                    transform: `translate(${lightboxOffset.x}px, ${lightboxOffset.y}px) scale(${lightboxZoom}) rotate(${lightboxRotation}deg)`,
                    touchAction: 'none',
                  }}
                  onPointerDown={handleLightboxPointerDown}
                  onPointerMove={handleLightboxPointerMove}
                  onPointerUp={handleLightboxPointerUp}
                  onPointerCancel={handleLightboxPointerUp}
                  onDoubleClick={() => {
                    setLightboxZoom((zoom) => zoom > 1 ? 1 : 2.5);
                    setLightboxOffset({ x: 0, y: 0 });
                  }}
                  draggable={lightboxZoom === 1}
                  onDragStart={(e) => {
                    handleMediaDragStart(e, lightboxState.url, {
                      fallbackName: lightboxState.caption || 'whatsapp_image',
                    });
                  }}
                  onDragEnd={handleMediaDragEnd}
                  className="w-full h-full max-h-[calc(100dvh-8rem)] max-w-[94vw] object-contain rounded-2xl shadow-2xl cursor-grab active:cursor-grabbing select-none"
                  title="اسحب بإصبعين للتكبير أو حرّك الصورة بعد تكبيرها"
                />
              )}
            </div>

            {/* زر التالي (التنقل بين وسائط المحادثة أو الألبوم) */}
            {Boolean((lightboxState.albumMsgs && lightboxState.albumMsgs.length > 1) || currentChatMediaMessages.length > 1) && (
              <button
                type="button"
                onClick={() => handleNavigateLightbox('next')}
                className="absolute right-4 z-20 w-12 h-12 rounded-full bg-black/60 hover:bg-[#21c063] text-white flex items-center justify-center shadow-2xl transition-all hover:scale-110 cursor-pointer border border-white/10"
                title="الوسائط التالية (السهم الأيمن)"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* شريط الصور المصغرة للألبوم المجمع كما في واتساب ويب (Thumbnail filmstrip) */}
          {Boolean(lightboxState.albumMsgs && lightboxState.albumMsgs.length > 1) && (
            <div
              className="py-2.5 px-4 bg-black/80 backdrop-blur-md border-t border-white/10 flex items-center justify-center gap-2 overflow-x-auto [scrollbar-width:none] z-20 max-w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {lightboxState.albumMsgs!.map((m, idx) => {
                const u = m.mediaUrl || linkedReceipts[m.id]?.receiptUrl;
                const isActive = m.id === lightboxState.msgId;
                return (
                  <button
                    key={m.id || idx}
                    type="button"
                    draggable={true}
                    onDragStart={(e) => {
                      handleMediaDragStart(e, u, { fileName: `whatsapp_thumb_${m.id}.jpg` });
                    }}
                    onDragEnd={handleMediaDragEnd}
                    onClick={() => {
                      if (isMediaCurrentlyDragging()) return;
                      openLightbox(m, undefined, lightboxState.albumMsgs);
                    }}
                    className={`relative w-12 h-12 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-grab active:cursor-grabbing ${
                      isActive
                        ? 'border-[#21c063] scale-105 shadow-md shadow-[#21c063]/40'
                        : 'border-white/15 opacity-60 hover:opacity-100'
                    }`}
                    title="اسحب الصورة لسطح المكتب أو انقر لعرضها"
                  >
                    <img src={u} alt="" className="w-full h-full object-cover select-none pointer-events-none" draggable={false} />
                  </button>
                );
              })}
            </div>
          )}

          {/* الشريط السفلي للتسمية التوضيحية */}
          {Boolean(lightboxState.caption && !['ملصق', 'صورة', 'مقطع فيديو', 'تسجيل صوتي', 'مقطع صوتي'].includes(lightboxState.caption.trim())) && (
            <div
              className="p-4 bg-black/70 border-t border-white/10 text-center text-sm text-[#fafafa] max-w-3xl mx-auto rounded-t-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {lightboxState.caption}
            </div>
          )}
        </div>
      )}

      {/* نافذة معاينة وإرسال الوسائط قبل إرسالها (WhatsApp Media Preview Modal) */}
      {pendingMedia && (
        <div
          className="fixed inset-0 z-50 bg-[#111212]/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 animate-in fade-in zoom-in-95 duration-150 select-none text-[#fafafa]"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSendingMedia) {
              setPendingMedia(null);
            }
          }}
        >
          {/* الشريط العلوي للنافذة */}
          <div className="flex items-center justify-between max-w-4xl w-full mx-auto pb-4 border-b border-[#2e2f2f]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => !isSendingMedia && setPendingMedia(null)}
                disabled={isSendingMedia}
                className="w-10 h-10 rounded-full hover:bg-[#242626] text-[#b8b9b9] hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                title="إغلاق وإلغاء (Esc)"
              >
                <X className="w-6 h-6" />
              </button>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  {pendingMedia.mediaType === 'image' && <ImageIcon className="w-4 h-4 text-emerald-400" />}
                  {pendingMedia.mediaType === 'video' && <Film className="w-4 h-4 text-sky-400" />}
                  {pendingMedia.mediaType === 'sticker' && <Smile className="w-4 h-4 text-teal-400" />}
                  {pendingMedia.mediaType === 'document' && <FileText className="w-4 h-4 text-indigo-400" />}
                  {pendingMedia.mediaType === 'audio' && <Music className="w-4 h-4 text-rose-400" />}
                  <span>
                    {pendingMedia.mediaType === 'image'
                      ? 'إرسال صورة'
                      : pendingMedia.mediaType === 'video'
                      ? 'إرسال مقطع فيديو'
                      : pendingMedia.mediaType === 'sticker'
                      ? 'إرسال ملصق واتساب'
                      : pendingMedia.mediaType === 'document'
                      ? 'إرسال مستند أو ملف'
                      : 'إرسال مقطع صوتي'}
                  </span>
                </h3>
                <p className="text-[11px] text-[#a5a5a5] dir-ltr text-right truncate max-w-[260px] sm:max-w-md">
                  {pendingMedia.fileName} {pendingMedia.fileSize > 0 && `(${(pendingMedia.fileSize / 1024).toFixed(1)} KB)`}
                </p>
              </div>
            </div>

            <div className="text-xs text-[#a5a5a5]">
                  المستلم: <span className="text-[#21c063] font-bold">{resolvedActiveContactName}</span>
            </div>
          </div>

          {/* منطقة المعاينة المركزية */}
          <div className="flex-1 flex items-center justify-center py-6 px-2 overflow-hidden">
            {pendingMedia.mediaType === 'image' && (
              <img
                src={pendingMedia.dataUrl}
                alt="معاينة الصورة"
                draggable={true}
                onDragStart={(e) => {
                  handleMediaDragStart(e, pendingMedia.dataUrl, { fileName: pendingMedia.fileName });
                }}
                onDragEnd={handleMediaDragEnd}
                className="max-h-[60vh] max-w-full object-contain rounded-2xl shadow-2xl border border-white/10 cursor-grab active:cursor-grabbing select-none"
                title="اسحب الصورة إلى سطح المكتب أو أي مكان"
              />
            )}

            {pendingMedia.mediaType === 'video' && (
              <video
                src={pendingMedia.dataUrl}
                controls
                autoPlay
                className="max-h-[60vh] max-w-full rounded-2xl shadow-2xl border border-white/10 bg-black"
              />
            )}

            {pendingMedia.mediaType === 'sticker' && (
              <div className="flex flex-col items-center gap-4">
                <div
                  draggable={true}
                  onDragStart={(e) => {
                    handleMediaDragStart(e, pendingMedia.dataUrl, { fileName: pendingMedia.fileName || 'sticker.webp' });
                  }}
                  onDragEnd={handleMediaDragEnd}
                  className="w-56 h-56 rounded-3xl bg-[#242626]/70 border border-[#2e2f2f] p-4 flex items-center justify-center shadow-2xl backdrop-blur-xs cursor-grab active:cursor-grabbing"
                  title="اسحب الملصق إلى سطح المكتب"
                >
                  <img
                    src={pendingMedia.dataUrl}
                    alt="معاينة الملصق"
                    className="w-48 h-48 object-contain drop-shadow-xl animate-in zoom-in-95 duration-200 select-none pointer-events-none"
                    draggable={false}
                  />
                </div>
                <Badge className="bg-[#21c063]/20 border border-[#21c063]/40 text-[#21c063] px-3 py-1 text-xs">
                  سيتم إرسال هذا الملف كملصق واتساب شفاف مباشرة
                </Badge>
              </div>
            )}

            {pendingMedia.mediaType === 'document' && (
              <div className="p-8 bg-[#242626] border border-[#2e2f2f] rounded-3xl flex flex-col items-center gap-4 min-w-[280px] max-w-md shadow-2xl">
                <div className="w-20 h-24 rounded-2xl bg-indigo-600 flex flex-col items-center justify-center text-white shadow-xl">
                  <FileText className="w-10 h-10 mb-1" />
                  <span className="text-[10px] font-bold uppercase truncate max-w-[50px]">
                    {pendingMedia.fileName.split('.').pop() || 'FILE'}
                  </span>
                </div>
                <div className="text-center">
                  <h4 className="text-sm font-bold text-white dir-ltr truncate max-w-[250px]" title={pendingMedia.fileName}>
                    {pendingMedia.fileName}
                  </h4>
                  <p className="text-xs text-[#a5a5a5] mt-1">
                    {(pendingMedia.fileSize / 1024).toFixed(1)} KB • مستند رسمي
                  </p>
                </div>
              </div>
            )}

            {pendingMedia.mediaType === 'audio' && (
              <div className="p-8 bg-[#242626] border border-[#2e2f2f] rounded-3xl flex flex-col items-center gap-5 min-w-[320px] shadow-2xl">
                <div className="w-16 h-16 rounded-full bg-rose-600/20 border-2 border-rose-500 flex items-center justify-center text-rose-400">
                  <Music className="w-8 h-8" />
                </div>
                <audio src={pendingMedia.dataUrl} controls className="w-full" />
                <p className="text-xs text-[#a5a5a5] dir-ltr">{pendingMedia.fileName}</p>
              </div>
            )}
          </div>

          {/* الشريط السفلي: إدخال التعليق (Caption) وزر الإرسال الأخضر */}
          <div className="max-w-4xl w-full mx-auto pt-4 border-t border-[#2e2f2f] flex flex-col gap-3">
            {/* في حال وجود اقتباس مسبق */}
            {replyingToMessage && (
              <div className="bg-[#1d1f1f] border-r-4 border-r-[#21c063] rounded-lg p-2 flex items-center justify-between text-xs text-[#a5a5a5]">
                <span>رداً على <strong className="text-[#fafafa]">{replyingToMessage.isFromMe || replyingToMessage.sender === 'أنا' ? 'أنت' : replyingToMessage.sender}</strong>: {replyingToMessage.text?.slice(0, 50) || 'رسالة'}</span>
                <button
                  type="button"
                  onClick={() => setReplyingToMessage(null)}
                  className="text-[#a5a5a5] hover:text-white"
                  title="إلغاء الاقتباس"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              {pendingMedia.mediaType !== 'sticker' ? (
                <div className="flex-1 flex items-center bg-[#2e2f2f] rounded-2xl px-4 py-2.5 border border-[#3b3d3d] focus-within:border-[#21c063] transition-colors shadow-inner">
                  <input
                    type="text"
                    name="chat_media_caption"
                    autoComplete="off"
                    enterKeyHint="send"
                    autoFocus
                    value={pendingMedia.caption}
                    onChange={(e) => setPendingMedia({ ...pendingMedia, caption: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendPendingMedia();
                      }
                    }}
                    placeholder="أضف تعليقاً..."
                    className="w-full bg-transparent text-sm text-[#fafafa] placeholder-[#a5a5a5] focus:outline-none"
                  />
                </div>
              ) : (
                <div className="flex-1 text-xs text-[#a5a5a5] px-2">
                  الملصقات تُرسل مباشرة بدون تعليق وفق معايير واتساب.
                </div>
              )}

              {/* زر الإرسال الأخضر لواتساب */}
              <button
                type="button"
                onClick={handleSendPendingMedia}
                disabled={isSendingMedia}
                className="w-12 h-12 rounded-full bg-[#21c063] hover:bg-[#1daa55] text-white flex items-center justify-center shadow-lg hover:scale-105 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                title="إرسال إلى واتساب"
              >
                {isSendingMedia ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <SendHorizontal className="w-5 h-5 rtl:rotate-180" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إدارة وتخصيص القوالب والردود السريعة */}
      <QuickRepliesModal
        isOpen={isQuickRepliesModalOpen}
        onClose={() => setIsQuickRepliesModalOpen(false)}
        templates={quickReplies}
        onUpdateTemplates={(updated) => setQuickReplies(updated)}
        activeChatName={resolvedActiveContactName}
      />

      {/* ========================================================
          شاشة التحويل المتطورة (Forward to...) المطابقة لواتساب بالكامل
          مع ميزة القوائم المخصصة وتحديد مجموعات الشغل بضغطة واحدة
          ======================================================== */}
      {isForwardModalOpen && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-150 select-none" dir="rtl">
          <div className="w-full h-full md:h-[90vh] md:max-w-lg bg-[#111b21] md:border md:border-[#222e35] md:rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
            
            {/* 1. رأس شاشة التحويل (مثل الصورة 5) */}
            <div className="h-14 bg-[#202c33] px-3.5 flex items-center justify-between shrink-0 border-b border-[#2a3942]">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsForwardModalOpen(false)}
                  className="text-[#aebac1] hover:text-white p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer"
                  title="رجوع"
                >
                  <ArrowRight className="w-5 h-5 rtl:inline ltr:hidden" />
                  <ArrowLeft className="w-5 h-5 ltr:inline rtl:hidden" />
                </button>
                <div className="flex flex-col">
                  <span className="text-base font-bold text-white leading-tight">
                    تحويل إلى...
                  </span>
                  <span className="text-xs text-[#8696a0]">
                    {selectedMsgIds.length} {selectedMsgIds.length === 1 ? 'رسالة محددة' : 'رسائل محددة'}
                  </span>
                </div>
              </div>

              {/* زر إضافة / إدارة القوائم المخصصة */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditingList(null);
                    setListFormName('');
                    setListFormChats([]);
                    setListSearchQuery('');
                    setIsManagingListsModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#00a884]/15 hover:bg-[#00a884]/25 text-[#00a884] border border-[#00a884]/30 text-xs font-bold transition-all cursor-pointer"
                  title="إنشاء قائمة مخصصة جديدة (مثلاً: تبعين الشغل)"
                >
                  <Plus className="w-4 h-4" />
                  <span>قائمة جديدة</span>
                </button>
              </div>
            </div>

            {/* 2. حقل البحث السريع */}
            <div className="p-3 bg-[#111b21] border-b border-[#222e35] shrink-0">
              <div className="bg-[#202c33] rounded-xl px-3 py-2 flex items-center gap-2.5 border border-[#2a3942] focus-within:border-[#00a884] transition-colors">
                <Search className="w-4 h-4 text-[#8696a0] shrink-0" />
                <input
                  type="text"
                  value={forwardSearchQuery}
                  onChange={(e) => setForwardSearchQuery(e.target.value)}
                  placeholder="ابحث عن محادثة أو جهة اتصال..."
                  className="w-full bg-transparent text-sm text-[#e9edef] placeholder-[#8696a0] focus:outline-none"
                />
                {forwardSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setForwardSearchQuery('')}
                    className="text-[#8696a0] hover:text-white p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* 3. شريط تبويبات القوائم المخصصة (الكل، تبعين الشغل، + قائمة جديدة) */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[#111b21] border-b border-[#222e35] overflow-x-auto no-scrollbar shrink-0">
              <button
                type="button"
                onClick={() => setActiveForwardTab('all')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  activeForwardTab === 'all'
                    ? 'bg-[#00a884] text-white shadow-sm'
                    : 'bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942]'
                }`}
              >
                الكل
              </button>

              {customForwardLists.map((list) => {
                const isActive = activeForwardTab === list.id;
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => setActiveForwardTab(list.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-[#00a884] text-white shadow-sm'
                        : 'bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] hover:bg-[#2a3942]'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5" />
                    <span>{list.name}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/25">
                      {list.chatNames.length}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* في حال تم اختيار قائمة مخصصة (مثلاً: تبعين الشغل): إظهار شريط الإجراء السريع لتحديد الكل أو التعديل */}
            {activeForwardTab !== 'all' && (() => {
              const currentList = customForwardLists.find((l) => l.id === activeForwardTab);
              if (!currentList) return null;
              const allSelectedInList =
                currentList.chatNames.length > 0 &&
                currentList.chatNames.every((name) => targetChatsToForward.includes(name));

              return (
                <div className="px-3.5 py-2 bg-[#182229] border-b border-[#2a3942] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-[#00a884]" />
                    <span className="text-xs font-bold text-white">
                      قائمة: {currentList.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (allSelectedInList) {
                          setTargetChatsToForward((prev) =>
                            prev.filter((name) => !currentList.chatNames.includes(name))
                          );
                        } else {
                          setTargetChatsToForward((prev) =>
                            Array.from(new Set([...prev, ...currentList.chatNames]))
                          );
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-[#00a884]/20 hover:bg-[#00a884]/30 text-[#00a884] border border-[#00a884]/40 text-xs font-bold transition-all cursor-pointer"
                    >
                      {allSelectedInList ? 'إلغاء تحديد القائمة' : 'تحديد كل جهات القائمة'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingList(currentList);
                        setListFormName(currentList.name);
                        setListFormChats([...currentList.chatNames]);
                        setListSearchQuery('');
                        setIsManagingListsModalOpen(true);
                      }}
                      className="p-1 text-[#8696a0] hover:text-white rounded-md hover:bg-white/10"
                      title="تعديل القائمة"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* 4. قائمة المحادثات (مطابقة للصورة 5) */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#222e35]/60 pb-24">
              {(() => {
                let displayedChats = allForwardableChats;

                // التصفية بالقائمة المخصصة
                if (activeForwardTab !== 'all') {
                  const currentList = customForwardLists.find((l) => l.id === activeForwardTab);
                  if (currentList) {
                    displayedChats = displayedChats.filter((c) =>
                      currentList.chatNames.includes(c.name)
                    );
                  }
                }

                // التصفية بالبحث
                if (forwardSearchQuery.trim()) {
                  const q = forwardSearchQuery.trim().toLowerCase();
                  displayedChats = displayedChats.filter((c) =>
                    c.name.toLowerCase().includes(q)
                  );
                }

                if (displayedChats.length === 0) {
                  return (
                    <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-[#202c33] flex items-center justify-center text-[#8696a0]">
                        <Search className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-semibold text-[#8696a0]">
                        {activeForwardTab !== 'all'
                          ? 'لا توجد محادثات مضافة إلى هذه القائمة بعد'
                          : 'لم يتم العثور على محادثات مطابقة'}
                      </span>
                      {activeForwardTab !== 'all' && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentList = customForwardLists.find((l) => l.id === activeForwardTab);
                            if (currentList) {
                              setEditingList(currentList);
                              setListFormName(currentList.name);
                              setListFormChats([...currentList.chatNames]);
                              setListSearchQuery('');
                              setIsManagingListsModalOpen(true);
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#00a884] text-white font-bold text-xs cursor-pointer shadow-md"
                        >
                          إضافة محادثات إلى القائمة الآن
                        </button>
                      )}
                    </div>
                  );
                }

                // تقسيم المحادثات إلى "شائعة" و "أخيرة" كما في الصورة 5 إذا كنا في تبويب "الكل" وبدون بحث
                const isAllTabNoSearch = activeForwardTab === 'all' && !forwardSearchQuery.trim();
                const frequentChats = isAllTabNoSearch
                  ? displayedChats.filter((c) => /حوال|محاسب|إدار/i.test(c.name)).slice(0, 5)
                  : [];
                const otherChats = isAllTabNoSearch
                  ? displayedChats.filter((c) => !frequentChats.some((fc) => fc.name === c.name))
                  : displayedChats;

                const renderChatItem = (chat: any) => {
                  const isChecked = targetChatsToForward.includes(chat.name);
                  return (
                    <div
                      key={chat.id || chat.name}
                      onClick={() => {
                        setTargetChatsToForward((prev) =>
                          prev.includes(chat.name)
                            ? prev.filter((n) => n !== chat.name)
                            : [...prev, chat.name]
                        );
                      }}
                      className="px-4 py-3 flex items-center justify-between hover:bg-[#202c33] active:bg-[#2a3942] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* صورة المحادثة أو أيقونتها */}
                        <div className="w-11 h-11 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-white font-bold shrink-0 overflow-hidden">
                          {chat.avatarUrl ? (
                            <img
                              src={chat.avatarUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : chat.isGroup ? (
                            <Building className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <User className="w-5 h-5 text-sky-400" />
                          )}
                        </div>

                        {/* اسم المحادثة والوصف */}
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold text-[#e9edef] truncate" dir="auto">
                            <bdi>{chat.name}</bdi>
                          </span>
                          <span className="text-xs text-[#8696a0] truncate">
                            {chat.subtitle || 'محادثة واتساب'}
                          </span>
                        </div>
                      </div>

                      {/* الدائرة الدائرية للتحديد (مطابقة تماماً للصورة 5) */}
                      <div className="shrink-0 mr-3">
                        {isChecked ? (
                          <div className="w-5 h-5 rounded-full bg-[#00a884] border-2 border-[#00a884] flex items-center justify-center text-white shadow-sm">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-[#8696a0] hover:border-[#aebac1] transition-colors" />
                        )}
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    {frequentChats.length > 0 && (
                      <div>
                        <div className="px-4 py-2 bg-[#111b21] text-xs font-bold text-[#8696a0] tracking-wide">
                          المحادثات الشائعة (Frequently contacted)
                        </div>
                        {frequentChats.map(renderChatItem)}
                      </div>
                    )}
                    <div>
                      {frequentChats.length > 0 && (
                        <div className="px-4 py-2 bg-[#111b21] text-xs font-bold text-[#8696a0] tracking-wide">
                          المحادثات الأخيرة (Recent chats)
                        </div>
                      )}
                      {otherChats.map(renderChatItem)}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* 5. الزر العائم الدائري الأخضر للإرسال (FAB كالصورة 5) */}
            {targetChatsToForward.length > 0 && (
              <div className="absolute bottom-5 left-5 rtl:left-5 rtl:right-auto z-30 animate-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => handleMultiForward(targetChatsToForward)}
                  disabled={isForwardingInProgress}
                  className="w-14 h-14 rounded-full bg-[#00a884] hover:bg-[#008f6f] active:scale-95 text-white shadow-2xl flex items-center justify-center cursor-pointer transition-all disabled:opacity-50 relative group"
                  title={`إرسال إلى ${targetChatsToForward.length} محادثة`}
                >
                  {/* شارة عدد المحادثات المحددة */}
                  <span className="absolute -top-1 -right-1 bg-white text-[#00a884] font-black text-xs w-5 h-5 rounded-full flex items-center justify-center shadow-md">
                    {targetChatsToForward.length}
                  </span>
                  {isForwardingInProgress ? (
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                  ) : (
                    <Send className="w-6 h-6 stroke-[2.5] rtl:rotate-180 text-white" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          نافذة إنشاء وتعديل القوائم المخصصة (مثل: تبعين الشغل)
          ======================================================== */}
      {isManagingListsModalOpen && (
        <div className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 select-none" dir="rtl">
          <div className="w-full max-w-md bg-[#1f2c34] border border-[#2a3942] rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] animate-in zoom-in-95 duration-150">
            {/* رأس النافذة */}
            <div className="p-4 bg-[#202c33] border-b border-[#2a3942] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Briefcase className="w-5 h-5 text-[#00a884]" />
                <h3 className="text-base font-bold text-white">
                  {editingList ? `تعديل قائمة: ${editingList.name}` : 'إنشاء قائمة مخصصة جديدة'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsManagingListsModalOpen(false)}
                className="text-[#8696a0] hover:text-white p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* جسم النافذة */}
            <div className="p-4 flex flex-col gap-4 overflow-y-auto flex-1">
              {/* اسم القائمة */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#e9edef]">اسم القائمة (مثال: تبعين الشغل، المندوبين...)</label>
                <input
                  type="text"
                  value={listFormName}
                  onChange={(e) => setListFormName(e.target.value)}
                  placeholder="مثال: تبعين الشغل"
                  className="bg-[#111b21] border border-[#2a3942] focus:border-[#00a884] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none"
                />
              </div>

              {/* البحث وتحديد المحادثات التابعة لهذه القائمة */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#e9edef]">
                    اختر المحادثات المشمولة في هذه القائمة ({listFormChats.length})
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setListFormChats(allForwardableChats.map((c) => c.name))}
                      className="text-[11px] text-[#00a884] hover:underline cursor-pointer"
                    >
                      تحديد الكل
                    </button>
                    <span className="text-[#8696a0]">•</span>
                    <button
                      type="button"
                      onClick={() => setListFormChats([])}
                      className="text-[11px] text-[#8696a0] hover:text-white cursor-pointer"
                    >
                      إلغاء الكل
                    </button>
                  </div>
                </div>

                <div className="bg-[#111b21] rounded-xl px-3 py-1.5 flex items-center gap-2 border border-[#2a3942]">
                  <Search className="w-4 h-4 text-[#8696a0] shrink-0" />
                  <input
                    type="text"
                    value={listSearchQuery}
                    onChange={(e) => setListSearchQuery(e.target.value)}
                    placeholder="ابحث لتصفية المحادثات..."
                    className="w-full bg-transparent text-xs text-[#e9edef] placeholder-[#8696a0] focus:outline-none"
                  />
                </div>

                {/* قائمة الاختيار للمحادثات */}
                <div className="border border-[#2a3942] rounded-xl bg-[#111b21] max-h-56 overflow-y-auto divide-y divide-[#222e35]/60 p-1">
                  {allForwardableChats
                    .filter((c) => !listSearchQuery.trim() || c.name.toLowerCase().includes(listSearchQuery.toLowerCase()))
                    .map((chat) => {
                      const isSelected = listFormChats.includes(chat.name);
                      return (
                        <div
                          key={chat.id || chat.name}
                          onClick={() => {
                            setListFormChats((prev) =>
                              prev.includes(chat.name)
                                ? prev.filter((n) => n !== chat.name)
                                : [...prev, chat.name]
                            );
                          }}
                          className="px-3 py-2 flex items-center justify-between hover:bg-[#202c33] rounded-lg cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center shrink-0">
                              {chat.isGroup ? (
                                <Building className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <User className="w-4 h-4 text-sky-400" />
                              )}
                            </div>
                            <span className="text-xs font-semibold text-[#e9edef] truncate" dir="auto">
                              <bdi>{chat.name}</bdi>
                            </span>
                          </div>
                          <div className="shrink-0 mr-2">
                            {isSelected ? (
                              <div className="w-4 h-4 rounded-full bg-[#00a884] flex items-center justify-center text-white">
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              </div>
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-[#8696a0]" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* تذييل النافذة */}
            <div className="p-3 bg-[#202c33] border-t border-[#2a3942] flex items-center justify-between gap-2">
              {editingList ? (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`هل أنت متأكد من حذف قائمة "${editingList.name}"؟`)) {
                      const updated = customForwardLists.filter((l) => l.id !== editingList.id);
                      saveCustomForwardLists(updated);
                      setActiveForwardTab('all');
                      setIsManagingListsModalOpen(false);
                      toast.success(`تم حذف قائمة "${editingList.name}" بنجاح`);
                    }
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                >
                  حذف القائمة
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsManagingListsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-transparent hover:bg-white/5 text-xs font-bold text-[#8696a0] hover:text-white cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const name = listFormName.trim();
                    if (!name) {
                      toast.warning('يرجى إدخال اسم للقائمة');
                      return;
                    }
                    if (editingList) {
                      const updated = customForwardLists.map((l) =>
                        l.id === editingList.id ? { ...l, name, chatNames: listFormChats } : l
                      );
                      saveCustomForwardLists(updated);
                      toast.success(`تم تحديث قائمة "${name}" بنجاح`);
                    } else {
                      const newList = {
                        id: `list_${Date.now()}`,
                        name,
                        chatNames: listFormChats,
                      };
                      const updated = [...customForwardLists, newList];
                      saveCustomForwardLists(updated);
                      setActiveForwardTab(newList.id);
                      toast.success(`تم إنشاء قائمة "${name}" بنجاح`);
                    }
                    setIsManagingListsModalOpen(false);
                  }}
                  className="px-5 py-2 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white text-xs font-bold cursor-pointer shadow-md"
                >
                  حفظ القائمة
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* القائمة السياقية للمحادثة (كليك يمين وسطح المكتب والجوال) */}
      <WhatsappChatContextMenu
        isOpen={Boolean(chatContextMenu?.open)}
        x={chatContextMenu?.x || 0}
        y={chatContextMenu?.y || 0}
        chat={chatContextMenu?.chat}
        isPinned={Boolean(
          chatContextMenu?.chat &&
            (pinnedChatKeys.has(chatContextMenu.chat.id || '') ||
              pinnedChatKeys.has(chatContextMenu.chat.name))
        )}
        isArchived={Boolean(
          chatContextMenu?.chat &&
            (typeof chatContextMenu.chat.archived === 'boolean'
              ? chatContextMenu.chat.archived
              : archivedChatKeys.has(chatContextMenu.chat.id || '') ||
                archivedChatKeys.has(chatContextMenu.chat.name))
        )}
        isMuted={Boolean(
          chatContextMenu?.chat &&
            (mutedChats[chatContextMenu.chat.id || ''] ||
              mutedChats[chatContextMenu.chat.name])
        )}
        isUnread={Boolean(
          chatContextMenu?.chat &&
            ((chatContextMenu.chat.unread || 0) > 0 ||
              markedUnreadChatKeys.has(chatContextMenu.chat.id || '') ||
              markedUnreadChatKeys.has(chatContextMenu.chat.name))
        )}
        isFavorite={Boolean(
          chatContextMenu?.chat &&
            (favoriteChatKeys.has(chatContextMenu.chat.id || '') ||
              favoriteChatKeys.has(chatContextMenu.chat.name))
        )}
        customLists={customLists}
        onClose={() => setChatContextMenu(null)}
        onOpenInfo={(chat) => {
          setChatContextMenu(null);
          fetchChatInfo(chat.id || chat.name);
        }}
        onPopoutChat={handlePopoutChat}
        onTogglePin={togglePinChat}
        onToggleArchive={toggleArchiveChat}
        onMute={handleMuteChat}
        onToggleUnread={toggleMarkUnread}
        onToggleFavorite={toggleFavoriteChat}
        onToggleCustomList={toggleChatInCustomList}
        onCreateNewList={handleCreateNewList}
        onClearChat={handleClearChat}
        onExitOrDelete={handleExitOrDeleteChat}
      />

      {/* نافذة معاينة وتكبير صورة البروفايل بحجم كامل */}
      <WhatsappAvatarLightbox
        isOpen={Boolean(avatarLightbox?.isOpen)}
        onClose={() => setAvatarLightbox(null)}
        avatarUrl={avatarLightbox?.url}
        name={avatarLightbox?.title || ''}
        subtitle={avatarLightbox?.subtitle}
        isGroup={avatarLightbox?.isGroup}
      />

    </div>
  );
}
