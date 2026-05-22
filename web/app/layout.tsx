import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers/providers";
import { ReconnectingBanner } from "@/components/ui/reconnecting-banner";
import { fetchMe } from "@/lib/me-server";

export const metadata: Metadata = { title: "Knect" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const meUser = await fetchMe();

  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-warm-bg text-gray-900 antialiased">
        <Providers initialMeUser={meUser}>
          <ReconnectingBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
