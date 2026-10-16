import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Shared empty, loading and section pieces. An empty screen is an invitation
 * to act, so every one of these says what the thing is and what to do next.
 */

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon?: LucideIcon | undefined;
  title: string;
  hint?: string | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="empty">
      {Icon && (
        <div className="empty-icon">
          <Icon />
        </div>
      )}
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action && <div className="actions">{action}</div>}
    </div>
  );
}

/** Empty state inside its own panel, for a page body with nothing in it yet. */
export function EmptyPanel(props: Parameters<typeof EmptyState>[0]) {
  return (
    <section className="glass-panel">
      <EmptyState {...props} />
    </section>
  );
}

/** Placeholder cards while a list loads, so the page keeps its shape. */
export function LoadingGrid({
  count = 6,
  className = "lib-grid",
  height = 150,
}: {
  count?: number;
  className?: string;
  height?: number;
}) {
  return (
    <div className={className} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

export function LoadingRows({ count = 3, height = 72 }: { count?: number; height?: number }) {
  return (
    <div className="clip-jobs" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

/** A heading with optional description and right-aligned actions. */
export function SectionHead({
  title,
  hint,
  actions,
}: {
  title: string;
  hint?: string | undefined;
  actions?: ReactNode | undefined;
}) {
  return (
    <div className="section-head">
      <div className="min-w-0">
        <h2>{title}</h2>
        {hint && <p className="caption">{hint}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
