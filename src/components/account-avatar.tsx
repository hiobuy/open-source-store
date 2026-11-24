import { cn } from "@/lib/utils";

export function AccountAvatar({
  src,
  name,
  email,
  className,
}: {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  className: string;
}) {
  if (src?.trim()) {
    return (
      <img
        alt=""
        className={cn("shrink-0 rounded-full object-cover", className)}
        src={src}
      />
    );
  }

  const [initial = ""] = name?.trim() || email?.trim() || "";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-white font-semibold text-gray-600",
        className,
      )}
    >
      {initial.toUpperCase()}
    </span>
  );
}
