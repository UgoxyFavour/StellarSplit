import { useEffect, useRef } from "react";
import { registerServiceWorker } from "./utils/sw-register";
import { SplitDetailPage } from "./pages/SplitView/SplitDetailPage";

function App() {
  const announceRef = useRef<HTMLDivElement>(null);

  // Function to announce messages to screen readers

  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <>
      {/* Live region for screen reader announcements */}
      <div
        ref={announceRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <main
        id="main-content"
        className="antialiased text-gray-900 bg-gray-50 min-h-screen"
        tabIndex={-1}
      >
        <SplitDetailPage />
      </main>
    </>
  );
}

export default App;
