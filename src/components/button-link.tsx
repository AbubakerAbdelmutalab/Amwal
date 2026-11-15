import Link from "next/link";

type Variant = "primary" | "secondary" | "dark";

const styles: Record<Variant, string> = {
  // Yellow is reserved for booking actions.
  primary: "bg-brand text-ink hover:bg-brand-dark",
  secondary: "border border-line bg-white text-ink hover:border-ink",
  dark: "bg-ink text-white hover:bg-black",
};

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  size?: "sm" | "md";
  className?: string;
}) {
  const sizing =
    size === "sm" ? "h-10 px-5 text-sm" : "h-13 px-8 text-base sm:text-lg";
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-full font-semibold transition-colors ${sizing} ${styles[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}
