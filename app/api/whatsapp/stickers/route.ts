import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppManager } from '@/lib/whatsapp-client';
import { BUILTIN_STICKER_PACKS, WhatsAppSticker } from '@/lib/sticker-store';
import fs from 'fs';
import path from 'path';

function getFavoritesFilePath(waDir: string): string {
  if (!fs.existsSync(waDir)) {
    fs.mkdirSync(waDir, { recursive: true });
  }
  return path.join(waDir, 'favorite_stickers.json');
}

function loadFavoriteStickers(waDir: string): WhatsAppSticker[] {
  try {
    const p = getFavoritesFilePath(waDir);
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
    const rootP = path.join(process.cwd(), 'whatsapp_auth', 'favorite_stickers.json');
    if (fs.existsSync(rootP)) {
      const data = JSON.parse(fs.readFileSync(rootP, 'utf-8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.error('Error loading favorite stickers:', e);
  }
  return [
    { id: 'fav_chat_1', url: '/stickers/2A81F3412A06EE729A63.webp', title: 'ملصق محادثة', packId: 'favorites' },
    { id: 'fav_chat_2', url: '/stickers/A56A9CD492C2EE1369635A48691DA8FC.webp', title: 'ملصق محادثة مضحك', packId: 'favorites' },
    { id: 'fav_chat_3', url: '/stickers/AC612CEB08B47C6F11CFFE9E45735B90.webp', title: 'ملصق تفاعل', packId: 'favorites' },
  ];
}

function saveFavoriteStickers(waDir: string, stickers: WhatsAppSticker[]) {
  try {
    const p = getFavoritesFilePath(waDir);
    fs.writeFileSync(p, JSON.stringify(stickers, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving favorite stickers:', e);
  }
}

export async function GET(req: NextRequest) {
  const wa = getWhatsAppManager(req);
  const waDir = wa.authDir || path.join(process.cwd(), 'whatsapp_auth');
  const favorites = loadFavoriteStickers(waDir);
  return NextResponse.json({
    success: true,
    favorites,
    packs: BUILTIN_STICKER_PACKS,
  });
}

export async function POST(req: NextRequest) {
  try {
    const wa = getWhatsAppManager(req);
    const waDir = wa.authDir || path.join(process.cwd(), 'whatsapp_auth');
    const body = await req.json();
    const { action, sticker, stickerUrl, chat } = body;

    // 1. إضافة للمفضلة
    if (action === 'favorite') {
      const url = sticker?.url || stickerUrl;
      if (!url) {
        return NextResponse.json({ success: false, error: 'رابط الملصق مطلوب' }, { status: 400 });
      }

      const favorites = loadFavoriteStickers(waDir);
      const existing = favorites.find((s) => s.url === url);
      if (!existing) {
        const newSticker: WhatsAppSticker = {
          id: sticker?.id || `stk_${Date.now()}`,
          url,
          title: sticker?.title || 'ملصق من المحادثة',
          packId: 'favorites',
          keywords: sticker?.keywords || ['مفضلة', 'ستيكر'],
        };
        const updated = [newSticker, ...favorites];
        saveFavoriteStickers(waDir, updated);
        return NextResponse.json({ success: true, favorites: updated, message: 'تمت إضافة الملصق للمفضلة بنجاح' });
      }
      return NextResponse.json({ success: true, favorites, message: 'الملصق موجود بالمفضلة بالفعل' });
    }

    // 2. إزالة من المفضلة
    if (action === 'unfavorite') {
      const url = sticker?.url || stickerUrl;
      const id = sticker?.id;
      const favorites = loadFavoriteStickers(waDir);
      const updated = favorites.filter((s) => (url ? s.url !== url : s.id !== id));
      saveFavoriteStickers(waDir, updated);
      return NextResponse.json({ success: true, favorites: updated, message: 'تمت إزالة الملصق من المفضلة' });
    }

    // 3. إرسال الملصق فورياً للمحادثة عبر واتساب
    if (action === 'send') {
      const targetChat = chat;
      const url = sticker?.url || stickerUrl;
      if (!targetChat || !url) {
        return NextResponse.json({ success: false, error: 'المحادثة ورابط الملصق مطلوبان' }, { status: 400 });
      }

      const res = await wa.sendMediaMessage(targetChat, {
        mediaUrl: url,
        mediaType: 'sticker',
      });

      return NextResponse.json({
        success: res.success,
        message: res.message,
        messageId: res.messageId,
      });
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (e: any) {
    console.error('Stickers API error:', e);
    return NextResponse.json({ success: false, error: e.message || 'حدث خطأ' }, { status: 500 });
  }
}
