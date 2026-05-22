import { Suspense } from "react";
import { Navbar } from "@/components/ui/navbar";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <div className="pt-[60px] h-full">
        <Suspense>{children}</Suspense>
      </div>
    </>
  );
}
