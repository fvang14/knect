import { api } from "@/lib/api";
import { StatCard } from "@/components/stat-card";

export default async function DashboardPage() {
  const metrics = await api.metrics();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active Contractors" value={metrics.active_contractors} />
        <StatCard label="Jobs Today" value={metrics.jobs_today} />
        <StatCard
          label="Platform Avg Rating"
          value={metrics.avg_rating.toFixed(2)}
        />
      </div>
    </div>
  );
}
