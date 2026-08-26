import { cn } from "@/lib/utils";

export function Section({
  className,
  title,
  subtitle,
  children,
}: {
  className?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("mx-auto flex flex-col py-6", className)}>
      <header className="flex flex-col items-center justify-between">
        <div className="mb-1 bg-linear-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-center text-2xl font-bold text-transparent md:text-3xl">
          {title}
        </div>
        {subtitle && (
          <div className="text-muted-foreground text-center text-sm md:text-base">
            {subtitle}
          </div>
        )}
      </header>
      <main className="mt-3">{children}</main>
    </section>
  );
}
