import type { Metadata } from "next";
import { StaffManager } from "@/components/staff/staff-manager";
import { getDb } from "@/db";
import { requireStaff } from "@/lib/auth/session";
import { assignableRoles, listStaff } from "@/lib/staff/service";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const person = await requireStaff("staff");
  return (
    <StaffManager
      staff={listStaff(getDb(), person.restaurantId)}
      me={person.id}
      myRole={person.role}
      assignable={assignableRoles(person.role)}
    />
  );
}
