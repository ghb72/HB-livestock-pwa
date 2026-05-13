import { Database, Wifi, WifiOff, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { db } from "../../db";
import { Card } from "../../components/ui";

/**
 * Settings page — connection status, data stats, and database management.
 */
export default function SettingsPage() {
  const navigate = useNavigate();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const animalCount = useLiveQuery(() => db.animals.count()) ?? 0;
  const healthCount = useLiveQuery(() => db.health.count()) ?? 0;
  const reproCount = useLiveQuery(() => db.reproduction.count()) ?? 0;
  const obsCount = useLiveQuery(() => db.observations.count()) ?? 0;
  const salesCount = useLiveQuery(() => db.sales.count()) ?? 0;

  const pendingCount = useLiveQuery(async () => {
    const tables = [db.animals, db.health, db.reproduction, db.observations, db.sales];
    let total = 0;
    for (const table of tables) {
      total += await table.where("_sync_status").equals("pending").count();
    }
    return total;
  }) ?? 0;

  const handleClearData = async () => {
    if (
      !confirm(
        "⚠️ ¿Estás seguro? Esto eliminará TODOS los datos locales. Esta acción no se puede deshacer.",
      )
    )
      return;

    await db.delete();
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full p-2 text-gray-600 hover:bg-gray-200"
          aria-label="Volver"
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800">Ajustes</h2>
      </div>

      {/* Connection status */}
      <Card className="flex items-center gap-3">
        {online ? (
          <Wifi size={24} className="text-green-600" />
        ) : (
          <WifiOff size={24} className="text-red-500" />
        )}
        <div>
          <p className="font-semibold text-gray-800">
            {online ? "Conectado" : "Sin conexión"}
          </p>
          <p className="text-sm text-gray-500">
            {online
              ? "Puedes sincronizar tus datos"
              : "Los datos se guardan localmente"}
          </p>
        </div>
      </Card>

      {/* Data stats */}
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <Database size={20} className="text-gray-500" />
          <h3 className="font-semibold text-gray-800">Datos locales</h3>
        </div>
        <div className="space-y-2 text-sm">
          <DataRow label="Animales" count={animalCount} />
          <DataRow label="Eventos de salud" count={healthCount} />
          <DataRow label="Reproducción" count={reproCount} />
          <DataRow label="Observaciones" count={obsCount} />
          <DataRow label="Ventas" count={salesCount} />
          <div className="border-t pt-2">
            <DataRow
              label="Pendientes de sincronizar"
              count={pendingCount}
              highlight
            />
          </div>
        </div>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <h3 className="mb-2 font-semibold text-red-700">Zona de peligro</h3>
        <p className="mb-3 text-sm text-gray-500">
          Eliminar todos los datos locales del dispositivo.
        </p>
        <button
          onClick={handleClearData}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors active:bg-red-700"
        >
          <Trash2 size={16} />
          Borrar todos los datos
        </button>
      </Card>

      {/* App info */}
      <div className="text-center text-xs text-gray-400">
        <p>Registro Ganadero v1.0.0</p>
        <p>Datos almacenados en IndexedDB (offline)</p>
      </div>
    </div>
  );
}

function DataRow({
  label,
  count,
  highlight = false,
}: {
  label: string;
  count: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-600">{label}</span>
      <span
        className={`font-semibold ${highlight && count > 0 ? "text-amber-600" : "text-gray-800"}`}
      >
        {count}
      </span>
    </div>
  );
}
