type MentionEmailDetails = {
  chatName: string;
  sender: string;
  text: string;
  timestampMs: number;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char] || char);

export function renderMentionEmail(mention: MentionEmailDetails, appUrl?: string) {
  const chatName = mention.chatName.trim() || 'مجموعة واتساب';
  const sender = mention.sender.trim() || 'أحد أعضاء المجموعة';
  const message = mention.text.trim() || 'ذكرك في رسالة وسائط';
  const date = new Date(mention.timestampMs).toLocaleString('ar-JO', {
    timeZone: 'Asia/Amman', dateStyle: 'medium', timeStyle: 'short',
  });
  let dashboardUrl = '';
  try {
    if (appUrl) {
      const url = new URL(appUrl);
      if (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')) {
        dashboardUrl = new URL('/', url).toString();
      }
    }
  } catch {}

  const subject = `منشن جديد في ${chatName}`;
  const text = `منشن جديد في ${chatName}\nذكرَك ${sender} · ${date}\n\n${message}\n\nافتح لوحة المنشنات في التطبيق للمتابعة.${dashboardUrl ? `\n${dashboardUrl}` : ''}`;
  const safeChat = escapeHtml(chatName);
  const safeSender = escapeHtml(sender);
  const safeMessage = escapeHtml(message).replace(/\r\n|\r|\n/g, '<br>');
  const safeDate = escapeHtml(date);
  const action = dashboardUrl
    ? `<a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 22px;border-radius:9px;background:#128c7e;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">افتح لوحة المنشنات</a>`
    : '<span style="font-size:13px;color:#667781;">افتح لوحة المنشنات في التطبيق للمتابعة.</span>';

  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,Tahoma,sans-serif;color:#111b21;direction:rtl;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f2f5;padding:24px 12px;"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 22px rgba(17,27,33,.08);">
<tr><td style="background:#075e54;padding:22px 24px;color:#ffffff;text-align:right;"><div style="font-size:12px;opacity:.85;letter-spacing:.2px;">تنبيه من التطبيق</div><div style="font-size:21px;font-weight:700;line-height:1.5;margin-top:4px;">وصلك منشن جديد</div></td></tr>
<tr><td style="background:#efeae2;padding:22px 20px;text-align:right;">
<div style="font-size:12px;color:#54656f;margin-bottom:12px;">المجموعة: <strong style="color:#111b21;">${safeChat}</strong></div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;"><tr><td style="background:#d9fdd3;border-radius:12px;padding:15px 17px;text-align:right;border:1px solid #c6e9c0;">
<div style="font-size:13px;font-weight:700;color:#075e54;margin-bottom:8px;">${safeSender} ذكرك</div>
<div dir="auto" style="font-size:15px;line-height:1.8;color:#111b21;word-break:break-word;">${safeMessage}</div>
<div style="font-size:11px;color:#667781;margin-top:12px;text-align:left;">${safeDate}</div>
</td></tr></table>
</td></tr>
<tr><td style="padding:22px 24px;text-align:right;">${action}<div style="font-size:11px;line-height:1.7;color:#8696a0;margin-top:18px;">هذا تنبيه آلي خاص بالمنشنات. راجع المحادثة في التطبيق قبل اتخاذ أي إجراء.</div></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
