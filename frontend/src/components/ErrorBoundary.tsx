import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught runtime error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          backgroundColor: "#101010",
          color: "#f5f5f5",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily: "monospace"
        }}>
          <div style={{
            maxWidth: "600px",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            padding: "24px",
            backgroundColor: "#171717",
            borderRadius: "4px"
          }}>
            <h2 style={{ color: "#a3ff12", margin: "0 0 12px" }}>// RUNTIME ERROR</h2>
            <p style={{ color: "#f87171", fontSize: "14px", margin: "0 0 16px" }}>
              {this.state.error?.message || "An unexpected error occurred while rendering the page."}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: "#a3ff12",
                color: "#101010",
                border: "none",
                padding: "8px 16px",
                fontWeight: "bold",
                cursor: "pointer",
                borderRadius: "2px"
              }}
            >
              RELOAD PAGE
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
