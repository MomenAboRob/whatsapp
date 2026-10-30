/**
 * أداة دمج صورتين في صورة واحدة متكاملة (Image Combiner)
 * تتيح دمج صورة الحوالة وصورة الوصل معاً في ملف صورة واحد عالي الدقة
 * حتى تظل الصورتان مشبوكتين ومدمجتين معاً أينما أُرسلتا على واتساب أو أيرتيبل
 */

export async function combineTwoImages(
  img1Url: string,
  img2Url: string,
  label1 = 'بيانات الحوالة',
  label2 = 'صورة الوصل'
): Promise<string> {
  if (typeof window === 'undefined') return '';

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        // إذا فشل بالـ crossOrigin نحاول بدونه
        const fallback = new Image();
        fallback.onload = () => resolve(fallback);
        fallback.onerror = (e) => reject(e);
        fallback.src = src;
      };
      img.src = src;
    });
  };

  const [img1, img2] = await Promise.all([loadImage(img1Url), loadImage(img2Url)]);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const padding = 16;
  const gap = 14;
  const headerHeight = 36;
  const footerHeight = 24;

  // تحديد ما إذا كان الترتيب أفقياً (جنباً إلى جنب) أو رأسياً (فوق بعضهما)
  // إذا كانت الصورتان عموديتين (Portrait)، نضعهما جنباً إلى جنب
  const isBothPortrait = (img1.height > img1.width * 1.1) && (img2.height > img2.width * 1.1);

  if (isBothPortrait) {
    // وضع جانبي (Side-by-Side)
    const targetHeight = 900;
    const w1 = Math.round((img1.width / img1.height) * targetHeight);
    const w2 = Math.round((img2.width / img2.height) * targetHeight);

    const totalWidth = padding * 2 + w1 + gap + w2;
    const totalHeight = padding * 2 + headerHeight + targetHeight + footerHeight;

    canvas.width = totalWidth;
    canvas.height = totalHeight;

    // خلفية راقية داكنة
    ctx.fillStyle = '#161717';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    // ترويسة أنيقة
    ctx.fillStyle = '#21c063';
    ctx.fillRect(0, 0, totalWidth, 4);

    ctx.fillStyle = '#fafafa';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillText('حوالة وإيصال دفع مشبوكان معاً', totalWidth - padding, headerHeight - 10);

    // بطاقة الصورة الأولى
    const x1 = totalWidth - padding - w1;
    const y1 = padding + headerHeight;
    ctx.drawImage(img1, x1, y1, w1, targetHeight);

    // إطار خفيف للصورة الأولى
    ctx.strokeStyle = '#2e2f2f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, w1, targetHeight);

    // وسم الصورة الأولى
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(x1 + w1 - 100, y1 + 8, 92, 22);
    ctx.fillStyle = '#21c063';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label1, x1 + w1 - 54, y1 + 23);

    // بطاقة الصورة الثانية
    const x2 = padding;
    const y2 = padding + headerHeight;
    ctx.drawImage(img2, x2, y2, w2, targetHeight);

    ctx.strokeStyle = '#21c063';
    ctx.lineWidth = 2;
    ctx.strokeRect(x2, y2, w2, targetHeight);

    // وسم الصورة الثانية
    ctx.fillStyle = 'rgba(33, 192, 99, 0.9)';
    ctx.fillRect(x2 + w2 - 96, y2 + 8, 88, 22);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label2, x2 + w2 - 52, y2 + 23);

    // تذييل سفلي
    ctx.fillStyle = '#7a7c7c';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('نظام إدارة وتدقيق الحوالات الذكي', totalWidth / 2, totalHeight - 10);
  } else {
    // وضع رأسي (Stacked Top & Bottom)
    const targetWidth = 800;
    const h1 = Math.round((img1.height / img1.width) * targetWidth);
    const h2 = Math.round((img2.height / img2.width) * targetWidth);

    const totalWidth = padding * 2 + targetWidth;
    const totalHeight = padding * 2 + headerHeight + h1 + gap + h2 + footerHeight;

    canvas.width = totalWidth;
    canvas.height = totalHeight;

    ctx.fillStyle = '#161717';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    ctx.fillStyle = '#21c063';
    ctx.fillRect(0, 0, totalWidth, 4);

    ctx.fillStyle = '#fafafa';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillText('حوالة وإيصال دفع مشبوكان معاً', totalWidth - padding, headerHeight - 10);

    // الصورة الأولى (أعلى)
    const x1 = padding;
    const y1 = padding + headerHeight;
    ctx.drawImage(img1, x1, y1, targetWidth, h1);

    ctx.strokeStyle = '#2e2f2f';
    ctx.lineWidth = 2;
    ctx.strokeRect(x1, y1, targetWidth, h1);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(x1 + targetWidth - 110, y1 + 8, 102, 24);
    ctx.fillStyle = '#21c063';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label1, x1 + targetWidth - 59, y1 + 24);

    // الصورة الثانية (أسفل)
    const x2 = padding;
    const y2 = y1 + h1 + gap;
    ctx.drawImage(img2, x2, y2, targetWidth, h2);

    ctx.strokeStyle = '#21c063';
    ctx.lineWidth = 2;
    ctx.strokeRect(x2, y2, targetWidth, h2);

    ctx.fillStyle = 'rgba(33, 192, 99, 0.9)';
    ctx.fillRect(x2 + targetWidth - 110, y2 + 8, 102, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label2, x2 + targetWidth - 59, y2 + 24);

    ctx.fillStyle = '#7a7c7c';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('نظام إدارة وتدقيق الحوالات الذكي', totalWidth / 2, totalHeight - 10);
  }

  return canvas.toDataURL('image/jpeg', 0.94);
}
