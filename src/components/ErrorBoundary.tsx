import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Recovery } from './Recovery';

interface Props {
  children: ReactNode;
  storageKey: string;
  /** Saves pending changes right after the crash (the state itself is fine most of the time). */
  onCrash?: (error: Error, componentStack: string) => void;
  /** Stops the app's store from saving, before a backup is written into its place. */
  onBeforeWrite?: () => void;
}

/**
 * A render error must never leave a white window: the recovery screen offers
 * a reload, earlier backups and a download of the data.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[todome] render crash', error, info.componentStack);
    try {
      this.props.onCrash?.(error, info.componentStack ?? '');
    } catch {
      /* the fallback must render regardless */
    }
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <Recovery reason="crash" storageKey={this.props.storageKey} onBeforeWrite={this.props.onBeforeWrite} detail={`${error.name}: ${error.message}\nVersion ${__APP_VERSION__}`} />;
  }
}
