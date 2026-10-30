export interface WhatsAppSticker {
  id: string;
  url: string;
  title: string;
  packId: string;
  packName?: string;
  keywords?: string[];
}

export interface StickerPack {
  id: string;
  name: string;
  arabicName: string;
  icon: string;
  author: string;
  stickers: WhatsAppSticker[];
}

export const BUILTIN_STICKER_PACKS: StickerPack[] = [
  {
    id: 'pepe',
    name: 'Pepe & Memes',
    arabicName: 'بيبي وميمز واتساب',
    icon: '🐸',
    author: 'WhatsApp Memes',
    stickers: [
      { id: 'pepe_01', url: '/stickers/pepe_01_Pepe_laugh.webp', title: 'Pepe Laugh ضحك', packId: 'pepe', keywords: ['laugh', 'ضحك', 'pepe', 'ميمز', 'meme'] },
      { id: 'pepe_02', url: '/stickers/pepe_02_Pepe_smile.webp', title: 'Pepe Smile ابتسامة', packId: 'pepe', keywords: ['smile', 'ابتسامة', 'pepe', 'تمام'] },
      { id: 'pepe_03', url: '/stickers/pepe_03_Pepe_cry.webp', title: 'Pepe Cry بكاء', packId: 'pepe', keywords: ['cry', 'بكاء', 'حزن', 'sad', 'دموع'] },
      { id: 'pepe_04', url: '/stickers/pepe_04_Pepe_ostentation.webp', title: 'Pepe Rich فلوس', packId: 'pepe', keywords: ['money', 'فلوس', 'غني', 'كاش', 'دولار'] },
      { id: 'pepe_05', url: '/stickers/pepe_05_Pepe_sad.webp', title: 'Pepe Sad حزين', packId: 'pepe', keywords: ['sad', 'حزين', 'زعلان', 'depressed'] },
      { id: 'pepe_06', url: '/stickers/pepe_06_Pepe_rage.webp', title: 'Pepe Rage غضب', packId: 'pepe', keywords: ['rage', 'angry', 'معصب', 'غضب', 'نار'] },
      { id: 'pepe_07', url: '/stickers/pepe_07_Pepe_suggestive.webp', title: 'Pepe Smirk غمزة', packId: 'pepe', keywords: ['smirk', 'غمزة', 'خبيث', 'فاهمك'] },
      { id: 'pepe_08', url: '/stickers/pepe_08_Pepe_chaos.webp', title: 'Pepe Chaos فوضى', packId: 'pepe', keywords: ['chaos', 'صراخ', 'جنون', 'فوضى'] },
      { id: 'pepe_09', url: '/stickers/pepe_09_Pepe_foreveralone.webp', title: 'Pepe Alone وحيد', packId: 'pepe', keywords: ['alone', 'وحيد', 'مكتئب'] },
      { id: 'pepe_10', url: '/stickers/pepe_10_Pepe_cute.webp', title: 'Pepe Cute لطيف', packId: 'pepe', keywords: ['cute', 'لطيف', 'كيوت', 'حب'] },
      { id: 'pepe_11', url: '/stickers/pepe_11_Pepe_malicious.webp', title: 'Pepe Evil شرير', packId: 'pepe', keywords: ['evil', 'شرير', 'مخطط'] },
      { id: 'pepe_12', url: '/stickers/pepe_12_Pepe_drunk.webp', title: 'Pepe Dizzy دايخ', packId: 'pepe', keywords: ['dizzy', 'تعبان', 'دايخ'] },
      { id: 'pepe_13', url: '/stickers/pepe_13_Pepe_anxious.webp', title: 'Pepe Anxious قلقان', packId: 'pepe', keywords: ['anxious', 'قلقان', 'خايف', 'توتر'] },
      { id: 'pepe_14', url: '/stickers/pepe_14_Pepe_womanish.webp', title: 'Pepe Queen ملكة', packId: 'pepe', keywords: ['queen', 'شياكة', 'أناقة'] },
      { id: 'pepe_15', url: '/stickers/pepe_15_Pepe_ghost.webp', title: 'Pepe Ghost شبح', packId: 'pepe', keywords: ['ghost', 'شبح', 'مختفي'] },
      { id: 'pepe_16', url: '/stickers/pepe_16_Pepe_joker.webp', title: 'Pepe Joker جوكر', packId: 'pepe', keywords: ['joker', 'جوكر', 'ضحك'] },
      { id: 'pepe_17', url: '/stickers/pepe_17_Pepe_resistance.webp', title: 'Pepe Mask كمامة', packId: 'pepe', keywords: ['mask', 'كمامة', 'وقاية'] },
      { id: 'pepe_18', url: '/stickers/pepe_18_Pepe_stoned.webp', title: 'Pepe Chill مروق', packId: 'pepe', keywords: ['chill', 'مروق', 'نعسان', 'هادي'] },
      { id: 'pepe_19', url: '/stickers/pepe_19_Pepe_desolate.webp', title: 'Pepe Down منهار', packId: 'pepe', keywords: ['down', 'تعبان', 'يأس'] },
      { id: 'pepe_20', url: '/stickers/pepe_20_Pepe_logan.webp', title: 'Pepe Hero بطل', packId: 'pepe', keywords: ['hero', 'بطل', 'قوي'] },
      { id: 'pepe_21', url: '/stickers/pepe_21_Pepe_thoughtful.webp', title: 'Pepe Thinking تفكير', packId: 'pepe', keywords: ['thinking', 'تفكير', 'بفكر', 'محتار'] },
    ],
  },
  {
    id: 'cuppy',
    name: 'Cuppy (Official)',
    arabicName: 'كوبي فنجان القهوة',
    icon: '☕',
    author: 'WhatsApp Inc.',
    stickers: [
      { id: 'cuppy_01', url: '/stickers/1_01_Cuppy_smile.webp', title: 'Cuppy Smile', packId: 'cuppy', keywords: ['cuppy', 'smile', 'قهوة', 'صباح الخير', 'فنجان'] },
      { id: 'cuppy_02', url: '/stickers/1_02_Cuppy_lol.webp', title: 'Cuppy Laugh', packId: 'cuppy', keywords: ['cuppy', 'lol', 'ضحك', 'قهوة'] },
      { id: 'cuppy_03', url: '/stickers/1_03_Cuppy_rofl.webp', title: 'Cuppy ROFL', packId: 'cuppy', keywords: ['cuppy', 'rofl', 'ميت ضحك'] },
      { id: 'cuppy_04', url: '/stickers/1_04_Cuppy_sad.webp', title: 'Cuppy Sad', packId: 'cuppy', keywords: ['cuppy', 'sad', 'زعلان', 'حزين'] },
      { id: 'cuppy_05', url: '/stickers/1_05_Cuppy_cry.webp', title: 'Cuppy Cry', packId: 'cuppy', keywords: ['cuppy', 'cry', 'بكاء'] },
      { id: 'cuppy_06', url: '/stickers/1_06_Cuppy_love.webp', title: 'Cuppy Love', packId: 'cuppy', keywords: ['cuppy', 'love', 'حب', 'قلب'] },
      { id: 'cuppy_07', url: '/stickers/1_07_Cuppy_hate.webp', title: 'Cuppy Dislike', packId: 'cuppy', keywords: ['cuppy', 'dislike', 'مش عاجبني'] },
      { id: 'cuppy_08', url: '/stickers/1_08_Cuppy_lovewithmug.webp', title: 'Cuppy Hug', packId: 'cuppy', keywords: ['cuppy', 'hug', 'حضن', 'عناق'] },
      { id: 'cuppy_09', url: '/stickers/1_09_Cuppy_lovewithcookie.webp', title: 'Cuppy Cookie', packId: 'cuppy', keywords: ['cuppy', 'cookie', 'كعك', 'شاي'] },
      { id: 'cuppy_10', url: '/stickers/1_10_Cuppy_hmm.webp', title: 'Cuppy Hmm', packId: 'cuppy', keywords: ['cuppy', 'hmm', 'تفكير'] },
      { id: 'cuppy_11', url: '/stickers/1_11_Cuppy_upset.webp', title: 'Cuppy Upset', packId: 'cuppy', keywords: ['cuppy', 'upset', 'مصدوم'] },
      { id: 'cuppy_12', url: '/stickers/1_12_Cuppy_angry.webp', title: 'Cuppy Angry', packId: 'cuppy', keywords: ['cuppy', 'angry', 'معصب'] },
      { id: 'cuppy_13', url: '/stickers/1_13_Cuppy_curious.webp', title: 'Cuppy Curious', packId: 'cuppy', keywords: ['cuppy', 'curious', 'شو صار'] },
      { id: 'cuppy_14', url: '/stickers/1_14_Cuppy_weird.webp', title: 'Cuppy Weird', packId: 'cuppy', keywords: ['cuppy', 'weird', 'غريب'] },
      { id: 'cuppy_15', url: '/stickers/1_15_Cuppy_bluescreen.webp', title: 'Cuppy Error', packId: 'cuppy', keywords: ['cuppy', 'error', 'علق'] },
      { id: 'cuppy_16', url: '/stickers/1_16_Cuppy_angry.webp', title: 'Cuppy Mad', packId: 'cuppy', keywords: ['cuppy', 'mad', 'غضبان'] },
      { id: 'cuppy_17', url: '/stickers/1_17_Cuppy_tired.webp', title: 'Cuppy Tired', packId: 'cuppy', keywords: ['cuppy', 'tired', 'تعبان', 'نعسان'] },
      { id: 'cuppy_18', url: '/stickers/1_18_Cuppy_workhard.webp', title: 'Cuppy Working', packId: 'cuppy', keywords: ['cuppy', 'work', 'شغل', 'دوام'] },
      { id: 'cuppy_19', url: '/stickers/1_19_Cuppy_shine.webp', title: 'Cuppy Star', packId: 'cuppy', keywords: ['cuppy', 'star', 'نجم', 'كفو'] },
      { id: 'cuppy_20', url: '/stickers/1_20_Cuppy_disgusting.webp', title: 'Cuppy Blehh', packId: 'cuppy', keywords: ['cuppy', 'bleh', 'يع'] },
      { id: 'cuppy_21', url: '/stickers/1_21_Cuppy_hi.webp', title: 'Cuppy Hi', packId: 'cuppy', keywords: ['cuppy', 'hi', 'مرحبا', 'أهلا'] },
      { id: 'cuppy_22', url: '/stickers/1_22_Cuppy_bye.webp', title: 'Cuppy Bye', packId: 'cuppy', keywords: ['cuppy', 'bye', 'مع السلامة', 'باي'] },
      { id: 'cuppy_23', url: '/stickers/1_23_Cuppy_greentea.webp', title: 'Cuppy Tea', packId: 'cuppy', keywords: ['cuppy', 'tea', 'شاي أخضر'] },
      { id: 'cuppy_24', url: '/stickers/1_24_Cuppy_phone.webp', title: 'Cuppy Call', packId: 'cuppy', keywords: ['cuppy', 'call', 'اتصال', 'تلفون'] },
      { id: 'cuppy_25', url: '/stickers/1_25_Cuppy_battery.webp', title: 'Cuppy Low Battery', packId: 'cuppy', keywords: ['cuppy', 'battery', 'بطارية', 'فصل'] },
    ],
  },
  {
    id: 'together',
    name: 'Together at Home',
    arabicName: 'معاً ومشاعر يومية',
    icon: '🤝',
    author: 'WhatsApp & WHO',
    stickers: [
      { id: 'tog_01', url: '/stickers/2_01_SendingLove.webp', title: 'Sending Love إرسال حب', packId: 'together', keywords: ['love', 'حب', 'قلب'] },
      { id: 'tog_02', url: '/stickers/2_02_WellDoThisTogether.webp', title: 'Together معاً', packId: 'together', keywords: ['together', 'معاً', 'قوة'] },
      { id: 'tog_03', url: '/stickers/2_03_Heart.webp', title: 'Heart قلب كبير', packId: 'together', keywords: ['heart', 'قلب'] },
      { id: 'tog_04', url: '/stickers/2_04_AirHighFive.webp', title: 'High Five تحية', packId: 'together', keywords: ['high five', 'كفو', 'تحية'] },
      { id: 'tog_05', url: '/stickers/2_05_GroupVideoCalling.webp', title: 'Video Call مكالمة', packId: 'together', keywords: ['call', 'مكالمة', 'فيديو'] },
      { id: 'tog_06', url: '/stickers/2_06_StayConnected.webp', title: 'Connected تواصل', packId: 'together', keywords: ['connected', 'تواصل'] },
      { id: 'tog_07', url: '/stickers/2_07_OK.webp', title: 'OK تمام', packId: 'together', keywords: ['ok', 'تمام', 'تم'] },
      { id: 'tog_08', url: '/stickers/2_08_AreYouOK.webp', title: 'Are You OK كيفك', packId: 'together', keywords: ['how are you', 'كيفك', 'طمني'] },
      { id: 'tog_09', url: '/stickers/2_09_StayingHomeMug.webp', title: 'Relaxing استرخاء', packId: 'together', keywords: ['relax', 'شاي', 'قهوة'] },
      { id: 'tog_10', url: '/stickers/2_10_WorkingFromBed.webp', title: 'In Bed نوم', packId: 'together', keywords: ['bed', 'سرير', 'كسل'] },
      { id: 'tog_11', url: '/stickers/2_11_StayCalm.webp', title: 'Stay Calm هدوء', packId: 'together', keywords: ['calm', 'روق', 'اهدا'] },
      { id: 'tog_12', url: '/stickers/2_12_Gymnastics.webp', title: 'Sport رياضة', packId: 'together', keywords: ['sport', 'رياضة', 'نشاط'] },
      { id: 'tog_13', url: '/stickers/2_13_DoubleChecking.webp', title: 'Double Check تدقيق', packId: 'together', keywords: ['check', 'تدقيق', 'فحص'] },
      { id: 'tog_14', url: '/stickers/2_14_CatOnTheLaptop.webp', title: 'Cat Laptop قطة', packId: 'together', keywords: ['cat', 'قطة', 'لابتوب'] },
      { id: 'tog_15', url: '/stickers/2_15_WorkingFromHomeF.webp', title: 'Working عمل', packId: 'together', keywords: ['work', 'عمل'] },
      { id: 'tog_16', url: '/stickers/2_16_WorkingFromHomeM.webp', title: 'Study دراسة', packId: 'together', keywords: ['study', 'دراسة'] },
      { id: 'tog_17', url: '/stickers/2_17_WashingHands.webp', title: 'Clean نظافة', packId: 'together', keywords: ['clean', 'نظافة'] },
      { id: 'tog_18', url: '/stickers/2_18_DontTouchYourFace.webp', title: 'Careful انتباه', packId: 'together', keywords: ['careful', 'انتبه'] },
      { id: 'tog_19', url: '/stickers/2_19_SocialDistancing.webp', title: 'Distance مسافة', packId: 'together', keywords: ['distance'] },
      { id: 'tog_20', url: '/stickers/2_20_SuperheroNurse.webp', title: 'Hero بطل', packId: 'together', keywords: ['hero', 'بطل'] },
      { id: 'tog_21', url: '/stickers/2_21_YouAreMyHero.webp', title: 'You Are My Hero', packId: 'together', keywords: ['hero', 'شكرا', 'فنان'] },
    ],
  },
  {
    id: 'chat_gems',
    name: 'Received in Chats',
    arabicName: 'ملصقات المحادثات الحقيقية',
    icon: '💬',
    author: 'My Chats',
    stickers: [
      { id: 'chat_stk_1', url: '/stickers/2A81F3412A06EE729A63.webp', title: 'ملصق المحادثة 1', packId: 'chat_gems', keywords: ['شات', 'ملصق', 'مضحك'] },
      { id: 'chat_stk_2', url: '/stickers/3EB047B2A2AAE24D9D1BB7.webp', title: 'ملصق المحادثة 2', packId: 'chat_gems', keywords: ['شات', 'ملصق', 'رياكشن'] },
      { id: 'chat_stk_3', url: '/stickers/A56A9CD492C2EE1369635A48691DA8FC.webp', title: 'ملصق المحادثة 3', packId: 'chat_gems', keywords: ['شات', 'ملصق', 'ميم'] },
      { id: 'chat_stk_4', url: '/stickers/AC612CEB08B47C6F11CFFE9E45735B90.webp', title: 'ملصق المحادثة 4', packId: 'chat_gems', keywords: ['شات', 'ملصق', 'تفاعل'] },
    ],
  },
];

// دالة البحث الشامل في متجر الملصقات
export function searchStickersInStore(query: string, customStickers: WhatsAppSticker[] = []): WhatsAppSticker[] {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];

  const allStickers: WhatsAppSticker[] = [
    ...customStickers,
    ...BUILTIN_STICKER_PACKS.flatMap((p) => p.stickers),
  ];

  // إزالة التكرار بالـ url
  const uniqueMap = new Map<string, WhatsAppSticker>();
  for (const s of allStickers) {
    if (!uniqueMap.has(s.url)) {
      uniqueMap.set(s.url, s);
    }
  }

  return Array.from(uniqueMap.values()).filter((s) => {
    if (s.title.toLowerCase().includes(q)) return true;
    if (s.packName && s.packName.toLowerCase().includes(q)) return true;
    if (s.keywords && s.keywords.some((k) => k.toLowerCase().includes(q))) return true;
    return false;
  });
}
