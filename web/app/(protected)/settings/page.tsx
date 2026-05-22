import { AccountSection } from "./account-section";
import { DangerSection } from "./danger-section";
import { ProfileSection } from "./profile-section";

export const metadata = {
  title: "Settings - Knect",
};

export default function SettingsPage() {
  return (
    <main className="max-w-2xl mx-auto py-8 px-4 sm:px-6 flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-bold text-slate-900 tracking-[-0.025em] m-0">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your profile, account preferences, and security settings.</p>
      </div>

      <ProfileSection />
      <AccountSection />
      <DangerSection />
    </main>
  );
}
