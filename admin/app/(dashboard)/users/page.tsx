import { api } from "@/lib/api";
import { UsersTable } from "@/components/users-table";
import { Suspense } from "react";

export default async function UsersPage() {
  const users = await api.users();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Users</h1>
      <Suspense>
        <UsersTable users={users} />
      </Suspense>
    </div>
  );
}
