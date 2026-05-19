import { Suspense } from "react";
import { Providers } from "@/components/providers/providers";
import { Navbar } from "@/components/ui/navbar";
import { ReconnectingBanner } from "@/components/ui/reconnecting-banner";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <ReconnectingBanner />
      <Navbar />
      <div className="pt-14 h-full">
        <Suspense>{children}</Suspense>
      </div>
    </Providers>
  );
}
