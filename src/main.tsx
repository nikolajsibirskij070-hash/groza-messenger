import React, { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error("ГРОЗА runtime error", error, info); }
  render() {
    if (this.state.error) return <div className="runtime-error"><div><h1>ГРОЗА</h1><p>Не удалось запустить приложение.</p><small>{this.state.error.message}</small><button onClick={() => location.reload()}>Перезагрузить</button></div></div>;
    return this.props.children;
  }
}


// PWA + Web Push. The service worker stays installed so push messages can be
// displayed while the site is closed (the browser/OS still controls delivery).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(err => console.warn("Service worker error", err));
  });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>
);
