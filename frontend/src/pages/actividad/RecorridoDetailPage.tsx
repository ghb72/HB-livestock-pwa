import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, Eye, EyeOff, X } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { db } from "../../db";
import { Card } from "../../components/ui";

/**
 * Read-only view of a past roundup — shows which animals were
 * observed and which were not, along with any notes.
 */
export default function RecorridoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const data = useLiveQuery(async () => {
    if (!id) return null;

    const entries = await db.recorridos
      .where("recorrido_id")
      .equals(id)
      .toArray();

    if (entries.length === 0) return null;

    const allAlive = await db.animals
      .where("estado")
      .equals("Vivo(a)")
      .toArray();

    const seenIds = new Set(entries.map((e) => e.animal_id));

    const animalsMap = new Map(
      allAlive.map((a) => [a.animal_id, a]),
    );

    const observed = entries
      .map((e) => ({
        animal: animalsMap.get(e.animal_id),
        note: e.notas,
      }))
      .filter((e) => e.animal != null);

    const notObserved = allAlive.filter(
      (a) => !seenIds.has(a.animal_id),
    );

    return {
      fecha: entries[0].fecha,
      recorridoId: id,
      observed,
      notObserved,
      total: allAlive.length,
    };
  }, [id]);

  if (!data) {
    return (
      <div className="py-12 text-center text-gray-400">Cargando...</div>
    );
  }

  const percentage =
    data.total > 0
      ? Math.round((data.observed.length / data.total) * 100)
      : 0;

  const formatDate = (dateStr: string) => {
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
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-lg p-1 text-gray-600 active:bg-gray-100"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            Recorrido {data.recorridoId}
          </h2>
          <p className="text-sm capitalize text-gray-500">
            {formatDate(data.fecha)}
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Animales observados</span>
          <span className="text-xl font-bold text-green-600">
            {data.observed.length}
            <span className="text-sm text-gray-400">/{data.total}</span>
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({percentage}%)
            </span>
          </span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-green-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Observed */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Eye size={18} className="text-green-600" />
          <span className="text-sm font-semibold text-gray-700">
            Observados ({data.observed.length})
          </span>
        </div>
        <div className="space-y-1.5">
          {data.observed.map(({ animal, note }) => (
            <Card
              key={animal!.animal_id}
              className="flex items-center gap-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                <Check size={16} strokeWidth={3} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-gray-800">
                  {animal!.nombre || "Sin nombre"}
                </span>
                <span className="ml-2 text-xs text-gray-400">
                  #{animal!.arete_id || "—"}
                </span>
                {note && (
                  <p className="text-xs text-gray-500">{note}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Not observed */}
      {data.notObserved.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <EyeOff size={18} className="text-red-500" />
            <span className="text-sm font-semibold text-gray-700">
              No observados ({data.notObserved.length})
            </span>
          </div>
          <div className="space-y-1.5">
            {data.notObserved.map((animal) => (
              <Card
                key={animal.animal_id}
                className="flex items-center gap-3 opacity-60"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-400">
                  <X size={16} strokeWidth={3} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-gray-700">
                    {animal.nombre || "Sin nombre"}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    #{animal.arete_id || "—"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
