import { Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { SyncButton } from "./SyncButton";

interface HeaderProps {
  title?: string;
}

export function Header({ title = "Registro Ganadero" }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-gray-200 bg-green-700 px-4 py-3 text-white shadow-sm">
      <h1 className="text-lg font-bold tracking-tight">{title}</h1>
      <div className="flex items-center gap-2">
        <SyncButton />
        <Link
          to="/ajustes"
          className="rounded-full p-2 transition-colors hover:bg-green-600"
          aria-label="Ajustes"
        >
          <Settings size={22} />
        </Link>
      </div>
    </header>
  );
}
