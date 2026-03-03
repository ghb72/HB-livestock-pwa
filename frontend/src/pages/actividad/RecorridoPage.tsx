import { useCallback, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  MapPin,
  Save,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { db } from "../../db";
import { generateId, now, currentUserId } from "../../db/helpers";
import { Card } from "../../components/ui";
import type { Animal } from "../../types";

/**
 * Roundup page — deck-style checklist for field patrols.
 *
 * The cowboy checks off each animal seen during the roundup.
 * Animals are grouped in real-time: "Observados" and "No observados".
 * Each animal has an inline notes field for quick annotations.
 */
export default function RecorridoPage() {
  const navigate = useNavigate();

  // Date defaults to today, can be changed for past roundups
  const [fecha, setFecha] = useState(format(new Date(), "yyyy-MM-dd"));
  const [seen, setSeen] = useState<Map<string, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const [showNotSeen, setShowNotSeen] = useState(true);
  const [showSeen, setShowSeen] = useState(true);

  // Only alive animals
  const animals =
    useLiveQuery(() =>
      db.animals.where("estado").equals("Vivo(a)").sortBy("nombre"),
    ) ?? [];

  const seenCount = seen.size;
  const totalCount = animals.length;

  const toggleAnimal = useCallback((animalId: string) => {
    setSeen((prev) => {
      const next = new Map(prev);
      if (next.has(animalId)) {
        next.delete(animalId);
      } else {
        next.set(animalId, "");
      }
      return next;
    });
  }, []);

  const updateNote = useCallback((animalId: string, note: string) => {
    setSeen((prev) => {
      const next = new Map(prev);
      next.set(animalId, note);
      return next;
    });
  }, []);

  const { observed, notObserved } = useMemo(() => {
    const obs: Animal[] = [];
    const notObs: Animal[] = [];
    for (const animal of animals) {
      if (seen.has(animal.animal_id)) {
        obs.push(animal);
      } else {
        notObs.push(animal);
      }
    }
    return { observed: obs, notObserved: notObs };
  }, [animals, seen]);

  const handleSave = async () => {
    if (seenCount === 0) return;
    setSaving(true);

    try {
      const recorridoId = generateId("REC");
      const timestamp = now();
      const userId = currentUserId();

      const entries = Array.from(seen.entries()).map(
        ([animalId, notas]) => ({
          recorrido_id: recorridoId,
          fecha,
          animal_id: animalId,
          notas,
          _sync_status: "pending" as const,
          created_by: userId,
          updated_at: timestamp,
          created_at: timestamp,
        }),
      );

      await db.recorridos.bulkAdd(entries);
      navigate("/actividad/recorridos");
    } finally {
      setSaving(false);
    }
  };

  const formatToday = () => {
    try {
      return format(new Date(fecha), "EEEE d 'de' MMMM", { locale: es });
    } catch {
      return fecha;
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-24">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <MapPin size={22} className="text-green-600" />
          <h2 className="text-xl font-bold text-gray-800">
            Recorrido de campo
          </h2>
        </div>
        <p className="mt-1 text-sm capitalize text-gray-500">
          {formatToday()}
        </p>
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-600">Fecha:</label>
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {/* Progress bar */}
      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">
            Progreso del recorrido
          </span>
          <span className="text-lg font-bold text-green-600">
            {seenCount}
            <span className="text-sm font-normal text-gray-400">
              /{totalCount}
            </span>
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-300"
            style={{
              width: `${totalCount > 0 ? (seenCount / totalCount) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Not observed section */}
      <section>
        <button
          onClick={() => setShowNotSeen(!showNotSeen)}
          className="mb-2 flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <EyeOff size={18} className="text-red-500" />
            <span className="text-sm font-semibold text-gray-700">
              No observados ({notObserved.length})
            </span>
          </div>
          {showNotSeen ? (
            <ChevronUp size={18} className="text-gray-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-400" />
          )}
        </button>
        {showNotSeen && (
          <div className="space-y-1.5">
            {notObserved.map((animal) => (
              <AnimalCheckCard
                key={animal.animal_id}
                animal={animal}
                checked={false}
                note=""
                onToggle={() => toggleAnimal(animal.animal_id)}
                onNoteChange={() => {}}
              />
            ))}
            {notObserved.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">
                ¡Todos los animales fueron observados! 🎉
              </p>
            )}
          </div>
        )}
      </section>

      {/* Observed section */}
      <section>
        <button
          onClick={() => setShowSeen(!showSeen)}
          className="mb-2 flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Eye size={18} className="text-green-600" />
            <span className="text-sm font-semibold text-gray-700">
              Observados ({observed.length})
            </span>
          </div>
          {showSeen ? (
            <ChevronUp size={18} className="text-gray-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-400" />
          )}
        </button>
        {showSeen && (
          <div className="space-y-1.5">
            {observed.map((animal) => (
              <AnimalCheckCard
                key={animal.animal_id}
                animal={animal}
                checked={true}
                note={seen.get(animal.animal_id) ?? ""}
                onToggle={() => toggleAnimal(animal.animal_id)}
                onNoteChange={(note) =>
                  updateNote(animal.animal_id, note)
                }
              />
            ))}
            {observed.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">
                Marca los animales que vayas viendo.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Floating save button */}
      <div className="fixed inset-x-0 bottom-16 z-20 px-4 pb-4">
        <div className="mx-auto max-w-lg">
          <button
            onClick={handleSave}
            disabled={saving || seenCount === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-4 text-lg font-bold text-white shadow-lg transition-colors active:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500"
          >
            <Save size={22} />
            {saving
              ? "Guardando..."
              : `Guardar recorrido (${seenCount} animales)`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Individual animal card with check toggle and inline notes. */
function AnimalCheckCard({
  animal,
  checked,
  note,
  onToggle,
  onNoteChange,
}: {
  animal: Animal;
  checked: boolean;
  note: string;
  onToggle: () => void;
  onNoteChange: (note: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3">
        {/* Check toggle */}
        <button
          onClick={onToggle}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors ${
            checked
              ? "bg-green-600 text-white"
              : "border-2 border-gray-300 bg-white text-transparent"
          }`}
          aria-label={
            checked ? "Desmarcar animal" : "Marcar animal como visto"
          }
        >
          <Check size={20} strokeWidth={3} />
        </button>

        {/* Animal info */}
        <div className="min-w-0 flex-1" onClick={onToggle}>
          <div className="flex items-center gap-2">
            <span
              className={`truncate font-semibold ${
                checked ? "text-green-700" : "text-gray-800"
              }`}
            >
              {animal.nombre || "Sin nombre"}
            </span>
            <span className="shrink-0 text-xs text-gray-400">
              #{animal.arete_id || "—"}
            </span>
          </div>
          <div className="flex gap-2 text-xs text-gray-500">
            <span>{animal.tipo}</span>
            <span>{animal.sexo}</span>
            {animal.raza && <span>· {animal.raza}</span>}
          </div>
        </div>
      </div>

      {/* Inline notes — only shown when checked */}
      {checked && (
        <div className="mt-2 border-t border-gray-100 pt-2">
          <input
            type="text"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder="Nota rápida (opcional)..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-green-500 focus:outline-none"
          />
        </div>
      )}
    </Card>
  );
}
