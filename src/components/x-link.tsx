export const X_URL = "https://x.com/amwalschool";
export const X_HANDLE = "@amwalschool";

export function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`fill-current ${className}`}>
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

// Black pill linking to the X account. Yellow stays reserved for booking.
export function XButton({
  size = "md",
  compactOnMobile = false,
  className = "",
}: {
  size?: "sm" | "md";
  compactOnMobile?: boolean;
  className?: string;
}) {
  const sizing =
    size === "sm"
      ? `h-10 text-sm ${compactOnMobile ? "w-10 sm:w-auto sm:px-5" : "px-5"}`
      : "h-13 px-8 text-base sm:text-lg";
  return (
    <a
      href={X_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تابعنا على X"
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-ink font-semibold text-white transition-colors hover:bg-black ${sizing} ${className}`}
    >
      <XIcon className={size === "sm" ? "size-4" : "size-5"} />
      <span className={compactOnMobile ? "hidden sm:inline" : ""}>
        تابعنا على X
      </span>
    </a>
  );
}
