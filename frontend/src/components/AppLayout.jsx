import { useLocation } from "react-router-dom";
import Nav from "./Nav";
import Header from "./Header";
import { PageTransition } from "./ui/motion";

/**
 * App shell: fixed sidebar rail, sticky header, and a routed content column.
 * The decorative grid and warm wash sit behind the content and never scroll
 * with layout-shifting effects.
 */
export default function AppLayout({ children }) {
  const location = useLocation();

  return (
    <div className="relative flex min-h-[100dvh] bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="grain-overlay" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-grid opacity-70 dark:opacity-40"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(50% 40% at 15% 0%, rgba(245, 158, 11, 0.07), transparent 70%), radial-gradient(40% 40% at 100% 100%, rgba(99, 102, 241, 0.06), transparent 70%)",
        }}
      />

      <Nav />

      <div className="relative z-10 flex min-h-[100dvh] min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <PageTransition routeKey={location.pathname}>{children}</PageTransition>
          </div>
        </main>
        <footer className="px-6 pb-6 text-[11px] text-stone-400 dark:text-stone-500">
          <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-2 border-t border-stone-200/70 pt-4 dark:border-stone-800">
            <span>Sri Sai Dharma Samrakshana Prema Kuteeram</span>
            <span>Trust CRM</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
