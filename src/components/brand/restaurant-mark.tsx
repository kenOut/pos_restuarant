import { Icon } from "@/components/icons";

/**
 * The restaurant's logo: the uploaded image when there is one, otherwise a
 * red plate with cutlery (as in the demo data).
 */
export function RestaurantMark({ className = "size-8", logoUrl = null }: { className?: string; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- small uploaded logo served by our own route
      <img src={logoUrl} alt="" aria-hidden="true" className={`shrink-0 rounded-lg bg-cream object-contain ${className}`} />
    );
  }
  return (
    <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-lg bg-cream ${className}`}>
      <span className="grid size-[80%] place-items-center rounded-full bg-[#b3262b] text-cream">
        <Icon name="utensils" className="size-[60%]" strokeWidth={2.2} />
      </span>
    </span>
  );
}
