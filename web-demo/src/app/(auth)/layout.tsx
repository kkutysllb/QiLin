import { type ReactNode } from "react";

import { AuthProvider } from "@/core/auth/AuthProvider";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Windows frameless shell: seamless drag strip where the native title
          bar used to be (hidden on the web and on macOS / Linux). */}
      <div className="kworks-win-titlebar" aria-hidden="true" />
      <AuthProvider initialUser={null}>{children}</AuthProvider>
    </>
  );
}
