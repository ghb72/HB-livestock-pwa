import { useLiveQuery } from "dexie-react-hooks";
import { Beef, HeartPulse, Baby, DollarSign, Plus, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { db } from "../../db";
import { Card } from "../../components/ui";

/**
 * Dashboard — quick stats overview and shortcut actions.
 */
export default function DashboardPage() {
  const totalAnimals = useLiveQuery(() => db.animals.count()) ?? 0;
  const aliveAnimals =
    useLiveQuery(() =>
      db.animals.where("estado").equals("Vivo(a)").count(),
    ) ?? 0;
  const healthEvents =
    useLiveQuery(() => db.health.count()) ?? 0;
  const reproEvents =
    useLiveQuery(() => db.reproduction.count()) ?? 0;
  const salesCount =
    useLiveQuery(() => db.sales.count()) ?? 0;

  const stats = [
    {
      label: "Animales vivos",
      value: aliveAnimals,
      total: totalAnimals,
      icon: Beef,
      color: "text-green-600 bg-green-100",
    },
    {
      label: "Eventos de salud",
      value: healthEvents,
      icon: HeartPulse,
      color: "text-blue-600 bg-blue-100",
    },
    {
      label: "Reproducción",
      value: reproEvents,
      icon: Baby,
      color: "text-pink-600 bg-pink-100",
    },
    {
      label: "Ventas",
      value: salesCount,
      icon: DollarSign,
      color: "text-amber-600 bg-amber-100",
    },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Bienvenido</h2>
        <p className="text-sm text-gray-500">Resumen de tu rancho</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ label, value, total, icon: Icon, color }) => (
          <Card key={label} className="flex items-center gap-3">
            <div className={`rounded-xl p-2.5 ${color}`}>
              <Icon size={22} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">
                {value}
                {total !== undefined && (
                  <span className="text-sm font-normal text-gray-400">
                    /{total}
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Acciones rápidas
        </h3>
        <div className="space-y-3">
          {/* Primary action — full width */}
          <Link
            to="/actividad/recorrido/nuevo"
            className="flex items-center gap-3 rounded-xl bg-green-700 px-4 py-4 text-white shadow-md transition-colors active:bg-green-800"
          >
            <MapPin size={22} />
            <div>
              <span className="text-lg font-bold">Iniciar recorrido</span>
              <p className="text-xs text-green-200">
                Registra los animales que observes en campo
              </p>
            </div>
          </Link>
          {/* Secondary actions — grid */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/ganado/nuevo"
              className="flex items-center gap-3 rounded-xl bg-green-600 px-4 py-4 text-white shadow-sm transition-colors active:bg-green-700"
            >
              <Plus size={20} />
              <span className="font-semibold">Registrar animal</span>
            </Link>
            <Link
              to="/actividad/salud/nuevo"
              className="flex items-center gap-3 rounded-xl bg-blue-600 px-4 py-4 text-white shadow-sm transition-colors active:bg-blue-700"
            >
              <HeartPulse size={20} />
              <span className="font-semibold">Evento de salud</span>
            </Link>
            <Link
              to="/actividad/reproduccion/nuevo"
              className="flex items-center gap-3 rounded-xl bg-pink-600 px-4 py-4 text-white shadow-sm transition-colors active:bg-pink-700"
            >
              <Baby size={20} />
              <span className="font-semibold">Monta / Parto</span>
            </Link>
            <Link
              to="/ventas/nuevo"
              className="flex items-center gap-3 rounded-xl bg-amber-600 px-4 py-4 text-white shadow-sm transition-colors active:bg-amber-700"
            >
              <DollarSign size={20} />
              <span className="font-semibold">Registrar venta</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
