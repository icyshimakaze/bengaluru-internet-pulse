"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { DashboardData } from "@/lib/domain/read-models";
import { pulseMetadata, type PulseMetadata } from "@/lib/trends/dashboard-presentation";

const MetadataContext = createContext<PulseMetadata | null>(null);
const ClockContext = createContext<number | null>(null);
const PublishContext = createContext<((pulse: DashboardData) => void) | null>(null);

export function PulseProvider({ initialPulse, children }: { initialPulse: PulseMetadata; children?: React.ReactNode }) {
  const [pulse, setPulse] = useState(initialPulse);
  const [now, setNow] = useState(Date.parse(initialPulse.evaluatedAt));
  const publish = useCallback((next: DashboardData) => { setPulse(pulseMetadata(next)); setNow(Date.now()); }, []);
  useEffect(() => {
    if (pulse.mode !== "live") return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [pulse.mode]);
  return <PublishContext.Provider value={publish}><MetadataContext.Provider value={pulse}><ClockContext.Provider value={now}>{children}</ClockContext.Provider></MetadataContext.Provider></PublishContext.Provider>;
}
export function usePulseMetadata() {
  const pulse = useContext(MetadataContext);
  if (!pulse) throw new Error("PulseProvider is required");
  return pulse;
}
export function usePublishPulse() {
  const publish = useContext(PublishContext);
  if (!publish) throw new Error("PulseProvider is required");
  return publish;
}
export function usePulseStatus() {
  const pulse = usePulseMetadata(), now = useContext(ClockContext), publish = usePublishPulse();
  if (now === null) throw new Error("PulseProvider is required");
  return { pulse, now, publish };
}
