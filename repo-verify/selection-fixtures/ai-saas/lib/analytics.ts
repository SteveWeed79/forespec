// Client analytics helper — a decoy. No LLM, BaaS, or security surface.
export function track(event: string, props: Record<string, unknown>) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("analytics", { detail: { event, props } }));
}
