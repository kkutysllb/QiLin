import { GoldDivider, QilinSeal } from "@/components/brand/qilin-mark";
import { cn } from "@/lib/utils";

export type FooterProps = {
  className?: string;
};

export function Footer({ className }: FooterProps) {
  const year = new Date().getFullYear();
  return (
    <footer
      className={cn(
        "container-md mx-auto mt-4 flex flex-col items-center justify-center",
        className,
      )}
    >
      <GoldDivider className="w-full max-w-xl" />
      <div className="container flex h-12 flex-col items-center justify-center text-sm text-ql-ink-mid">
        <p className="text-center font-serif text-sm md:text-base">
          「为自主智能体而生，以开源为基石。」
        </p>
      </div>
      <div className="container mb-4 flex items-center justify-center gap-2 text-xs text-ql-ink-low">
        <p>基于 MIT 协议开源 · &copy; {year} QiLin</p>
        <QilinSeal size={12} />
      </div>
    </footer>
  );
}
