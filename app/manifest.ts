import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'نظام أتمتة وإدارة الحوالات',
    short_name: 'الحوالات',
    description: 'لوحة تحكم مركزية لأتمتة دورة حياة الحوالات والمراجعة السريعة ومزامنة أيرتيبل وبوابة عقليات',
    start_url: '/',
    id: '/',
    display: 'standalone',
    background_color: '#161717',
    theme_color: '#161717',
    orientation: 'portrait-primary',
    categories: ['finance', 'business', 'productivity'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
