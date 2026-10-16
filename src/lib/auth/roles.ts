import type { StaffRole } from "@/db/schema";
import type { IconName } from "@/components/icons";

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  server: "Server",
  bartender: "Bartender",
  kitchen: "Kitchen",
};

const FRONT_OF_HOUSE: readonly StaffRole[] = ["owner", "manager", "cashier", "server", "bartender"];
const MANAGEMENT: readonly StaffRole[] = ["owner", "manager"];
const EVERYONE: readonly StaffRole[] = [...FRONT_OF_HOUSE, "kitchen"];

export type NavId =
  | "home"
  | "tables"
  | "order"
  | "kitchen"
  | "orders"
  | "bookings"
  | "menu"
  | "stock"
  | "staff"
  | "guests"
  | "reports"
  | "reviews"
  | "settings";

type NavDefinition = {
  id: NavId;
  label: string;
  icon: IconName;
  roles: readonly StaffRole[];
  /** Set once the screen exists; sections without one show as "coming later". */
  href?: string;
};

/** Till sections in the deck's sidebar order, with who may see each. */
const NAV: readonly NavDefinition[] = [
  { id: "home", label: "Home", icon: "home", roles: FRONT_OF_HOUSE },
  { id: "tables", label: "Tables", icon: "tables", roles: FRONT_OF_HOUSE, href: "/tables" },
  { id: "order", label: "Order", icon: "order", roles: FRONT_OF_HOUSE, href: "/order" },
  { id: "kitchen", label: "Kitchen", icon: "kitchen", roles: EVERYONE, href: "/kitchen" },
  { id: "orders", label: "Orders", icon: "orders", roles: FRONT_OF_HOUSE },
  { id: "bookings", label: "Bookings", icon: "bookings", roles: ["owner", "manager", "cashier", "server"] },
  { id: "menu", label: "Menu", icon: "menu", roles: MANAGEMENT, href: "/menu" },
  { id: "stock", label: "Stock", icon: "stock", roles: MANAGEMENT },
  { id: "staff", label: "Staff", icon: "staff", roles: MANAGEMENT, href: "/staff" },
  { id: "guests", label: "Guests", icon: "guests", roles: ["owner", "manager", "cashier", "server"] },
  { id: "reports", label: "Reports", icon: "reports", roles: MANAGEMENT },
  { id: "reviews", label: "Reviews", icon: "reviews", roles: MANAGEMENT },
  { id: "settings", label: "Settings", icon: "settings", roles: MANAGEMENT, href: "/settings" },
];

export type NavItem = { id: NavId; label: string; icon: IconName; href: string | null };

/** The sidebar for one role: only sections they may use, in deck order. */
export function navFor(role: StaffRole): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role)).map(({ id, label, icon, href }) => ({
    id,
    label,
    icon,
    href: href ?? null,
  }));
}

export type TillArea = Extract<NavId, "tables" | "order" | "kitchen" | "menu" | "staff" | "settings">;

export function canAccess(role: StaffRole, area: TillArea): boolean {
  return NAV.some((n) => n.id === area && n.roles.includes(role));
}

/** Where someone lands after signing in. */
export function homePathFor(role: StaffRole): string {
  return canAccess(role, "order") ? "/order" : "/kitchen";
}
