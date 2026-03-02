import { Outlet } from "react-router-dom";
import { Header, BottomNav } from "../components/ui";

/**
 * Root layout — persistent header, bottom nav, and scrollable content area.
 * Adds safe-area padding for iOS PWA and bottom nav clearance.
 */
export default function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-green-50">
      <Header />
      <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
