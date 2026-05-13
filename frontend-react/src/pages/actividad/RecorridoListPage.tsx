import { useLiveQuery } from "dexie-react-hooks";
import { Calendar, ChevronRight, MapPin, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { db } from "../../db";
import { Card, EmptyState } from "../../components/ui";

/**
 * Roundup history — lists past field patrols grouped by recorrido_id.
 * Shows date, animal count, and links to detail or start a new one.
 */
export default function RecorridoListPage() {
  const navigate = useNavigate();

  const recorridos = useLiveQuery(async () => {
    const all = await db.recorridos.toArray();
    const totalAlive = await db.animals
      .where("estado")
      .equals("Vivo(a)")
      .count();

    // Group by recorrido_id
    const grouped = new Map<
      string,
      { id: string; fecha: string; count: number; animals: string[] }
    >();
    for (const entry of all) {
      const existing = grouped.get(entry.recorrido_id);
      if (existing) {
        existing.count += 1;
        existing.animals.push(entry.animal_id);
      } else {
        grouped.set(entry.recorrido_id, {
          id: entry.recorrido_id,
          fecha: entry.fecha,
          count: 1,
          animals: [entry.animal_id],
        });
      }
    }

    // Sort by date descending
    const list = Array.from(grouped.values()).sort((a, b) =>
      b.fecha.localeCompare(a.fecha),
    );

    return { list, totalAlive };
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      return format(new Date(dateStr), "EEEE d 'de' MMMM, yyyy", {
        locale: es,
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Recorridos</h2>
          <p className="text-xs text-gray-500">
            Historial de visitas al potrero
          </p>
        </div>
        <Link
          to="/actividad/recorrido/nuevo"
          className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors active:bg-green-700"
        >
          <Plus size={18} />
          Nuevo
        </Link>
      </div>

      {/* Roundup list */}
      {recorridos && recorridos.list.length > 0 ? (
        <div className="space-y-2">
          {recorridos.list.map((rec) => {
            const percentage =
              recorridos.totalAlive > 0
                ? Math.round((rec.count / recorridos.totalAlive) * 100)
                : 0;
            return (
              <Card
                key={rec.id}
                onClick={() =>
                  navigate(`/actividad/recorrido/${rec.id}`)
                }
                className="flex items-center gap-3"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-100">
                  <Calendar size={20} className="text-green-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold capitalize text-gray-800">
                    {formatDate(rec.fecha)}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                    <span>
                      {rec.count} de {recorridos.totalAlive} animales
                    </span>
                    <span
                      className={`font-semibold ${
                        percentage >= 80
                          ? "text-green-600"
                          : percentage >= 50
                            ? "text-amber-600"
                            : "text-red-500"
                      }`}
                    >
                      {percentage}%
                    </span>
                  </div>
                  {/* Mini progress bar */}
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        percentage >= 80
                          ? "bg-green-500"
                          : percentage >= 50
                            ? "bg-amber-500"
                            : "bg-red-400"
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-400" />
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<MapPin size={56} />}
          title="Sin recorridos"
          description="Inicia tu primer recorrido de campo para registrar los animales que observes."
          action={
            <Link
              to="/actividad/recorrido/nuevo"
              className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white shadow-sm"
            >
              Iniciar recorrido
            </Link>
          }
        />
      )}
    </div>
  );
}
