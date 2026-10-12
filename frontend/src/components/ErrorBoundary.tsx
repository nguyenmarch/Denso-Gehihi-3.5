import { tr } from '../i18n';
import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  title?: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState { error: Error | null; }

// Keeps a render crash in one panel from blanking the whole page.
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('UI render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="state-box error" role="alert">
        <AlertTriangle size={20} />
        <strong>{this.props.title ?? tr("Không thể hiển thị phần này")}</strong>
        <p>{this.state.error.message}</p>
        <button type="button" className="ghost-button" onClick={() => this.setState({ error: null })}>{tr("Thử lại")}</button>
      </div>
    );
  }
}
