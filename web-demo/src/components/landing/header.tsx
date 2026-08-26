import { cn } from "@/lib/utils";

export type HeaderProps = {
  className?: string;
  homeURL?: string;
};

export async function Header({ className, homeURL }: HeaderProps) {
  return (
    <header
      className={cn(
        // [-webkit-app-region:drag] makes the whole header a window-drag zone
        // on Electron (ignored by regular browsers). pl-[80px] reserves space
        // for the macOS traffic-light buttons under titleBarStyle: hiddenInset
        // so the KWorks logo does not sit underneath them; on the Windows
        // frameless shell that left inset collapses (no traffic lights there)
        // via .kworks-landing-header in globals.css.
        "kworks-landing-header container-md fixed top-0 right-0 left-0 z-20 mx-auto flex h-16 items-center justify-between pl-[80px] backdrop-blur-xs [-webkit-app-region:drag]",
        className,
      )}
    >
      <a href={homeURL ?? "/"}>
        <h1 className="font-serif text-xl">
          <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
            KWorks
          </span>
        </h1>
      </a>
      <hr className="from-border/0 via-border/70 to-border/0 absolute top-16 right-0 left-0 z-10 m-0 h-px w-full border-none bg-linear-to-r" />
    </header>
  );
}
