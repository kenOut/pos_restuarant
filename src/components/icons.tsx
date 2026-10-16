// Small stroke icon set (24×24 grid) used by the mockups and, later, the till.

const PATHS = {
  home: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  tables: "M4 8h16M6 8l-1 9M18 8l1 9M9 8v6M15 8v6M8 4h8",
  order: "M5 4h14v16H5zM12 8v8M8 12h8",
  kitchen: "M5 13a7 7 0 0 1 14 0zM3 13h18M12 6V4M7 17h10M9 20h6",
  orders: "M7 3h10v18H7zM10 8h4M10 12h4M10 16h2",
  bookings: "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5",
  menu: "M4 6h2M9 6h11M4 12h2M9 12h11M4 18h2M9 18h11",
  stock: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12L4 7.5M12 12v9",
  staff: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5c1.8.8 3 2.9 3 5.5",
  guests: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  reports: "M4 20h16M7 16v-5M12 16V6M17 16v-8",
  reviews: "M12 3l2.7 5.6 6.1.8-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.8z",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  logout: "M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9 16l-4-4 4-4M5 12h10",
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16.5 16.5L21 21",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21c0-3.9 3.1-7 7-7s7 3.1 7 7",
  note: "M6 3h9l4 4v14H6zM9 12h7M9 16h5",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  back: "M15 5l-7 7 7 7",
  printer: "M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  move: "M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3",
  cash: "M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  phone: "M8 3h8v18H8zM11 18h2",
  voucher: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 7v10",
  utensils: "M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17 21V3c-2.2 1-3.5 3.4-3.5 6.5V13H17",
  wifiOff: "M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.8M19 13a10 10 0 0 0-2.3-1.7M12 20h.01",
} as const;

export type IconName = keyof typeof PATHS;

type IconProps = {
  name: IconName;
  className?: string;
  strokeWidth?: number;
};

/** Decorative by default (aria-hidden). Give the surrounding control an accessible name. */
export function Icon({ name, className = "size-5", strokeWidth = 1.75 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
