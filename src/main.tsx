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


// iPhone full-screen handling is done with CSS dynamic viewport units (100dvh).
// Do not replace 100dvh with visualViewport pixel height: on iOS that can stop
// the app above the bottom safe area/Home indicator.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(reg => reg.unregister()));
}
if ("caches" in window) {
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("groza-")).map(k => caches.delete(k))));
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>
);
