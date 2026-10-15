// Demonstration menu from the ENYO POS deck ("Chez Accra"). Prices in pesewas.
// Used by the landing-page mockups and as the seed menu for the till.

export type Station = "Kitchen" | "Grill" | "Fryer" | "Bar";
export type Category = "Starters" | "Mains" | "Grills" | "Drinks" | "Desserts";

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  station: Station;
  category: Category;
};

export const CATEGORIES: readonly Category[] = ["Starters", "Mains", "Grills", "Drinks", "Desserts"];

export const DEMO_MENU: readonly MenuItem[] = [
  { id: "kelewele", name: "Kelewele", price: 3500, station: "Fryer", category: "Starters" },
  { id: "spring-rolls", name: "Spring rolls", price: 4000, station: "Fryer", category: "Starters" },
  { id: "chicken-wings", name: "Chicken wings", price: 5500, station: "Grill", category: "Starters" },
  { id: "jollof-chicken", name: "Jollof rice with chicken", price: 9000, station: "Kitchen", category: "Mains" },
  { id: "waakye", name: "Waakye special", price: 7000, station: "Kitchen", category: "Mains" },
  { id: "banku-tilapia", name: "Banku and tilapia", price: 12000, station: "Grill", category: "Mains" },
  { id: "fufu-light-soup", name: "Fufu with light soup", price: 9000, station: "Kitchen", category: "Mains" },
  { id: "red-red", name: "Red red with plantain", price: 6000, station: "Kitchen", category: "Mains" },
  { id: "beef-suya", name: "Beef suya", price: 6500, station: "Grill", category: "Grills" },
  { id: "guinea-fowl", name: "Grilled guinea fowl", price: 14000, station: "Grill", category: "Grills" },
  { id: "sobolo", name: "Sobolo", price: 2000, station: "Bar", category: "Drinks" },
  { id: "pineapple-juice", name: "Fresh pineapple juice", price: 2500, station: "Bar", category: "Drinks" },
  { id: "lager", name: "Lager, bottle", price: 3000, station: "Bar", category: "Drinks" },
  { id: "malt", name: "Malt drink", price: 1800, station: "Bar", category: "Drinks" },
  { id: "water", name: "Bottled water", price: 800, station: "Bar", category: "Drinks" },
  { id: "pineapple-sorbet", name: "Pineapple sorbet", price: 3500, station: "Kitchen", category: "Desserts" },
];

export function menuItem(id: string): MenuItem {
  const item = DEMO_MENU.find((m) => m.id === id);
  if (!item) throw new Error(`Unknown menu item: ${id}`);
  return item;
}
