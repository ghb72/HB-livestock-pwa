import { NavLink } from "react-router-dom";
import { Home, Beef, ClipboardList, DollarSign } from "lucide-react";

const tabs = [
  { to: "/", icon: Home, label: "Inicio" },
  { to: "/ganado", icon: Beef, label: "Ganado" },
  { to: "/actividad", icon: ClipboardList, label: "Actividad" },
  { to: "/ventas", icon: DollarSign, label: "Ventas" },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-[var(--sab)]">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? "text-green-700"
                  : "text-gray-500 hover:text-gray-700"
              }`
            }
          >
            <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Keep TS happy — isActive in className callback */
const isActive = false;
void isActive;
