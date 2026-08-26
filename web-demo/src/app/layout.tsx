import "@/styles/globals.css";
import "katex/dist/katex.min.css";

import type { Metadata } from "next";
import { type ReactNode } from "react";

import { DesktopProviders } from "@/components/desktop/providers";

export const metadata: Metadata = {
  title: "KWorks",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/*
         * Windows frameless shell: stamp the desktop platform onto <html>
         * synchronously (before first paint) so frameless title-bar styles
         * (drag strips, overlay insets) apply without a flash. The preload
         * bridge is injected before any page script runs, and the attribute
         * stays unset in regular browsers.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var p=window.kworksDesktop&&window.kworksDesktop.platform;if(p)document.documentElement.setAttribute('data-desktop-platform',p)}catch(e){}",
          }}
        />
        <DesktopProviders>{children}</DesktopProviders>
      </body>
    </html>
  );
}
