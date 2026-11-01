import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/floating-toast";
import { MobilePWAInstallPrompt } from "@/components/mobile-pwa-install-prompt";
import { cn } from "@/lib/utils";

export const viewport: Viewport = {
  themeColor: "#161717",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "واتساب",
  description: "إدارة محادثات واتساب من المتصفح",
  manifest: "/manifest.webmanifest",
  applicationName: "واتساب",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "واتساب",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png?v=5', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png?v=5', sizes: '512x512', type: 'image/png' },
      { url: '/favicon.ico?v=5', sizes: 'any' },
      { url: '/favicon-32x32.png?v=5', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/icons/icon-192.png?v=5',
    apple: [
      { url: '/icons/apple-touch-icon.png?v=5', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={cn("antialiased", "font-sans")}
    >
      <body className="min-h-dvh overflow-x-hidden bg-background antialiased">
        <ThemeProvider>
          <ToastProvider>
            {children}
            <MobilePWAInstallPrompt />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
