import React from "react";

import { developerLogger } from "../../developer/logger";

import "../../styles/error-recovery.css";

interface ApplicationErrorBoundaryProps {
  children: React.ReactNode;
}

interface ApplicationErrorBoundaryState {
  error: Error | null;
  componentStack: string;
  copied: boolean;
  resetKey: number;
}

class ApplicationErrorBoundary extends React.Component<
  ApplicationErrorBoundaryProps,
  ApplicationErrorBoundaryState
> {
  state: ApplicationErrorBoundaryState = {
    error: null,
    componentStack: "",
    copied: false,
    resetKey: 0,
  };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ componentStack: errorInfo.componentStack ?? "" });
    developerLogger.error(
      "recovery.error-boundary",
      "A React component crashed",
      {
        error,
        componentStack: errorInfo.componentStack,
      }
    );
  }

  private getReport(): string {
    const { error, componentStack } = this.state;

    return [
      "Pioneer Work Suite recovery report",
      `Captured: ${new Date().toISOString()}`,
      error ? `${error.name}: ${error.message}` : "Unknown application error",
      error?.stack ?? null,
      componentStack ? `Component stack:${componentStack}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  private resetApplication = (): void => {
    this.setState((current) => ({
      error: null,
      componentStack: "",
      copied: false,
      resetKey: current.resetKey + 1,
    }));
  };

  private returnToDashboard = (): void => {
    window.location.hash = "#/dashboard";
    this.resetApplication();
  };

  private copyReport = async (): Promise<void> => {
    try {
      const report = this.getReport();

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = report;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();

        if (!document.execCommand("copy")) {
          throw new Error("The browser rejected the clipboard operation.");
        }

        textarea.remove();
      }

      this.setState({ copied: true });
    } catch (error) {
      developerLogger.error(
        "recovery.error-boundary",
        "Unable to copy the application recovery report",
        error
      );
      this.setState({ copied: false });
    }
  };

  render(): React.ReactNode {
    if (!this.state.error) {
      return (
        <React.Fragment key={this.state.resetKey}>
          {this.props.children}
        </React.Fragment>
      );
    }

    return (
      <main className="application-recovery" role="main">
        <section
          className="application-recovery__card"
          aria-labelledby="application-recovery-title"
        >
          <p className="application-recovery__eyebrow">Error recovery</p>
          <h1 id="application-recovery-title">
            Pioneer hit an unexpected problem
          </h1>
          <p>
            The failure was recorded in Developer Tools. Your locally stored
            tasks, documents, events, and queued changes have not been reset.
          </p>

          <div className="application-recovery__actions">
            <button type="button" onClick={this.resetApplication}>
              Try again
            </button>
            <button type="button" onClick={this.returnToDashboard}>
              Return to Dashboard
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              Reload application
            </button>
            <button type="button" onClick={() => void this.copyReport()}>
              {this.state.copied ? "Copied" : "Copy error details"}
            </button>
          </div>

          <details>
            <summary>Technical summary</summary>
            <pre>{this.state.error.message}</pre>
          </details>
        </section>
      </main>
    );
  }
}

export default ApplicationErrorBoundary;
