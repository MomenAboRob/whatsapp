/**
 * Native OS Drag and Drop Helper for WhatsApp Web Media
 * Enables dragging images, receipts, and stickers directly from the chat
 * onto the Windows Desktop, File Explorer folders, or into other applications.
 */

let isDraggingActive = false;
let dragEndTimeout: NodeJS.Timeout | null = null;

export function isMediaCurrentlyDragging(): boolean {
  return isDraggingActive;
}

export function resolveAbsoluteMediaUrl(url: string): string {
  if (!url) return '';
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url;
  }
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    return `${origin}${cleanPath}`;
  }
  return url;
}

export function getMediaMimeAndExt(url: string): { mimeType: string; extension: string } {
  const clean = (url || '').trim().toLowerCase();

  if (clean.startsWith('data:')) {
    const match = clean.match(/^data:([^;]+);/);
    if (match && match[1]) {
      const mime = match[1];
      if (mime === 'image/png') return { mimeType: mime, extension: 'png' };
      if (mime === 'image/webp') return { mimeType: mime, extension: 'webp' };
      if (mime === 'image/gif') return { mimeType: mime, extension: 'gif' };
      if (mime === 'image/svg+xml') return { mimeType: mime, extension: 'svg' };
      if (mime === 'application/pdf') return { mimeType: mime, extension: 'pdf' };
      return { mimeType: mime, extension: 'jpg' };
    }
  }

  if (clean.includes('.png')) return { mimeType: 'image/png', extension: 'png' };
  if (clean.includes('.webp')) return { mimeType: 'image/webp', extension: 'webp' };
  if (clean.includes('.gif')) return { mimeType: 'image/gif', extension: 'gif' };
  if (clean.includes('.svg')) return { mimeType: 'image/svg+xml', extension: 'svg' };
  if (clean.includes('.pdf')) return { mimeType: 'application/pdf', extension: 'pdf' };

  return { mimeType: 'image/jpeg', extension: 'jpg' };
}

export function sanitizeFileName(name: string, extension: string): string {
  let clean = (name || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim();
  if (!clean) {
    clean = `whatsapp_image_${Date.now()}`;
  }
  const dotExt = `.${extension}`;
  if (!clean.toLowerCase().endsWith(dotExt)) {
    clean = `${clean}${dotExt}`;
  }
  return clean;
}

export interface MediaDragOptions {
  fileName?: string;
  fallbackName?: string;
}

export function handleMediaDragStart(
  e: React.DragEvent<HTMLElement>,
  mediaUrl: string,
  options?: MediaDragOptions
): void {
  if (!mediaUrl) return;

  isDraggingActive = true;
  if (dragEndTimeout) {
    clearTimeout(dragEndTimeout);
    dragEndTimeout = null;
  }

  const absoluteUrl = resolveAbsoluteMediaUrl(mediaUrl);
  const { mimeType, extension } = getMediaMimeAndExt(absoluteUrl);

  let rawName = options?.fileName || options?.fallbackName;
  if (!rawName) {
    try {
      const urlObj = new URL(
        absoluteUrl.startsWith('data:') ? 'http://dummy.com/image.jpg' : absoluteUrl
      );
      const base = urlObj.pathname.substring(urlObj.pathname.lastIndexOf('/') + 1);
      if (base && base.length > 2 && !base.includes('?')) {
        rawName = decodeURIComponent(base);
      }
    } catch {
      // Fallback
    }
  }

  const finalFileName = sanitizeFileName(rawName || `whatsapp_media_${Date.now()}`, extension);

  try {
    // Chromium native OS file drop format (Windows Desktop / Explorer)
    e.dataTransfer.setData('DownloadURL', `${mimeType}:${finalFileName}:${absoluteUrl}`);

    // Universal formats for browsers, messengers, and graphic software
    e.dataTransfer.setData('text/uri-list', absoluteUrl);
    e.dataTransfer.setData('text/plain', absoluteUrl);
    e.dataTransfer.setData('text/html', `<img src="${absoluteUrl}" alt="${finalFileName}" />`);

    e.dataTransfer.effectAllowed = 'copyMove';

    // Set preview image if dragging a container
    const target = e.currentTarget;
    if (target.tagName.toLowerCase() !== 'img') {
      const imgChild = target.querySelector('img');
      if (imgChild) {
        e.dataTransfer.setDragImage(imgChild, 20, 20);
      }
    }
  } catch (err) {
    console.warn('Error setting drag dataTransfer:', err);
  }
}

export function handleMediaDragEnd(): void {
  if (dragEndTimeout) clearTimeout(dragEndTimeout);
  dragEndTimeout = setTimeout(() => {
    isDraggingActive = false;
  }, 250);
}

export function getMediaDragAttributes(
  mediaUrl: string,
  options?: MediaDragOptions
) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent<HTMLElement>) => handleMediaDragStart(e, mediaUrl, options),
    onDragEnd: handleMediaDragEnd,
  };
}
