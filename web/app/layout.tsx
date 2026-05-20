import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers/providers";
import { ReconnectingBanner } from "@/components/ui/reconnecting-banner";

export const metadata: Metadata = { title: "Knect" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-warm-bg text-gray-900 antialiased">
        <Providers>
          <ReconnectingBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
