"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import Toaster from "@/app/home/components/Toaster";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster />
    </SessionProvider>
  );
}
