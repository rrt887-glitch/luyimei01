import React from 'react';

/**
 * Dialogs are downloaded when first opened. If that download fails (flaky mobile network, or a new
 * deploy replaced the file), close the dialog and say so, instead of replacing the whole page with
 * an error screen.
 */
export class DialogBoundary extends React.Component<{ children: React.ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('Dialog failed to load:', error);
    this.props.onError(navigator.onLine === false ? '网络已断开，连上网络后再试。' : '窗口没能打开：网络不稳定或网站刚更新，请刷新页面后再试。');
    // Let the next attempt try again.
    setTimeout(() => this.setState({ failed: false }), 0);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
