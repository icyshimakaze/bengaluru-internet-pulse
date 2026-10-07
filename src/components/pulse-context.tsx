"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { DashboardData } from "@/lib/domain/read-models";
import { pulseMetadata, type PulseMetadata } from "@/lib/trends/dashboard-presentation";

const PulseContext = createContext<{ pulse: PulseMetadata; now: number; publish: (pulse: DashboardData) => void } | null>(null);
export function PulseProvider({ initialPulse, children }: { initialPulse: PulseMetadata; children: React.ReactNode }) {
  const [pulse, setPulse] = useState(initialPulse);
  const [now, setNow] = useState(Date.parse(initialPulse.evaluatedAt));
  const publish = useCallback((next: DashboardData) => { setPulse(pulseMetadata(next)); setNow(Date.now()); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  return <PulseContext.Provider value={{ pulse, now, publish }}>{children}</PulseContext.Provider>;
}
export function usePulseStatus() {
  const context = useContext(PulseContext);
  if (!context) throw new Error("PulseProvider is required");
  return context;
}
