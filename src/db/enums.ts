// Fixed value lists used by the database schema and the till screens.
// Plain constants with no database imports, so browser code can use them.

export const STAFF_ROLES = ["owner", "manager", "cashier", "server", "bartender", "kitchen"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STATIONS = ["Kitchen", "Grill", "Fryer", "Bar"] as const;
export type Station = (typeof STATIONS)[number];

export const ORDER_TYPES = ["dine_in", "takeaway", "delivery"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

/** held: saved, nothing sent yet. open: something has gone to the kitchen; awaiting payment. paid: closed. */
export const ORDER_STATUSES = ["held", "open", "paid"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TICKET_STATUSES = ["new", "cooking", "ready", "served"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PAYMENT_METHODS = ["cash", "card", "mobile_money", "voucher", "house_account"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MOMO_NETWORKS = ["mtn", "telecel", "at"] as const;
export type MomoNetwork = (typeof MOMO_NETWORKS)[number];
