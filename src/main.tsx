import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";

import { App } from "./App";
import { I18nProvider } from "./i18n";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      // Permission / index errors retry ne sudharat nahit.
      retry: (count, err) => count < 2 && !String((err as { code?: string })?.code).includes("permission"),
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <App />
      </I18nProvider>
      {/* Khali ujvikade Messaging dock — toasts tyachya var. */}
      <Toaster position="bottom-right" richColors closeButton theme="system" offset={{ bottom: 64, right: 16 }} mobileOffset={{ bottom: 80 }} />
    </QueryClientProvider>
  </StrictMode>,
);
