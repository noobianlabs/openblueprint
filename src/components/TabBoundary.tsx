"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * One error boundary per project view.
 *
 * A design package can arrive from anywhere — a share link, a model, an old
 * record in this browser — so any single view can hit something it cannot
 * render. Without a boundary that throw unmounts the whole tree and the app
 * white-screens; with one, the failure is contained to the view that raised
 * it and the other five keep working.
 *
 * The error is re-reported to `console.error` on the way through: a boundary
 * that silently absorbs a stack trace makes the console useless exactly when
 * it is needed most.
 */

interface Props {
  /** Human name of the view being wrapped, e.g. "Wiring" — shown to the user. */
  view: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class TabBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the console diagnostic — the fallback is for the user, not for us.
    console.error(`[TabBoundary] the ${this.props.view} view failed to render`, error, info.componentStack);
  }

  /** Re-mount the children and let them try again. */
  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="px-5 py-10">
        <div className="mx-auto w-full max-w-md rounded-md border border-line bg-bg-card p-6 text-center">
          <p className="microlabel mb-2 text-ink">{this.props.view.toUpperCase()} VIEW COULD NOT BE DRAWN</p>
          <p className="mb-4 text-[13px] leading-relaxed text-ink-dim">
            Something in this design stopped the {this.props.view} view from
            rendering. The rest of the design is unaffected — the other views
            should still open.
          </p>
          <p className="mb-5 font-mono text-[11px] break-words text-ink-faint">
            {error.message || "unknown error"}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.reset}
              className="microlabel rounded-sm border border-line px-3 py-1.5 text-accent hover:border-line-strong"
            >
              ↻ Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
