import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { syncAll } from "../../services/sync";

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  // Listen for online/offline events
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => setOnline(true));
    window.addEventListener("offline", () => setOnline(false));
  }

  const handleSync = async () => {
    if (syncing || !online) return;
    setSyncing(true);
    try {
      await syncAll();
    } catch {
      // Sync errors are handled silently for now
    } finally {
      setSyncing(false);
    }
  };

  return (
    <button
      onClick={handleSync}
      disabled={!online || syncing}
      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        online
          ? "bg-green-600 text-white hover:bg-green-500"
          : "bg-gray-500 text-gray-200"
      }`}
      title={online ? "Sincronizar datos" : "Sin conexión"}
    >
      <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
      <span className="hidden sm:inline">
        {syncing ? "Sincronizando..." : online ? "Sincronizar" : "Offline"}
      </span>
    </button>
  );
}
