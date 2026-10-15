import { Icon } from "@/components/icons";

/** The restaurant's own logo. Until logo upload exists, a red plate with cutlery (as in the demo data). */
export function RestaurantMark({ className = "size-8" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-lg bg-cream ${className}`}>
      <span className="grid size-[80%] place-items-center rounded-full bg-[#b3262b] text-cream">
        <Icon name="utensils" className="size-[60%]" strokeWidth={2.2} />
      </span>
    </span>
  );
}
