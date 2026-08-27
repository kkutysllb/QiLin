import { ScalePattern } from "@/components/brand/qilin-mark";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";

export default function LandingPage() {
  return (
    <div className="bg-ql-bg text-ql-ink-hi relative flex min-h-screen w-full flex-col overflow-hidden">
      {/* 玄金静态背景层：弱金顶光 + 极淡基线网格 + 右下角鳞纹(全部装饰性, 零 JS 动效) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(201,162,74,0.10),transparent_70%)]" />
        <div
          className="absolute inset-0 opacity-100"
          style={{
            backgroundImage:
              "linear-gradient(rgba(239,233,223,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(239,233,223,0.03) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
        <ScalePattern patternId="landing-scale" className="absolute right-0 bottom-0" />
      </div>
      <div className="relative z-10 flex min-h-screen w-full flex-col">
        <Header />
        <main className="flex w-full flex-1 flex-col justify-center">
          <Hero />
        </main>
        <Footer />
      </div>
    </div>
  );
}
