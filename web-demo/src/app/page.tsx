import { AnimatedBackground } from "@/components/ui/animated-background";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#0a0a0a]">
      <AnimatedBackground />
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
