// مساعد تعبئة بوابة عقليات الذكي V1.4 - نظام الحوالات
(function () {
  console.log(' مساعد تعبئة بوابة عقليات V1.9 بدأ العمل...');

  // الرفع التلقائي لصورة الوصل: موقوف (التسجيل لا ينجح عند رفع الصورة تلقائياً، بينما ينجح بالرفع اليدوي)
  // لتشغيله: غيّر القيمة إلى true
  const AUTO_UPLOAD_RECEIPT = false;
  // تنبيه "لم يتم إرفاق صورة الوصل" عند الضغط على تسجيل: موقوف (كان يعترض زر التسجيل)
  const SUBMIT_GUARD = false;

  // 1. استخراج البيانات من رابط الصفحة (يدعم ?data= و #data= و ?autofill= و #autofill= مع التخزين المؤقت)
  function getUrlData() {
    try {
      const fullUrl = window.location.href;
      const match = fullUrl.match(/(?:data|autofill)=([^&#]+)/);
      if (match && match[1]) {
        let raw = decodeURIComponent(match[1]);
        // في بعض المتصفحات والروابط يتحول الرمز + في Base64 إلى مسافة، نعيده لأصله لضمان صحة فك التشفير
        raw = raw.replace(/ /g, '+');

        let jsonStr = '';
        try {
          jsonStr = decodeURIComponent(escape(atob(raw)));
        } catch (e1) {
          try {
            jsonStr = atob(raw);
          } catch (e2) {
            try {
              jsonStr = decodeURIComponent(raw);
            } catch (e3) {
              jsonStr = raw;
            }
          }
        }

        if (jsonStr && jsonStr.trim().startsWith('{')) {
          const parsed = JSON.parse(jsonStr);
          // حفظ البيانات في sessionStorage لضمان استمراريتها في حال قام المستخدم بتحديث الصفحة (F5)
          try {
            sessionStorage.setItem('hawalat_last_portal_data', jsonStr);
          } catch (e) {}
          // تنظيف عنوان الصفحة في المتصفح فوراً لمنع تراكم الروابط الطويلة وحماية الاتصال بالسيرفر عند التسجيل
          try {
            if (window.location.hash && (window.location.hash.includes('data=') || window.location.hash.includes('autofill='))) {
              history.replaceState(null, '', window.location.pathname + window.location.search);
            }
          } catch (e) {}
          return parsed;
        }
      }

      // بديل ذكي: إذا كان المستخدم قد قام بتحديث الصفحة (F5) أو فتحها بدون هاش، نسترجع آخر بيانات معبأة
      try {
        const cached = sessionStorage.getItem('hawalat_last_portal_data');
        if (cached && cached.trim().startsWith('{')) {
          const parsedCached = JSON.parse(cached);
          if (parsedCached && parsedCached.participantName) {
            return parsedCached;
          }
        }
      } catch (e) {}
    } catch (e) {
      console.warn('تنبيه: لم يتم العثور على بيانات صالحة في الرابط:', e);
    }
    return null;
  }

  // 2. جلب البيانات من السيرفر المحلي عبر Background Service Worker (يتجاوز قيود Mixed Content)
  async function fetchPendingData() {
    // محاولة 1: عبر Background Service Worker (مضمون 100% داخل صفحات HTTPS)
    try {
      const bgResponse = await new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          const timeout = setTimeout(() => resolve(null), 800);
          chrome.runtime.sendMessage({ type: 'fetch-pending' }, (res) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(res);
            }
          });
        } else {
          resolve(null);
        }
      });

      if (bgResponse && bgResponse.ok && bgResponse.data && bgResponse.data.participantName) {
        return bgResponse.data;
      }
    } catch (err) {}

    // محاولة 2: عبر fetch مباشر لسيرفر 3010 مع مهلة سريعة (بدون انتظار منفذ 3000)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 600);
      const res = await fetch('http://localhost:3010/api/portal/pending', { signal: controller.signal });
      clearTimeout(timeout);
      if (res && res.ok) {
        const json = await res.json();
        if (json && json.participantName) {
          return json;
        }
      }
    } catch (err) {}
    return null;
  }

  // إزالة شريط التنبيه العائم في أعلى الصفحة نهائياً بناءً على طلب المستخدم
  function createBanner() {
    const existing = document.getElementById('aqleeat-autofill-banner');
    if (existing) existing.remove();
  }

  // توليد صورة بطاقة رسالة واتساب المطابقة تماماً لبطاقة أيرتيبل (WhatsApp Dark Green Outgoing Bubble)
  async function renderAirtableCardBlob(data) {
    try {
      let textLines = [];
      const raw = (data.rawText || data.messageText || '').trim();
      if (raw) {
        textLines = raw.split(/\r?\n/).map((l) => l.trim());
      } else {
        const isAisha = data.paymentMethod === 'استلام باليد' || (data.notes && data.notes.includes('تسليم باليد')) || Boolean(data.isAishaHandDelivery);
        const phoneVal = data.phone || data.cleanPhone || '';
        const formattedPhone = phoneVal.startsWith('+')
          ? phoneVal
          : phoneVal.startsWith('970') || phoneVal.startsWith('972')
          ? `+${phoneVal}`
          : phoneVal;

        textLines = [
          'اسم المشترك ثلاثي:',
          data.participantName || '',
          `عمر المشترك: ${data.age || '12'}`,
          `الجنس (ذكر/انثى): ${data.gender || 'ذكر'}`,
          'اسم مرسل الحوالة:',
          (data.senderName && data.senderName !== data.participantName) ? data.senderName : '',
          'رقم جوال المشترك:',
          formattedPhone,
          'مع مقدمة الدوله:',
          'البريد الإلكتروني',
          data.email || '',
          'قيمة الرسوم للمشترك:',
          `${data.amount || 85} ${data.currency === 'USD' ? 'دولار' : data.currency === 'ILS' ? 'شيكل' : data.currency === 'SAR' ? 'ريال' : data.currency === 'AED' ? 'درهم' : 'دينار'}`,
          `نوع الحوالة: ${isAisha ? 'استلام باليد (كاش)' : 'مصرفية'}`,
          data.transferNumber ? `رقم الحوالة: ${data.transferNumber}` : '',
          `تاريخ السداد:${data.paymentDate || ''}`,
          `اسم المنسق: ${data.coordinatorName || ''}`,
          isAisha ? 'تم التسليم باليد' : `تم التحويل للمندوب دفعة ${data.batch || ''}`,
        ].filter((l) => l !== undefined && l !== null);
      }

      // فلترة الأسطر الفارغة المتتالية
      const cleanedLines = [];
      for (let i = 0; i < textLines.length; i++) {
        const curr = textLines[i];
        if (!curr && i > 0 && !textLines[i - 1]) continue;
        cleanedLines.push(curr);
      }

      const canvas = document.createElement('canvas');
      const width = 560;
      const paddingX = 26;
      const lineHeight = 28;
      const topHeaderHeight = 44;
      const bottomFooterHeight = 36;

      const contentHeight = cleanedLines.length * lineHeight;
      const height = topHeaderHeight + contentHeight + bottomFooterHeight;

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 1. خلفية الفقاعة الخضراء الداكنة لواتساب (WhatsApp Dark Green Outgoing Bubble - مطابقة لأيرتيبل)
      ctx.fillStyle = '#10382b';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(0, 0, width, height, 14);
      } else {
        ctx.rect(0, 0, width, height);
      }
      ctx.fill();

      // 2. علامة الرسالة المحولة أعلى اليسار: ↪ Forwarded
      ctx.direction = 'ltr';
      ctx.textAlign = 'left';
      ctx.font = 'italic 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
      ctx.fillStyle = '#8aa296';
      ctx.fillText('↪  Forwarded', paddingX, 26);

      // 3. كتابة أسطر الرسالة (RTL)
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';

      let curY = topHeaderHeight + 20;

      cleanedLines.forEach((line) => {
        if (!line) {
          curY += lineHeight * 0.5;
          return;
        }

        const isPhone = line.includes('+') || /^\+?[\d\s\-]{8,}$/.test(line.trim());
        const isEmail = line.includes('@') && line.includes('.');
        const isBoldValue =
          line.includes('85') ||
          (data.participantName && line.includes(data.participantName)) ||
          line.includes('دينار') ||
          line.includes('مصرفية');

        if (isPhone) {
          ctx.fillStyle = '#00d287';
          ctx.font = 'bold 16.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
          ctx.fillText(line, width - paddingX, curY);
        } else if (isEmail) {
          ctx.fillStyle = '#00d287';
          ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
          ctx.fillText(line, width - paddingX, curY);

          const metrics = ctx.measureText(line);
          const emailRightX = width - paddingX;
          ctx.strokeStyle = '#00d287';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(emailRightX, curY + 3);
          ctx.lineTo(emailRightX - metrics.width, curY + 3);
          ctx.stroke();
        } else if (isBoldValue) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
          ctx.fillText(line, width - paddingX, curY);
        } else {
          ctx.fillStyle = '#e9edef';
          ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
          ctx.fillText(line, width - paddingX, curY);
        }

        curY += lineHeight;
      });

      // 4. وقت الإرسال وعلامات الصح المزدوجة أسفل اليمين
      const footerY = height - 14;
      ctx.direction = 'ltr';
      ctx.textAlign = 'right';
      ctx.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillStyle = '#8696a0';
      ctx.fillText('1:23 PM  ✓✓', width - paddingX, footerY);

      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.95));
      if (blob) return blob;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      return dataURItoBlob(dataUrl);
    } catch (e) {
      console.warn('خطأ في توليد بطاقة الحوالة (مطابقة أيرتيبل):', e);
      return null;
    }
  }

  // النافذة الجانبية الذكية العائمة: صورة الوصل مع إمكانية السحب والإفلات في أي مكان (كأنك سحبته من الديسك توب)
  async function createReceiptSideDock(data) {
    if (document.getElementById('hawalat-receipt-dock')) return;

    // 1. استخراج صورة الوصل (من Base64، أو من السيرفر المحلي، أو من الرابط الأصلي)
    let receiptBlob = null;
    let previewUrl = '';
    const cleanName = (data.participantName || 'slip').trim().replace(/\s+/g, '_');
    let fileName = `receipt_${cleanName}.jpg`;

    // تحديد إن كان هناك وصل حقيقي (صورة/ملف) متاح
    const hasRealReceipt = !!(
      (data.receiptUrl && !data.receiptUrl.startsWith('data:') && !data.receiptUrl.includes('placeholder')) ||
      (data.receiptBase64 && !data.receiptBase64.startsWith('data:image/svg'))
    );

    if (data.receiptBase64 && typeof data.receiptBase64 === 'string' && data.receiptBase64.startsWith('data:')) {
      receiptBlob = dataURItoBlob(data.receiptBase64);
      if (receiptBlob) {
        previewUrl = URL.createObjectURL(receiptBlob);
      }
    }

    if (!receiptBlob) {
      try {
        const bgRes = await new Promise((resolve) => {
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            const t = setTimeout(() => resolve(null), 1000);
            chrome.runtime.sendMessage({ type: 'fetch-receipt-raw' }, (res) => {
              clearTimeout(t);
              if (chrome.runtime.lastError) resolve(null);
              else resolve(res);
            });
          } else {
            resolve(null);
          }
        });
        if (bgRes && bgRes.ok && bgRes.dataUrl) {
          receiptBlob = dataURItoBlob(bgRes.dataUrl);
          if (receiptBlob) {
            previewUrl = URL.createObjectURL(receiptBlob);
          }
        }
      } catch (e) {}
    }

    if (!receiptBlob) {
      const realUrl = getRealReceiptUrl(data);
      if (realUrl) {
        receiptBlob = await fetchViaBackground(realUrl);
        if (receiptBlob) {
          previewUrl = URL.createObjectURL(receiptBlob);
        }
      }
    }

    // إذا لم نجد صورة وصل مرفقة من السيرفر أو من البيانات، نولد بطاقة الحوالة المطابقة تماماً لأيرتيبل
    if (!receiptBlob) {
      receiptBlob = await renderAirtableCardBlob(data);
      if (receiptBlob) {
        previewUrl = URL.createObjectURL(receiptBlob);
      }
    }

    if (!receiptBlob || !previewUrl) return;

    let portalFile = new File([receiptBlob], fileName, { type: receiptBlob.type || 'image/jpeg' });
    toPortalFile(receiptBlob, fileName).then((f) => {
      if (f) portalFile = f;
    }).catch(() => {});

    // 2. استخراج أو تجهيز سكرين شوت رسالة الواتساب للتبويب الثاني (بشكل مضمون ومكتمل)
    let messageScreenshotBlob = null;
    let messagePreviewUrl = '';
    let portalFileMessage = null;
    const msgFileName = `whatsapp_msg_${cleanName}.jpg`;

    if (data.messageCardBase64 && typeof data.messageCardBase64 === 'string' && data.messageCardBase64.startsWith('data:')) {
      messageScreenshotBlob = dataURItoBlob(data.messageCardBase64);
      if (messageScreenshotBlob) {
        messagePreviewUrl = URL.createObjectURL(messageScreenshotBlob);
        portalFileMessage = new File([messageScreenshotBlob], msgFileName, { type: 'image/jpeg' });
      }
    }

    // إذا لم يتوفر سكرين شوت رسالة مسبقاً:
    if (!messageScreenshotBlob) {
      if (!hasRealReceipt && receiptBlob) {
        // الحوالة نصية وتم توليد بطاقة الرسالة كوصل: نستخدمها مباشرة كسكرين شوت للرسالة
        messageScreenshotBlob = receiptBlob;
        messagePreviewUrl = previewUrl;
        portalFileMessage = portalFile;
      } else {
        // يوجد وصل بنكي، فنولد بطاقة رسالة الواتساب للتبويب الثاني
        messageScreenshotBlob = await renderAirtableCardBlob(data);
        if (messageScreenshotBlob) {
          messagePreviewUrl = URL.createObjectURL(messageScreenshotBlob);
          portalFileMessage = new File([messageScreenshotBlob], msgFileName, { type: 'image/jpeg' });
        }
      }
    }

    // ضمان أن يكون لكل من التبويبين صورة وملف صالح بنسبة 100%
    if (!messagePreviewUrl && previewUrl) {
      messagePreviewUrl = previewUrl;
      messageScreenshotBlob = receiptBlob;
      portalFileMessage = portalFile;
    }
    if (!previewUrl && messagePreviewUrl) {
      previewUrl = messagePreviewUrl;
      receiptBlob = messageScreenshotBlob;
      portalFile = portalFileMessage;
    }

    // 3. إنشاء حاوية النافذة الجانبية العائمة
    const dock = document.createElement('div');
    dock.id = 'hawalat-receipt-dock';
    dock.style.cssText = `
      position: fixed;
      top: 72px;
      right: 20px;
      width: 300px;
      max-height: calc(100vh - 88px);
      z-index: 9999998;
      background: #171d1a;
      border: 1px solid #35443d;
      border-radius: 14px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.38);
      color: #fafafa;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
      font-size: 13px;
      user-select: none;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      overflow-y: auto;
      scrollbar-width: thin;
    `;

    // تبويب التصغير الجانبي
    const minimizedTab = document.createElement('div');
    minimizedTab.id = 'hawalat-receipt-dock-minimized';
    minimizedTab.style.cssText = `
      position: fixed;
      top: 100px;
      right: 0;
      z-index: 9999998;
      background: #236b47;
      border: 1px solid #4b6755;
      color: white;
      padding: 10px 14px 10px 18px;
      border-radius: 16px 0 0 16px;
      box-shadow: -4px 6px 18px rgba(0,0,0,0.3);
      cursor: pointer;
      font-weight: bold;
      font-size: 12.5px;
      display: none;
      align-items: center;
      gap: 8px;
      direction: rtl;
      transition: transform 0.2s ease;
    `;
    minimizedTab.innerHTML = `
      <span>وصل: ${data.participantName ? data.participantName.split(' ')[0] : 'الحوالة'}</span>
      <span style="background: rgba(0,0,0,0.25); padding: 2px 6px; border-radius: 6px; font-size: 11px;">${data.amount || 85} JOD</span>
      <span style="font-size: 14px;">◄</span>
    `;
    document.body.appendChild(minimizedTab);

    dock.innerHTML = `
      <!-- شريط العنوان القابل للسحب والتحريك -->
      <div id="dock-header" style="
        background: linear-gradient(90deg, #161a18, #1c2420);
        padding: 10px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        cursor: grab;
      ">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="cursor: grab; color: #21c063; font-size: 16px;" title="اسحب لتحريك النافذة لأي مكان">⋮⋮</span>
          <span style="font-weight: bold; font-size: 13.5px; color: #fff;">وصل الحوالة</span>
          <span style="background: rgba(33, 192, 99, 0.15); color: #21c063; font-size: 10.5px; padding: 2px 7px; border-radius: 6px; font-weight: bold; border: 1px solid rgba(33, 192, 99, 0.3);">
            جاهز للسحب
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <button id="dock-minimize-btn" title="تصغير إلى الجانب" style="
            background: rgba(255,255,255,0.08);
            border: none;
            color: #aaa;
            width: 24px;
            height: 24px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
          ">—</button>
          <button id="dock-close-btn" title="إغلاق النافذة" style="
            background: rgba(255,255,255,0.08);
            border: none;
            color: #aaa;
            width: 24px;
            height: 24px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
          ">✕</button>
        </div>
      </div>

      <!-- ملخص بيانات الحوالة السريعة -->
      <div style="padding: 10px 14px 8px; display: flex; flex-direction: column; gap: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: bold; color: #6ee7b7; font-size: 13.5px;">${data.participantName || 'المشترك'}</span>
          <span style="font-family: monospace; font-weight: bold; color: #fde047; font-size: 13px;">${data.amount || 85} ${data.currency || 'JOD'}</span>
        </div>
        ${data.transferNumber ? `
          <div style="font-size: 11.5px; color: #a5a5a5; display: flex; justify-content: space-between;">
            <span>رقم الحوالة:</span>
            <span style="font-family: monospace; color: #e2e8f0; font-weight: bold;">${data.transferNumber}</span>
          </div>
        ` : ''}
      </div>

      <!-- شريط التبويبات للتنقل بين صورة الوصل ونص الرسالة -->
      <div id="dock-tabs" style="
        display: flex;
        background: rgba(0,0,0,0.35);
        border-bottom: 1px solid rgba(255,255,255,0.08);
        padding: 5px 8px;
        gap: 6px;
      ">
        <button id="tab-btn-receipt" style="
          flex: 1;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid #21c063;
          background: rgba(33,192,99,0.18);
          color: #6ee7b7;
          font-weight: bold;
          font-size: 11.5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: all 0.2s ease;
        ">
          صورة الوصل
        </button>
        <button id="tab-btn-message" style="
          flex: 1;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.1);
          background: transparent;
          color: #94a3b8;
          font-weight: bold;
          font-size: 11.5px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          transition: all 0.2s ease;
        ">
          سكرين الرسالة
        </button>
      </div>

      <!-- التبويب الأول: صورة الوصل مع إمكانية السحب والإفلات -->
      <div id="dock-pane-receipt" style="display: flex; flex-direction: column;">
        <div style="padding: 12px 14px 8px; display: flex; flex-direction: column; gap: 8px;">
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11.5px;
            color: #21c063;
            font-weight: bold;
          ">
            <span>اسحب الصورة وأفلتها بأي مكان:</span>
            <span style="font-size: 10.5px; color: #aaa;">(زي من الديسك توب)</span>
          </div>

          <div id="dock-drag-card" draggable="true" style="
            position: relative;
            width: 100%;
            height: 195px;
            border-radius: 12px;
            overflow: hidden;
            border: 2px dashed rgba(33, 192, 99, 0.7);
            background: #0d0f0e;
            cursor: grab;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: inset 0 0 20px rgba(0,0,0,0.6);
            transition: all 0.25s ease;
          ">
            <img id="dock-receipt-img" src="${previewUrl}" alt="وصل الحوالة" style="
              width: 100%;
              height: 100%;
              object-fit: contain;
              pointer-events: none;
            " />

            <!-- شارة السحب التفاعلية -->
            <div style="
              position: absolute;
              bottom: 8px;
              right: 8px;
              background: rgba(0, 0, 0, 0.75);
              backdrop-filter: blur(4px);
              border: 1px solid rgba(33, 192, 99, 0.5);
              color: #6ee7b7;
              padding: 4px 10px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: bold;
              display: flex;
              align-items: center;
              gap: 4px;
              pointer-events: none;
            ">
              <span>اضغط واسحب الوصل</span>
            </div>

            <!-- زر تكبير سريع للوصل -->
            <button id="dock-zoom-btn" title="تكبير الوصل وفحص التفاصيل" style="
              position: absolute;
              top: 8px;
              left: 8px;
              background: rgba(0, 0, 0, 0.75);
              border: 1px solid rgba(255, 255, 255, 0.2);
              color: #ffffff;
              width: 28px;
              height: 28px;
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 13px;
            ">عرض</button>
          </div>

          <div id="dock-drag-hint" style="
            font-size: 11px;
            color: #94a3b8;
            text-align: center;
            line-height: 1.4;
          ">
            ملاحظة: يمكنك سحب هذا المربع وإفلاته داخل نافذة رفع الوصل، أو سحبه مباشرة إلى سطح المكتب ليصبح ملفاً بجهازك!
          </div>
        </div>

        <!-- أزرار العمليات الإضافية السريعة -->
        <div style="
          padding: 10px 14px 14px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          border-top: 1px solid rgba(255,255,255,0.06);
          background: rgba(14, 16, 15, 0.6);
        ">
          <button id="dock-quick-upload-btn" style="
            grid-column: span 2;
            background: linear-gradient(135deg, #21c063, #15803d);
            color: white;
            border: none;
            padding: 9px 12px;
            border-radius: 10px;
            font-weight: bold;
            font-size: 12.5px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            box-shadow: 0 4px 12px rgba(33, 192, 99, 0.35);
            transition: transform 0.15s ease;
          ">
            إفلات ورفع تلقائي في النموذج
          </button>

          <button id="dock-download-btn" style="
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            color: #f1f5f9;
            padding: 7px 10px;
            border-radius: 8px;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
          ">
            حفظ لسطح المكتب
          </button>

          <button id="dock-copy-btn" style="
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            color: #f1f5f9;
            padding: 7px 10px;
            border-radius: 8px;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
          ">
            نسخ الصورة
          </button>
        </div>
      </div>

      <!-- التبويب الثاني: سكرين شوت رسالة الواتساب كصورة حقيقية قابلة للسحب والإفلات -->
      <div id="dock-pane-message" style="display: none; flex-direction: column;">
        <div style="padding: 12px 14px 8px; display: flex; flex-direction: column; gap: 8px;">
          <div style="
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11.5px;
            color: #38bdf8;
            font-weight: bold;
          ">
            <span>اسحب سكرين شوت الرسالة لأي مكان:</span>
            <span style="font-size: 10.5px; color: #aaa;">(زي ملف من الديسك توب)</span>
          </div>

          <div id="dock-drag-card-msg" draggable="true" style="
            position: relative;
            width: 100%;
            height: 195px;
            border-radius: 12px;
            overflow: hidden;
            border: 2px dashed rgba(56, 189, 248, 0.7);
            background: #0b141a;
            cursor: grab;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: inset 0 0 20px rgba(0,0,0,0.6);
            transition: all 0.25s ease;
          ">
            <img id="dock-msg-img" src="${messagePreviewUrl}" alt="سكرين شوت رسالة الواتساب" style="
              width: 100%;
              height: 100%;
              object-fit: contain;
              pointer-events: none;
            " onerror="this.style.opacity='0'" onload="this.style.opacity='1'" />

            <!-- شارة السحب التفاعلية -->
            <div style="
              position: absolute;
              bottom: 8px;
              right: 8px;
              background: rgba(0, 0, 0, 0.8);
              backdrop-filter: blur(4px);
              border: 1px solid rgba(56, 189, 248, 0.5);
              color: #7dd3fc;
              padding: 4px 10px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: bold;
              display: flex;
              align-items: center;
              gap: 4px;
              pointer-events: none;
            ">
              <span>اضغط واسحب سكرين شوت الرسالة</span>
            </div>

            <!-- زر تكبير سريع للسكرين شوت -->
            <button id="dock-zoom-msg-btn" title="تكبير سكرين شوت الرسالة وفحص التفاصيل" style="
              position: absolute;
              top: 8px;
              left: 8px;
              background: rgba(0, 0, 0, 0.75);
              border: 1px solid rgba(255, 255, 255, 0.2);
              color: #ffffff;
              width: 28px;
              height: 28px;
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 13px;
            ">عرض</button>
          </div>

          <div id="dock-drag-msg-hint" style="
            font-size: 11px;
            color: #94a3b8;
            text-align: center;
            line-height: 1.4;
          ">
            ملاحظة: يمكنك سحب سكرين شوت الرسالة وإفلاته في نافذة رفع الوصل، أو سحبه لسطح المكتب كصورة!
          </div>
        </div>

        <!-- أزرار العمليات لسكرين شوت الرسالة -->
        <div style="
          padding: 10px 14px 14px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          border-top: 1px solid rgba(255,255,255,0.06);
          background: rgba(14, 16, 15, 0.6);
        ">
          <button id="dock-quick-upload-msg-btn" style="
            grid-column: span 2;
            background: linear-gradient(135deg, #0284c7, #0369a1);
            color: white;
            border: none;
            padding: 9px 12px;
            border-radius: 10px;
            font-weight: bold;
            font-size: 12.5px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);
            transition: transform 0.15s ease;
          ">
            إفلات ورفع السكرين شوت في النموذج
          </button>

          <button id="dock-download-msg-btn" style="
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            color: #f1f5f9;
            padding: 7px 10px;
            border-radius: 8px;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
          ">
            حفظ لسطح المكتب
          </button>

          <button id="dock-copy-msg-img-btn" style="
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.15);
            color: #f1f5f9;
            padding: 7px 10px;
            border-radius: 8px;
            font-size: 11.5px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
          ">
            نسخ السكرين شوت
          </button>

          <button id="dock-copy-text-btn" style="
            grid-column: span 2;
            background: rgba(255,255,255,0.04);
            border: 1px dashed rgba(255,255,255,0.18);
            color: #cbd5e1;
            padding: 6px 10px;
            border-radius: 8px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
          ">
            نسخ النص الكتابي للرسالة
          </button>
        </div>

        <!-- أزرار النسخ السريعة للحقول الأساسية -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 0 14px 14px;">
          ${data.participantName ? `
            <button class="dock-quick-copy-item" data-val="${String(data.participantName).replace(/"/g, '&quot;')}" style="
              background: rgba(255,255,255,0.05);
              border: 1px solid rgba(255,255,255,0.1);
              color: #cbd5e1;
              padding: 6px 8px;
              border-radius: 8px;
              font-size: 11px;
              cursor: pointer;
              font-weight: 600;
              transition: all 0.2s;
            ">
              نسخ الاسم
            </button>
          ` : ''}
          ${data.phone ? `
            <button class="dock-quick-copy-item" data-val="${String(data.phone).replace(/"/g, '&quot;')}" style="
              background: rgba(255,255,255,0.05);
              border: 1px solid rgba(255,255,255,0.1);
              color: #cbd5e1;
              padding: 6px 8px;
              border-radius: 8px;
              font-size: 11px;
              cursor: pointer;
              font-weight: 600;
              transition: all 0.2s;
            ">
              نسخ الجوال
            </button>
          ` : ''}
          ${data.transferNumber ? `
            <button class="dock-quick-copy-item" data-val="${String(data.transferNumber).replace(/"/g, '&quot;')}" style="
              background: rgba(255,255,255,0.05);
              border: 1px solid rgba(255,255,255,0.1);
              color: #cbd5e1;
              padding: 6px 8px;
              border-radius: 8px;
              font-size: 11px;
              cursor: pointer;
              font-weight: 600;
              transition: all 0.2s;
            ">
              رقم الحوالة
            </button>
          ` : ''}
          ${data.notes ? `
            <button class="dock-quick-copy-item" data-val="${String(data.notes).replace(/"/g, '&quot;')}" style="
              background: rgba(255,255,255,0.05);
              border: 1px solid rgba(255,255,255,0.1);
              color: #cbd5e1;
              padding: 6px 8px;
              border-radius: 8px;
              font-size: 11px;
              cursor: pointer;
              font-weight: 600;
              transition: all 0.2s;
            ">
              نسخ الملاحظات
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // واجهة هادئة: الإرفاق والسحب ظاهران دائماً، وباقي أدوات النسخ والحفظ داخل قائمة واحدة.
    const styleDock = (selector, styles) => {
      const element = dock.querySelector(selector);
      if (element) Object.assign(element.style, styles);
      return element;
    };
    const dockHeader = styleDock('#dock-header', {
      background: '#1b2420', padding: '10px 12px', borderBottom: '1px solid #303e36'
    });
    const title = [...dockHeader.querySelectorAll('span')].find((span) => span.textContent.trim() === 'وصل الحوالة');
    if (title) {
      title.textContent = 'مساعد الحوالة';
      Object.assign(title.style, { fontSize: '13px', fontWeight: '600' });
    }
    [...dockHeader.querySelectorAll('span')].find((span) => span.textContent.trim() === 'جاهز للسحب')?.remove();
    dockHeader.querySelectorAll('button').forEach((button) => {
      Object.assign(button.style, {
        background: '#26322b', color: '#b8c7bd', width: '26px', height: '26px', borderRadius: '7px'
      });
    });

    const summary = dockHeader.nextElementSibling;
    Object.assign(summary.style, {
      padding: '12px', gap: '5px', background: '#171d1a', borderBottom: '1px solid #303e36'
    });
    const summaryName = summary.querySelector('span');
    if (summaryName) Object.assign(summaryName.style, { color: '#f1f5f2', fontSize: '13px' });
    const amount = summary.querySelectorAll('span')[1];
    if (amount) Object.assign(amount.style, { color: '#b8ddc4', fontSize: '12px' });

    styleDock('#dock-tabs', {
      background: '#171d1a', padding: '8px 12px 0', gap: '5px', borderBottom: '1px solid #303e36'
    });
    ['#tab-btn-receipt', '#tab-btn-message'].forEach((selector) => styleDock(selector, {
      padding: '7px 8px', borderRadius: '8px 8px 0 0', fontSize: '11px',
      boxShadow: 'none', transition: 'none'
    }));

    for (const [paneId, cardId, hintId, zoomId, label] of [
      ['#dock-pane-receipt', '#dock-drag-card', '#dock-drag-hint', '#dock-zoom-btn', 'اسحب الوصل إلى خانة الرفع'],
      ['#dock-pane-message', '#dock-drag-card-msg', '#dock-drag-msg-hint', '#dock-zoom-msg-btn', 'اسحب سكرين شوت الرسالة إلى خانة الرفع'],
    ]) {
      const pane = dock.querySelector(paneId);
      const preview = pane.firstElementChild;
      Object.assign(preview.style, { padding: '12px 12px 4px', gap: '7px' });
      const intro = preview.firstElementChild;
      intro.firstElementChild.textContent = label;
      intro.lastElementChild.remove();
      Object.assign(intro.style, { color: '#aebfb3', fontSize: '10.5px', fontWeight: '500' });
      const card = styleDock(cardId, {
        height: '170px', border: '1px solid #3b4a40', borderRadius: '10px',
        background: '#101713', boxShadow: 'none', transition: 'none'
      });
      const dragLabel = card.querySelector('div');
      if (dragLabel) {
        dragLabel.textContent = 'اسحب الصورة';
        Object.assign(dragLabel.style, {
          background: 'rgba(19, 30, 23, .9)', border: '1px solid #4b6552',
          color: '#d8e9dc', fontSize: '10px', fontWeight: '500', padding: '4px 8px'
        });
      }
      styleDock(hintId, { display: 'none' });
      const zoom = styleDock(zoomId, {
        width: '36px', height: '26px', background: 'rgba(24, 32, 27, .9)',
        border: '1px solid #4b5a50', fontSize: '10px'
      });
      if (zoom) zoom.textContent = 'تكبير';
    }

    const foldActions = (paneSelector, uploadSelector, secondarySelectors) => {
      const pane = dock.querySelector(paneSelector);
      const upload = pane.querySelector(uploadSelector);
      const actions = upload.parentElement;
      Object.assign(actions.style, {
        display: 'flex', flexDirection: 'column', gap: '7px', padding: '10px 12px 12px',
        borderTop: 'none', background: 'transparent'
      });
      Object.assign(upload.style, {
        width: '100%', minHeight: '36px', background: '#236b47', boxShadow: 'none',
        padding: '8px 10px', borderRadius: '8px', fontSize: '11.5px', fontWeight: '600'
      });

      const more = document.createElement('details');
      more.style.cssText = 'width:100%; border:1px solid #34443a; border-radius:8px; background:#1d2720;';
      const toggle = document.createElement('summary');
      toggle.textContent = 'خيارات إضافية';
      toggle.style.cssText = 'display:flex; align-items:center; justify-content:center; min-height:30px; cursor:pointer; list-style:none; color:#aebfb3; font-size:10.5px; font-weight:600;';
      const tools = document.createElement('div');
      tools.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; padding:0 8px 8px;';
      for (const selector of secondarySelectors) {
        const button = pane.querySelector(selector);
        if (button) tools.appendChild(button);
      }
      const quickCopyContainer = pane.querySelector('.dock-quick-copy-item')?.parentElement;
      if (quickCopyContainer) {
        [...quickCopyContainer.querySelectorAll('.dock-quick-copy-item')].forEach((button) => tools.appendChild(button));
        quickCopyContainer.remove();
      }
      tools.querySelectorAll('button').forEach((button) => Object.assign(button.style, {
        minHeight: '30px', padding: '5px 6px', background: '#26332b',
        border: '1px solid #3a4b3f', borderRadius: '7px', color: '#d0ded3',
        fontSize: '10px', fontWeight: '500', boxShadow: 'none', gridColumn: 'auto'
      }));
      more.append(toggle, tools);
      actions.appendChild(more);
    };
    foldActions('#dock-pane-receipt', '#dock-quick-upload-btn', ['#dock-download-btn', '#dock-copy-btn']);
    foldActions('#dock-pane-message', '#dock-quick-upload-msg-btn', [
      '#dock-download-msg-btn', '#dock-copy-msg-img-btn', '#dock-copy-text-btn'
    ]);
    dock.querySelector('#dock-quick-upload-btn').textContent = 'إرفاق الوصل في النموذج';
    dock.querySelector('#dock-quick-upload-msg-btn').textContent = 'إرفاق سكرين شوت الرسالة';

    document.body.appendChild(dock);

    // 3. دعم تحريك النافذة بالماوس (Draggable Window Header)
    const header = dock.querySelector('#dock-header');
    let isDraggingWindow = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDraggingWindow = true;
      header.style.cursor = 'grabbing';
      const rect = dock.getBoundingClientRect();
      dock.style.right = 'auto';
      dock.style.left = `${rect.left}px`;
      dock.style.top = `${rect.top}px`;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = rect.left;
      initialTop = rect.top;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingWindow) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      dock.style.left = `${Math.max(10, Math.min(window.innerWidth - dock.offsetWidth - 10, initialLeft + dx))}px`;
      dock.style.top = `${Math.max(10, Math.min(window.innerHeight - dock.offsetHeight - 10, initialTop + dy))}px`;
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingWindow) {
        isDraggingWindow = false;
        header.style.cursor = 'grab';
      }
    });

    // 4. السحب والإفلات للصورة الحقيقية (HTML5 Drag & Drop File Transfer)
    const dragCard = dock.querySelector('#dock-drag-card');
    dragCard.addEventListener('dragstart', (e) => {
      dragCard.style.opacity = '0.5';
      dragCard.style.borderColor = '#38bdf8';
      e.dataTransfer.effectAllowed = 'all';

      // إضافة الملف ككائن File حقيقي في DataTransfer (يفهمه أي Input File أو Drop Zone)
      if (portalFile) {
        try {
          e.dataTransfer.items.add(portalFile);
        } catch (err) {}
      }

      // دعم خاصية سحب الصورة لسطح المكتب في متصفح كروم (DownloadURL)
      try {
        e.dataTransfer.setData('DownloadURL', `${portalFile.type}:${portalFile.name}:${previewUrl}`);
      } catch (err) {}

      e.dataTransfer.setData('text/plain', portalFile ? portalFile.name : fileName);
      e.dataTransfer.setData('text/uri-list', previewUrl);
    });

    dragCard.addEventListener('dragend', () => {
      dragCard.style.opacity = '1';
      dragCard.style.borderColor = '#3b4a40';
    });

    // 5. التصغير والإغلاق
    const minBtn = dock.querySelector('#dock-minimize-btn');
    const closeBtn = dock.querySelector('#dock-close-btn');

    minBtn.addEventListener('click', () => {
      dock.style.display = 'none';
      minimizedTab.style.display = 'flex';
    });

    minimizedTab.addEventListener('click', () => {
      dock.style.display = 'flex';
      minimizedTab.style.display = 'none';
    });

    closeBtn.addEventListener('click', () => {
      dock.remove();
      minimizedTab.remove();
    });

    // 6. زر التنزيل لسطح المكتب
    dock.querySelector('#dock-download-btn')?.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = previewUrl;
      a.download = portalFile ? portalFile.name : fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    // 7. زر نسخ الصورة إلى الحافظة (Clipboard)
    dock.querySelector('#dock-copy-btn')?.addEventListener('click', async () => {
      const btn = dock.querySelector('#dock-copy-btn');
      try {
        if (!navigator.clipboard || !window.ClipboardItem) {
          throw new Error('ClipboardItem not supported');
        }
        let pngBlob = receiptBlob;
        if (receiptBlob.type !== 'image/png') {
          const bmp = await createImageBitmap(receiptBlob);
          const canvas = document.createElement('canvas');
          canvas.width = bmp.width;
          canvas.height = bmp.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bmp, 0, 0);
          pngBlob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        }
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob }),
        ]);
        if (btn) btn.innerHTML = 'تم النسخ!';
        setTimeout(() => { if (btn) btn.innerHTML = 'نسخ الصورة'; }, 2000);
      } catch (err) {
        if (btn) btn.innerHTML = 'تعذر النسخ';
        setTimeout(() => { if (btn) btn.innerHTML = 'نسخ الصورة'; }, 2000);
      }
    });

    // 8. زر الرفع التلقائي السريع
    dock.querySelector('#dock-quick-upload-btn')?.addEventListener('click', async () => {
      const btn = dock.querySelector('#dock-quick-upload-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'جاري الإرفاق بالبوابة...';
      }
      const ok = await uploadReceiptViaPortalWidget(data);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = ok ? 'تم إرفاق الوصل بنجاح' : 'إعادة محاولة الرفع';
      }
    });

    // 9. زر تكبير الصورة (LightBox)
    dock.querySelector('#dock-zoom-btn')?.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999999;
        background: rgba(0,0,0,0.88);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: zoom-out;
      `;
      overlay.innerHTML = `
        <div style="position: relative; max-width: 90vw; max-height: 90vh;">
          <img src="${previewUrl}" style="max-width: 100%; max-height: 90vh; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); border: 1px solid rgba(255,255,255,0.2);" />
          <button style="position: absolute; top: -14px; right: -14px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; font-weight: bold; cursor: pointer; font-size: 16px;">✕</button>
        </div>
      `;
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    });

    // 10. مستمع الإفلات الذكي على حقول البوابة
    // 10. دعم سحب سكرين شوت الرسالة (HTML5 Drag & Drop File Transfer)
    const dragCardMsg = dock.querySelector('#dock-drag-card-msg');
    if (dragCardMsg && portalFileMessage) {
      dragCardMsg.addEventListener('dragstart', (e) => {
        dragCardMsg.style.opacity = '0.5';
        dragCardMsg.style.borderColor = '#38bdf8';
        e.dataTransfer.effectAllowed = 'all';

        try {
          e.dataTransfer.items.add(portalFileMessage);
        } catch (err) {}

        try {
          e.dataTransfer.setData('DownloadURL', `${portalFileMessage.type}:${portalFileMessage.name}:${messagePreviewUrl}`);
        } catch (err) {}

        e.dataTransfer.setData('text/plain', portalFileMessage.name);
        e.dataTransfer.setData('text/uri-list', messagePreviewUrl);
      });

      dragCardMsg.addEventListener('dragend', () => {
        dragCardMsg.style.opacity = '1';
        dragCardMsg.style.borderColor = '#3b4a40';
      });
    }

    // 11. أزرار عمليات سكرين شوت الرسالة
    dock.querySelector('#dock-quick-upload-msg-btn')?.addEventListener('click', async () => {
      const btn = dock.querySelector('#dock-quick-upload-msg-btn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = 'جاري إرفاق السكرين شوت بالبوابة...';
      }
      const ok = await uploadReceiptViaPortalWidget(data, portalFileMessage);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = ok ? 'تم إرفاق السكرين شوت بنجاح' : 'إعادة محاولة الرفع';
      }
    });

    dock.querySelector('#dock-download-msg-btn')?.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = messagePreviewUrl;
      a.download = portalFileMessage ? portalFileMessage.name : `whatsapp_msg_${cleanName}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    dock.querySelector('#dock-copy-msg-img-btn')?.addEventListener('click', async () => {
      const btn = dock.querySelector('#dock-copy-msg-img-btn');
      try {
        if (!navigator.clipboard || !window.ClipboardItem) {
          throw new Error('ClipboardItem not supported');
        }
        let pngBlob = messageScreenshotBlob;
        if (messageScreenshotBlob.type !== 'image/png') {
          const bmp = await createImageBitmap(messageScreenshotBlob);
          const canvas = document.createElement('canvas');
          canvas.width = bmp.width;
          canvas.height = bmp.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bmp, 0, 0);
          pngBlob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        }
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': pngBlob }),
        ]);
        if (btn) btn.innerHTML = 'تم النسخ!';
        setTimeout(() => { if (btn) btn.innerHTML = 'نسخ السكرين شوت'; }, 2000);
      } catch (err) {
        if (btn) btn.innerHTML = 'تعذر النسخ';
        setTimeout(() => { if (btn) btn.innerHTML = 'نسخ السكرين شوت'; }, 2000);
      }
    });

    dock.querySelector('#dock-zoom-msg-btn')?.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 99999999;
        background: rgba(0,0,0,0.88);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: zoom-out;
      `;
      overlay.innerHTML = `
        <div style="position: relative; max-width: 90vw; max-height: 90vh;">
          <img src="${messagePreviewUrl}" style="max-width: 100%; max-height: 90vh; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); border: 1px solid rgba(255,255,255,0.2);" />
          <button style="position: absolute; top: -14px; right: -14px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 32px; height: 32px; font-weight: bold; cursor: pointer; font-size: 16px;">✕</button>
        </div>
      `;
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    });

    dock.querySelector('#dock-copy-text-btn')?.addEventListener('click', () => {
      const btn = dock.querySelector('#dock-copy-text-btn');
      const textToCopy = (data.rawText || data.messageText || '').trim() || [
        `الاسم: ${data.participantName || '-'}`,
        `المبلغ: ${data.amount || 85} ${data.currency || 'JOD'}`,
        data.transferNumber ? `رقم الحوالة: ${data.transferNumber}` : '',
        data.phone ? `الجوال: ${data.phone}` : '',
        data.paymentDate ? `تاريخ السداد: ${data.paymentDate}` : '',
        data.notes ? `الملاحظات: ${data.notes}` : '',
        data.senderName ? `المرسل: ${data.senderName}` : '',
      ].filter(Boolean).join('\n');
      navigator.clipboard.writeText(textToCopy);
      if (btn) btn.innerHTML = 'تم نسخ النص!';
      setTimeout(() => { if (btn) btn.innerHTML = 'نسخ النص الكتابي للرسالة'; }, 2000);
    });

    // 12. مستمع الإفلات الذكي على حقول البوابة
    function setupDropTarget() {
      const dropTargets = document.querySelectorAll(
        '#um_upload_single, .um-single-file-upload, a[data-modal="um_upload_single"], .um-modal-body'
      );
      dropTargets.forEach((target) => {
        target.addEventListener('dragover', (e) => {
          e.preventDefault();
          target.style.outline = '3px dashed #21c063';
        });
        target.addEventListener('dragleave', () => {
          target.style.outline = '';
        });
        target.addEventListener('drop', async (e) => {
          e.preventDefault();
          target.style.outline = '';
          const isMsgTab = paneMessage && paneMessage.style.display !== 'none';
          uploadReceiptViaPortalWidget(data, isMsgTab ? portalFileMessage : portalFile);
        });
      });
    }

    // 13. تبديل التبويبات بين صورة الوصل وسكرين شوت الرسالة
    const tabReceipt = dock.querySelector('#tab-btn-receipt');
    const tabMessage = dock.querySelector('#tab-btn-message');
    const paneReceipt = dock.querySelector('#dock-pane-receipt');
    const paneMessage = dock.querySelector('#dock-pane-message');

    function switchDockTab(tab) {
      if (tab === 'receipt') {
        tabReceipt.style.borderColor = '#4b6755';
        tabReceipt.style.background = '#263b2e';
        tabReceipt.style.color = '#d8e9dc';
        tabMessage.style.borderColor = '#303e36';
        tabMessage.style.background = 'transparent';
        tabMessage.style.color = '#9aaca0';
        tabReceipt.setAttribute('aria-selected', 'true');
        tabMessage.setAttribute('aria-selected', 'false');
        paneReceipt.style.display = 'flex';
        paneMessage.style.display = 'none';
      } else {
        tabMessage.style.borderColor = '#4b6755';
        tabMessage.style.background = '#263b2e';
        tabMessage.style.color = '#d8e9dc';
        tabReceipt.style.borderColor = '#303e36';
        tabReceipt.style.background = 'transparent';
        tabReceipt.style.color = '#9aaca0';
        tabReceipt.setAttribute('aria-selected', 'false');
        tabMessage.setAttribute('aria-selected', 'true');
        paneReceipt.style.display = 'none';
        paneMessage.style.display = 'flex';
      }
    }

    tabReceipt?.addEventListener('click', () => switchDockTab('receipt'));
    tabMessage?.addEventListener('click', () => switchDockTab('message'));

    // 14. أزرار النسخ السريعة للحقول
    dock.querySelectorAll('.dock-quick-copy-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-val');
        if (val) {
          navigator.clipboard.writeText(val);
          const orig = btn.innerHTML;
          btn.innerHTML = 'تم النسخ';
          setTimeout(() => { btn.innerHTML = orig; }, 1500);
        }
      });
    });

    // في الحوالة النصية نبدأ بالرسالة؛ في غيرها نبدأ بصورة الوصل.
    switchDockTab(hasRealReceipt ? 'receipt' : 'message');

    setTimeout(setupDropTarget, 1000);
  }

  function setInputValue(selector, value) {
    if (value === undefined || value === null) return;
    const el = document.querySelector(selector);
    if (!el) return;

    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.style.backgroundColor = '#ecfdf5';
    el.style.borderColor = '#10b981';
  }

  function setSelectValue(selector, value) {
    if (!value) return;
    const el = document.querySelector(selector);
    if (!el) return;

    const cleanVal = String(value).trim();
    let matchedVal = '';
    for (let i = 0; i < el.options.length; i++) {
      const opt = el.options[i];
      if (opt.value === cleanVal || opt.text.trim() === cleanVal || opt.text.includes(cleanVal)) {
        el.selectedIndex = i;
        opt.selected = true;
        el.value = opt.value;
        matchedVal = opt.value;
        break;
      }
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    // إرسال حدث آمن للـ page-bridge في سياق الصفحة لتحديث Select2 و jQuery بدون مخالفة CSP
    if (matchedVal) {
      document.dispatchEvent(new CustomEvent('hawalat:set-select', { detail: { selector, value: matchedVal } }));
    }

    el.style.backgroundColor = '#ecfdf5';
    el.style.borderColor = '#10b981';
  }

  function setRadioValue(name, value) {
    if (!value) return;
    const cleanVal = String(value).trim();
    const radios = document.querySelectorAll(`input[name="${name}"]`);
    radios.forEach(r => {
      const match = r.value.trim() === cleanVal || cleanVal.includes(r.value.trim());
      if (match) {
        r.checked = true;
        const icon = r.closest('label')?.querySelector('.um-field-radio-state i');
        if (icon) {
          icon.className = 'um-icon-android-radio-button-on';
        }
        r.dispatchEvent(new Event('input', { bubbles: true }));
        r.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const otherIcon = r.closest('label')?.querySelector('.um-field-radio-state i');
        if (otherIcon) {
          otherIcon.className = 'um-icon-android-radio-button-off';
        }
      }
    });

    document.dispatchEvent(new CustomEvent('hawalat:set-radio', { detail: { name, value: cleanVal } }));
  }

  function checkCheckbox(name) {
    const boxes = document.querySelectorAll(`input[name="${name}"]`);
    boxes.forEach(b => {
      b.checked = true;
      const icon = b.closest('label')?.querySelector('.um-field-radio-state i, .um-field-checkbox-state i');
      if (icon) {
        icon.className = icon.className.includes('radio') ? 'um-icon-android-radio-button-on' : 'um-icon-android-checkbox-outline';
      }
      b.dispatchEvent(new Event('input', { bubbles: true }));
      b.dispatchEvent(new Event('change', { bubbles: true }));
    });

    document.dispatchEvent(new CustomEvent('hawalat:check-box', { detail: { name } }));
  }

  function setStatus(html) {
    const statusText = document.getElementById('autofill-status-text');
    if (statusText) statusText.innerHTML = html;
  }

  // انتظار تحقق شرط معين (مع مهلة زمنية)
  function waitFor(check, timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function poll() {
        const result = check();
        if (result) return resolve(result);
        if (Date.now() - start > timeoutMs) return resolve(null);
        setTimeout(poll, 200);
      })();
    });
  }

  // 12. تاريخ السداد: يجب ضبطه عبر مكتبة التقويم (pickadate) نفسها
  // لأن الحقل الظاهر بدون اسم، والحقل المخفي الذي يُرسل للسيرفر صيغته yyyy/mm/dd
  function setPaymentDate(rawDate) {
    const today = new Date();
    let y = today.getFullYear();
    let m = today.getMonth() + 1;
    let d = today.getDate();

    const raw = String(rawDate || '').trim();
    const iso = raw.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    const dmy = raw.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
    if (iso) {
      y = +iso[1]; m = +iso[2]; d = +iso[3];
    } else if (dmy) {
      y = +dmy[3]; m = +dmy[2]; d = +dmy[1];
    }

    const submitValue = `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;

    // إرسال التاريخ إلى page-bridge.js (يعمل داخل سياق الصفحة ويضبط التقويم)
    document.documentElement.setAttribute('data-hawalat-date', submitValue);
    document.dispatchEvent(new CustomEvent('hawalat:set-date', { detail: submitValue }));

    // التحقق من ضبط التاريخ، مع بديل مباشر إذا لم يستجب التقويم
    waitFor(() => getDateHiddenInput()?.value, 5000).then((ok) => {
      const visible = document.getElementById('payment_date-37303');
      if (!ok) {
        const hidden = getDateHiddenInput();
        if (hidden) {
          const arMonths = ['يناير', 'فبراير', 'مارس', 'ابريل', 'مايو', 'يونيو', 'يوليو', 'اغسطس', 'سبتمبر', 'اكتوبر', 'نوفمبر', 'ديسمبر'];
          hidden.value = submitValue;
          if (visible) visible.value = `${d} ${arMonths[m - 1]} ${y}`;
          ok = true;
          console.warn('تم ضبط التاريخ بالطريقة البديلة:', submitValue);
        }
      }

      if (visible) {
        visible.style.backgroundColor = ok ? '#ecfdf5' : '#fef2f2';
        visible.style.borderColor = ok ? '#10b981' : '#ef4444';
      }
      const dateStatus = document.getElementById('autofill-date-status');
      if (dateStatus && !ok) {
        dateStatus.style.display = 'block';
        dateStatus.textContent = 'تنبيه: لم يتم ضبط تاريخ السداد تلقائياً، اختره يدوياً من التقويم.';
      }
    });
  }

  function getDateHiddenInput() {
    return document.querySelector('input[type="hidden"][name="payment_date-37303"]');
  }

  // تحويل Data URL إلى كائن Blob
  function dataURItoBlob(dataURI) {
    try {
      const byteString = atob(dataURI.split(',')[1]);
      const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeString });
    } catch (e) {
      console.warn('خطأ في تحويل Data URL:', e);
      return null;
    }
  }

  // جلب الصورة عبر خلفية الإضافة (لا تخضع لقيود CORS عند الجلب من السيرفر المحلي)
  function fetchViaBackground(url) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'fetch-image', url }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) {
            console.warn('تعذر جلب الصورة عبر الخلفية:', chrome.runtime.lastError || res?.error);
            return resolve(null);
          }
          resolve(dataURItoBlob(res.dataUrl));
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // رابط صورة الوصل الحقيقية (رابط كامل أو مسار على سيرفر الحوالات)
  // ويُرجع فارغاً لبطاقة البيانات المولَّدة تلقائياً (data:...) لأن التسجيل بها لا ينجح
  function getRealReceiptUrl(data) {
    const src = String(data.receiptUrl || '').trim();
    if (!src || src.startsWith('data:')) return '';
    if (/^https?:\/\//.test(src)) return src;
    return `http://localhost:3010${src.startsWith('/') ? '' : '/'}${src}`;
  }

  // تجهيز ملف الوصل للبوابة:
  // - jpg / png / pdf: يُرفع الملف الأصلي كما هو تماماً (نفس البايتات ونفس الاسم) كأنه اختير من الجهاز
  // - غير ذلك (مثل webp من واتساب): يُحوّل إلى JPEG لأن البوابة تقبل pdf, jpg, png فقط
  async function toPortalFile(blob, originalName) {
    const stamp = Date.now();
    const baseName = (originalName || '').split('/').pop().split('?')[0];
    if (blob.type === 'application/pdf') {
      return new File([blob], baseName && /\.pdf$/i.test(baseName) ? baseName : `receipt_${stamp}.pdf`, { type: 'application/pdf' });
    }
    if (blob.type === 'image/jpeg' || blob.type === 'image/png') {
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      const name = baseName && /\.(jpe?g|png)$/i.test(baseName) ? baseName : `receipt_${stamp}.${ext}`;
      return new File([blob], name, { type: blob.type });
    }
    try {
      const bmp = await createImageBitmap(blob);
      const MAX = 2000;
      const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
      if (jpeg) return new File([jpeg], `receipt_${stamp}.jpg`, { type: 'image/jpeg' });
    } catch (e) {
      console.warn('تعذر تحويل الصورة إلى JPEG:', e);
    }
    return null;
  }

  function getReceiptHiddenInput() {
    return document.querySelector('input[type="hidden"][name="payment-slip1-37303"]');
  }

  // 17. رفع الوصل أو سكرين شوت الرسالة عبر نافذة الرفع الأصلية في البوابة (بنفس خطوات الرفع اليدوي تماماً)
  async function uploadReceiptViaPortalWidget(data, fileOverride) {
    const manualHint = '<span style="color:#fca5a5;">اضغط زر (ارفع صورة إيصال الدفع) وارفع الملف يدوياً.</span>';

    let file = fileOverride || null;

    if (!file) {
      // نرفع فقط صورة وصل حقيقية (من رسالة واتساب أو وصل مشبوك)
      // أما بطاقة البيانات المولَّدة تلقائياً (data:...) للحوالات بدون وصل فلا نرفعها: التسجيل بها لا ينجح
      const realReceiptUrl = getRealReceiptUrl(data);
      if (!realReceiptUrl) {
        setStatus('تم ملء الحقول. <span style="color:#fde047;">لا يوجد وصل لهذه الحوالة: ارفع الصورة يدوياً ثم اضغط تسجيل.</span>');
        return false;
      }

      setStatus('جاري إرفاق صورة الوصل...');

      const blob = await fetchViaBackground(realReceiptUrl);
      if (!blob) {
        setStatus('تنبيه: لم يتم العثور على صورة الوصل. ' + manualHint);
        return false;
      }

      file = await toPortalFile(blob, realReceiptUrl);
      if (!file) {
        setStatus('تنبيه: صيغة صورة الوصل غير مدعومة. ' + manualHint);
        return false;
      }
    } else {
      setStatus('جاري إرفاق سكرين شوت الرسالة بالبوابة...');
    }

    const uploadBtn = document.querySelector('a[data-modal="um_upload_single"]');
    if (!uploadBtn) {
      setStatus('تنبيه: لم يتم العثور على زر رفع الوصل. ' + manualHint);
      return false;
    }
    uploadBtn.click();

    const input = await waitFor(
      () => document.querySelector('#um_upload_single input[type="file"][name="payment-slip1"]'),
      8000
    );
    const modal = input?.closest('.um-modal') || document.getElementById('um_upload_single');
    if (!input || !modal) {
      setStatus('تنبيه: لم تفتح نافذة الرفع. ' + manualHint);
      return false;
    }

    // وضع الملف في حقل الرفع الأصلي كأن المستخدم اختاره بنفسه
    document.documentElement.removeAttribute('data-hawalat-upload');
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // رد السيرفر كما سجله page-bridge.js
    const readServerReply = () => {
      try {
        return JSON.parse(document.documentElement.getAttribute('data-hawalat-upload') || 'null');
      } catch (e) {
        return null;
      }
    };

    let replyAt = 0;
    const outcome = await waitFor(() => {
      if (modal.querySelector('.um-error-block')) return 'error';
      if (modal.querySelector('.um-finish-upload.file:not(.disabled)')) return 'ok';
      // وصل رد من السيرفر لكن النافذة لم تتفعل خلال ثانيتين = رد غير متوقع
      if (readServerReply()) {
        replyAt = replyAt || Date.now();
        if (Date.now() - replyAt > 2000) return 'bad-reply';
      }
      return null;
    }, 30000);

    if (outcome !== 'ok') {
      const err = modal.querySelector('.um-error-block')?.textContent?.trim();
      const reply = readServerReply();
      let detail = err || '';
      if (!detail && reply) {
        let serverMsg = '';
        try {
          const json = JSON.parse(reply.text);
          serverMsg = json?.data?.error || '';
        } catch (e) { }
        if (!serverMsg) serverMsg = String(reply.text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
        detail = `رد السيرفر ${reply.status}: ${serverMsg || 'رد فارغ'}`;
      }
      if (!detail) detail = 'لم يرد سيرفر البوابة خلال 30 ثانية';
      detail = detail.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      console.warn('فشل رفع الوصل:', { outcome, err, reply });
      document.dispatchEvent(new CustomEvent('hawalat:close-modal'));
      setStatus('تنبيه: فشل رفع الوصل (' + detail + '). ' + manualHint);
      return false;
    }

    // الضغط على زر (حفظ) في نافذة الرفع
    modal.querySelector('.um-finish-upload.file').click();

    const saved = await waitFor(() => getReceiptHiddenInput()?.value, 5000);
    if (!saved) {
      setStatus('تنبيه: تم رفع الصورة لكن لم تُحفظ في النموذج. ' + manualHint);
      return false;
    }

    console.log('تم إرفاق الملف:', saved);
    setStatus('<strong style="color: #6ee7b7;">تمت تعبئة كافة الحقول وإرفاق ' + (fileOverride ? 'سكرين شوت الرسالة' : 'الوصل') + '!</strong> راجع واضغط زر تسجيل.');
    return true;
  }

  // حماية: تنبيه قبل التسجيل إذا لم يتم إرفاق صورة الوصل أو تاريخ السداد (لأن n8n يفشل بدونها)
  function guardSubmitWithoutReceipt() {
    const form = document.querySelector('input[name="first_name-37303"]')?.closest('form');
    if (!form || form.dataset.receiptGuard) return;
    form.dataset.receiptGuard = '1';

    form.addEventListener('submit', (e) => {
      const missing = [];
      if (!getReceiptHiddenInput()?.value) missing.push('صورة الوصل');
      if (!getDateHiddenInput()?.value) missing.push('تاريخ السداد');
      if (missing.length === 0) return;
      const proceed = confirm(`تنبيه: لم يتم تعبئة: ${missing.join(' و ')}!\n\nالتسجيل بدونها قد يفشل في n8n.\n\nهل تريد المتابعة على أي حال؟`);
      if (!proceed) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
  }

  // ملء كل حقول نموذج بوابة عقليات (Ultimate Member Form 37303)
  function applyFormData(data) {
    console.log('جاري ملء حقول النموذج بالبيانات:', data);

    const hasReceipt = !!(data.uploadedFilename || data.uploadedImageUrl || data.receiptUrl);
    const receiptPreviewUrl = data.uploadedImageUrl || (data.receiptUrl && data.receiptUrl.startsWith('http') ? data.receiptUrl : null);

    createBanner(data.participantName, hasReceipt, receiptPreviewUrl);
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['showDock'], (res) => {
        if (res.showDock !== false) createReceiptSideDock(data);
      });
    } else {
      createReceiptSideDock(data);
    }

    // 1. الاسم الثلاثي (تنظيف أي بادئات زائدة مثل "الإسم" أو "اسم المشترك")
    let cleanTraineeName = (data.participantName || '').trim();
    cleanTraineeName = cleanTraineeName
      .replace(/^[+*\-•#\s:：~]+/, '')
      .replace(/^(?:ثلاثي|رباعي|الثلاثي|الرباعي)[\s:：-]*/i, '')
      .replace(/^(?:الاسم|الأسم|الإسم|إسم|اسم|المشترك|اسم المشترك|المتدرب|اسم المتدرب|المشتركة|اسم المشتركة|المتدربة|اسم المتدربة|الطالب|اسم الطالب|الطالبة|اسم الطالبة|العميل|اسم العميل)[\s:：-]*/i, '')
      .replace(/^(?:ثلاثي|رباعي|الثلاثي|الرباعي)[\s:：-]*/i, '')
      .replace(/^[+*\-•#\s:：~]+/, '')
      .replace(/[:*+~]+$/, '')
      .trim();
    setInputValue('input[name="first_name-37303"]', cleanTraineeName);

    // 2. البريد الإلكتروني (تنظيفه من أي محارف اتجاه غير مرئية \u202c أو \u200f)
    const cleanEmail = (data.email || '').replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E]/g, '').trim().toLowerCase();
    setInputValue('input[name="user_email-37303"]', cleanEmail);

    // 3. الجنس
    setSelectValue('select[name="trainee_gender"]', data.gender === 'أنثى' ? 'أنثى' : 'ذكر');

    // 4. بلد الدفع
    setSelectValue('select[name="payer_country"]', data.payerCountry || 'فلسطين');

    // 5. رقم الجوال مع كود الدولة (أرقام فقط)
    let cleanPhone = (data.cleanPhone || data.phone || '').replace(/\D/g, '');
    if (cleanPhone.startsWith('05')) cleanPhone = '970' + cleanPhone.substring(1);
    else if (cleanPhone.startsWith('5') && cleanPhone.length === 9) cleanPhone = '970' + cleanPhone;
    setInputValue('input[name="trainee_phone-37303"]', cleanPhone);

    // 6. بلد الإقامة
    setSelectValue('select[name="residence_country"]', data.residenceCountry || 'فلسطين');

    // 7. الشروط والأحكام وتلقي رسائل واتساب
    checkCheckbox('ragree_terms[]');
    checkCheckbox('ragree_terms_11[]');

    // 8. كلمة المرور (أرقام الجوال)
    const pwd = data.password || cleanPhone;
    setInputValue('input[name="user_password-37303"]', pwd);

    // 9. طريقة السداد: التسليم باليد
    const isAisha = Boolean(
      data.isAishaHandDelivery ||
      data.paymentMethod === 'استلام باليد' ||
      (data.chatName && /تسليم\s*بيد\s*عائش[ةه]/i.test(data.chatName)) ||
      (data.notes && /تسليم\s*بيد\s*عائش[ةه]|استلام\s*باليد/i.test(data.notes)) ||
      (data.rawText && /تسليم\s*بيد\s*عائش[ةه]|استلام\s*باليد/i.test(data.rawText))
    );

    const method = isAisha ? 'استلام باليد' : (data.paymentMethod || 'تحويل مصرفي');
    setRadioValue('Payment_method[]', method);

    // 10. اسم مرسل الحوالة
    setInputValue('input[name="sender_name-37303"]', data.senderName || data.participantName);

    // 11. رقم الحوالة: التسليم باليد لا يحتاج رقم حوالة
    setInputValue('input[name="transaction_number-37303"]', isAisha ? '' : (data.transferNumber || ''));

    // 12. تاريخ السداد (عبر مكتبة التقويم في البوابة)
    setPaymentDate(data.paymentDate);

    // 13. اسم البنك أو الصرافة: التسليم باليد لا يحتاج اسم بنك
    setInputValue('input[name="sender_bank_name-37303"]', isAisha ? '' : (data.bankName || ''));

    // 14. المبلغ بالعملة المحلية
    setInputValue('input[name="amount_local_currency-37303"]', data.amount || (isAisha ? 100 : (data.currency === 'USD' ? 120 : 85)));

    // 15. العملة
    setSelectValue('select[name="currency_code"]', data.currency || (isAisha ? 'USD' : 'JOD'));

    // 15.1 القيمة بالدولار إن كانت العملة دولار
    if (data.currency === 'USD' || isAisha || data.amount === 120 || data.amount === 100) {
      setInputValue('input[name="amount_usd-37303"]', data.amount || (isAisha ? 100 : 120));
    }

    // 16. الملاحظات — حسب تعليمات المستخدم الصارمة لجميع الحوالات: فقط العمر واسم المنسق ولا أي شيء آخر بتاتاً
    let coordinator = data.coordinatorName || '';
    let age = data.age || '';

    // استخراج اسم المنسق إن لم يكن ممرراً كحقل مباشر
    if (!coordinator) {
      const matchCoord = (data.notes || '').match(/اسم\s*المنسق\s*:\s*([^\n\r-]+)/i) ||
                         (data.rawText || '').match(/اسم\s*المنسق\s*:\s*([^\n\r-]+)/i) ||
                         (data.notes || '').match(/المنسق\s*:\s*([^\n\r-]+)/i);
      if (matchCoord) coordinator = matchCoord[1].trim();
    }
    // استخراج العمر إن لم يكن ممرراً كحقل مباشر
    if (!age) {
      const matchAge = (data.notes || '').match(/العمر\s*:\s*([^\n\r-]+)/i) ||
                       (data.rawText || '').match(/(?:العمر|السن)\s*:\s*(\d+)/i) ||
                       (data.rawText || '').match(/\b(?:عمر|سن)\s+(\d+)\b/i);
      if (matchAge) age = matchAge[1].trim();
    }

    const notesParts = [];
    if (coordinator) notesParts.push(`اسم المنسق: ${coordinator}`);
    if (age) notesParts.push(`العمر: ${age}`);
    const cleanNotes = notesParts.join(' - ');

    setInputValue('textarea[name="txtooooooooo"]', cleanNotes);

    // 17. إرفاق صورة الوصل عبر نافذة الرفع الأصلية + تنبيه قبل التسجيل بدون وصل
    if (SUBMIT_GUARD) guardSubmitWithoutReceipt();
    if (AUTO_UPLOAD_RECEIPT) {
      uploadReceiptViaPortalWidget(data);
    } else {
      setStatus('تم ملء الحقول. <span style="color:#fde047;">ارفع صورة الوصل يدوياً ثم اضغط تسجيل.</span>');
    }
  }

  // الدالة الرئيسية مع فحص حالة تفعيل الإضافة
  async function init() {
    // 1. التحقق من حالة تفعيل الإضافة من القائمة العلوية
    let urlData = getUrlData();
    let data = urlData || {};
    const hasUrlData = Boolean(data && data.participantName);

    let isFilled = false;

    // دالة محاولة ملء النموذج فور توفر حقوله في DOM
    function tryFillForm(currentData) {
      if (isFilled) return true;
      const formInput = document.querySelector('input[name="first_name-37303"]');
      if (formInput && currentData && currentData.participantName) {
        isFilled = true;
        applyFormData(currentData);
        return true;
      }
      return false;
    }

    // إذا كانت البيانات متوفرة في الرابط أو الذاكرة المؤقتة (الوضع الطبيعي عند الضغط على تسجيل بالبوابة أو تحديث F5):
    // تعبئة البيانات والبدء فوراً وبدون انتظار أي شبكة
    if (hasUrlData) {
      if (!tryFillForm(data)) {
        let attempts = 0;
        const interval = setInterval(() => {
          attempts++;
          if (tryFillForm(data) || attempts >= 50) {
            clearInterval(interval);
          }
        }, 40); // فحص سريع جداً كل 40ms بدلاً من 250ms
      }

      // إظهار نافذة الوصل الجانبية فوراً بالتوازي دون انتظار الشبكة
      createReceiptSideDock(data);

      // في الخلفية بدون حظر الواجهة: إثراء بيانات الوصل إن وُجدت
      fetchPendingData().then((pending) => {
        if (pending) {
          let updated = false;
          if (!data.receiptBase64 && pending.receiptBase64) {
            data.receiptBase64 = pending.receiptBase64;
            updated = true;
          }
          if (!data.receiptUrl && pending.receiptUrl) {
            data.receiptUrl = pending.receiptUrl;
            updated = true;
          }
          if (!data.messageCardBase64 && pending.messageCardBase64) {
            data.messageCardBase64 = pending.messageCardBase64;
            updated = true;
          }
          if (updated) {
            const dockImg = document.getElementById('dock-receipt-img');
            if (dockImg && (pending.receiptBase64 || pending.receiptUrl)) {
              dockImg.src = pending.receiptBase64 || getRealReceiptUrl(pending);
            } else if (!document.getElementById('hawalat-receipt-dock')) {
              createReceiptSideDock(data);
            }
          }
        }
      }).catch(() => {});

      return;
    }

    // إذا لم تكن البيانات في الرابط، جلب البيانات المعلقة من السيرفر
    const pending = await fetchPendingData();
    if (pending && pending.participantName) {
      data = { ...pending, ...data };
      tryFillForm(data);
      createReceiptSideDock(data);
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (tryFillForm(data) || attempts >= 50) {
          clearInterval(interval);
        }
      }, 40);
    }

    // مراقب احتياطي ذكي: إذا بقيت الصفحة مفتوحة والفورم فارغ، يتم فحص السيرفر دورياً كل 1.5 ثانية (حتى 60 ثانية)
    // حتى تتعبأ تلقائياً فور قيام المستخدم بالضغط على "تسجيل بالبوابة" في التطبيق
    if (!isFilled) {
      let pollCount = 0;
      const pollTimer = setInterval(async () => {
        pollCount++;
        const currentInput = document.querySelector('input[name="first_name-37303"]');
        const alreadyHasValue = currentInput && currentInput.value && currentInput.value.trim().length > 0;
        if (isFilled || alreadyHasValue || pollCount >= 40) {
          clearInterval(pollTimer);
          return;
        }

        const delayedPending = await fetchPendingData();
        if (delayedPending && delayedPending.participantName && !isFilled) {
          clearInterval(pollTimer);
          tryFillForm(delayedPending);
          createReceiptSideDock(delayedPending);
        }
      }, 1500);
    }
  }

  // الاستماع لتغيير حالة الإضافة المباشر من القائمة العلوية
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && 'extensionEnabled' in changes) {
        const isEnabled = changes.extensionEnabled.newValue !== false;
        const dock = document.getElementById('hawalat-receipt-dock');
        const minDock = document.getElementById('hawalat-receipt-dock-minimized');
        if (!isEnabled) {
          if (dock) dock.style.display = 'none';
          if (minDock) minDock.style.display = 'none';
        } else {
          if (dock) dock.style.display = 'flex';
          else init();
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
