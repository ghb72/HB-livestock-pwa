import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Save,
  Check,
  StickyNote,
  X,
  Loader2,
} from "lucide-react";
import { db } from "../../db";
import { generateId, now, currentUserId } from "../../db/helpers";
import { FormField } from "../../components/ui";
import type {
  Animal,
  HealthRecord,
  TipoEventoSalud,
  EstadoGeneral,
} from "../../types";

const TIPOS_EVENTO: TipoEventoSalud[] = [
  "Vacuna",
  "Desparasitación",
  "Vitamina",
  "Enfermedad",
  "Tratamiento",
  "Revisión",
];

const ESTADOS_GENERAL: EstadoGeneral[] = ["Fuerte", "Flaco", "Enfermo"];

/** Per-event-type product & dose info. */
interface EventConfig {
  producto: string;
  dosis: string;
}

/** Per-animal row state. */
interface AnimalRow {
  checked: Record<string, boolean>; // keyed by tipo_evento
  estado_general: EstadoGeneral;
  nota: string;
  noteOpen: boolean;
}

/**
 * Batch health event page — apply health events to many animals at once.
 *
 * Top: multi-select event types → per-type product/dose fields + next application date.
 * Middle: checklist of alive animals with one check column per event type.
 * Bottom: save all records in a single transaction.
 */
export default function BatchHealthPage() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // ── Global form state ──
  const [selectedTypes, setSelectedTypes] = useState<TipoEventoSalud[]>([]);
  const [eventConfigs, setEventConfigs] = useState<
    Record<string, EventConfig>
  >({});
  const [proximaAplicacion, setProximaAplicacion] = useState("");
  const [fecha, setFecha] = useState(
    () => new Date().toISOString().split("T")[0],
  );

  // ── Animal data ──
  const animals =
    useLiveQuery(() =>
      db.animals.where("estado").equals("Vivo(a)").sortBy("nombre"),
    ) ?? [];

  // ── Per-animal row state (lazy init keyed by animal_id) ──
  const [rows, setRows] = useState<Record<string, AnimalRow>>({});

  const getRow = useCallback(
    (id: string): AnimalRow =>
      rows[id] ?? {
        checked: {},
        estado_general: "Fuerte" as EstadoGeneral,
        nota: "",
        noteOpen: false,
      },
    [rows],
  );

  const updateRow = useCallback(
    (id: string, patch: Partial<AnimalRow>) =>
      setRows((prev) => ({
        ...prev,
        [id]: { ...getRow(id), ...patch },
      })),
    [getRow],
  );

  // ── Event type toggle ──
  const toggleType = (tipo: TipoEventoSalud) => {
    setSelectedTypes((prev) =>
      prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo],
    );
    // Ensure config entry exists
    setEventConfigs((prev) => ({
      ...prev,
      [tipo]: prev[tipo] ?? { producto: "", dosis: "" },
    }));
  };

  const updateConfig = (tipo: string, field: keyof EventConfig, value: string) =>
    setEventConfigs((prev) => ({
      ...prev,
      [tipo]: { ...prev[tipo], [field]: value },
    }));

  // ── Toggle individual animal check ──
  const toggleAnimalCheck = (animalId: string, tipo: string) => {
    const row = getRow(animalId);
    updateRow(animalId, {
      checked: { ...row.checked, [tipo]: !row.checked[tipo] },
    });
  };

  // ── Toggle all animals for a given type ──
  const allChecked = useCallback(
    (tipo: string) =>
      animals.length > 0 &&
      animals.every((a) => getRow(a.animal_id).checked[tipo]),
    [animals, getRow],
  );

  const toggleAll = (tipo: string) => {
    const shouldCheck = !allChecked(tipo);
    setRows((prev) => {
      const next = { ...prev };
      animals.forEach((a) => {
        const row = next[a.animal_id] ?? {
          checked: {},
          estado_general: "Fuerte" as EstadoGeneral,
          nota: "",
          noteOpen: false,
        };
        next[a.animal_id] = {
          ...row,
          checked: { ...row.checked, [tipo]: shouldCheck },
        };
      });
      return next;
    });
  };

  // ── Count of records that will be created ──
  const recordCount = useMemo(() => {
    let count = 0;
    animals.forEach((a) => {
      const row = getRow(a.animal_id);
      selectedTypes.forEach((tipo) => {
        if (row.checked[tipo]) count++;
      });
    });
    return count;
  }, [animals, rows, selectedTypes, getRow]);

  // ── Save ──
  const handleSave = async () => {
    if (saving || recordCount === 0) return;
    setSaving(true);

    try {
      const timestamp = now();
      const userId = currentUserId();
      const records: HealthRecord[] = [];

      for (const animal of animals) {
        const row = getRow(animal.animal_id);
        for (const tipo of selectedTypes) {
          if (!row.checked[tipo]) continue;

          const config = eventConfigs[tipo] ?? { producto: "", dosis: "" };
          records.push({
            salud_id: generateId("SAL"),
            animal_id: animal.animal_id,
            fecha,
            tipo_evento: tipo,
            producto: config.producto,
            dosis: config.dosis,
            estado_general: row.estado_general,
            proxima_aplicacion: proximaAplicacion,
            notas: row.nota,
            created_by: userId,
            updated_at: timestamp,
            created_at: timestamp,
            _sync_status: "pending",
          });
        }
      }

      await db.health.bulkAdd(records);
      navigate(-1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full p-2 text-gray-600 hover:bg-gray-200"
          aria-label="Volver"
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800">
          Evento de salud masivo
        </h2>
      </div>

      {/* ── Event type multi-selector ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-sm font-semibold text-gray-700">
          Tipo de evento
        </p>
        <div className="flex flex-wrap gap-2">
          {TIPOS_EVENTO.map((tipo) => {
            const active = selectedTypes.includes(tipo);
            return (
              <button
                key={tipo}
                type="button"
                onClick={() => toggleType(tipo)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                {tipo}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Per-type product & dose ── */}
      {selectedTypes.length > 0 && (
        <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          {selectedTypes.map((tipo) => {
            const config = eventConfigs[tipo] ?? { producto: "", dosis: "" };
            return (
              <div key={tipo}>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-blue-600">
                  {tipo}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <FormField
                    label="Producto"
                    name={`producto-${tipo}`}
                    value={config.producto}
                    onChange={(v) => updateConfig(tipo, "producto", v)}
                    placeholder="Ej: Ivermectina"
                  />
                  <FormField
                    label="Dosis"
                    name={`dosis-${tipo}`}
                    value={config.dosis}
                    onChange={(v) => updateConfig(tipo, "dosis", v)}
                    placeholder="Ej: 5 ml"
                  />
                </div>
              </div>
            );
          })}

          <div className="grid grid-cols-2 gap-2">
            <FormField
              label="Fecha del evento"
              name="fecha"
              type="date"
              value={fecha}
              onChange={setFecha}
            />
            <FormField
              label="Próxima aplicación"
              name="proxima_aplicacion"
              type="date"
              value={proximaAplicacion}
              onChange={setProximaAplicacion}
            />
          </div>
        </section>
      )}

      {/* ── Animal checklist ── */}
      {selectedTypes.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {/* Table header */}
          <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
            <span className="flex-1">Animal</span>
            {selectedTypes.map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => toggleAll(tipo)}
                className="w-12 text-center"
                title={`Marcar/desmarcar todos — ${tipo}`}
              >
                {shortLabel(tipo)}
              </button>
            ))}
            <span className="w-20 text-center">Estado</span>
            <span className="w-8" />
          </div>

          {/* Animal rows */}
          <div className="max-h-[50vh] divide-y divide-gray-100 overflow-y-auto">
            {animals.map((animal) => (
              <AnimalCheckRow
                key={animal.animal_id}
                animal={animal}
                selectedTypes={selectedTypes}
                row={getRow(animal.animal_id)}
                onToggle={(tipo) =>
                  toggleAnimalCheck(animal.animal_id, tipo)
                }
                onChangeEstado={(v) =>
                  updateRow(animal.animal_id, {
                    estado_general: v as EstadoGeneral,
                  })
                }
                onToggleNote={() =>
                  updateRow(animal.animal_id, {
                    noteOpen: !getRow(animal.animal_id).noteOpen,
                  })
                }
                onChangeNote={(v) =>
                  updateRow(animal.animal_id, { nota: v })
                }
              />
            ))}
            {animals.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400">
                No hay animales vivos registrados.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Save button ── */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || recordCount === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-blue-700 disabled:opacity-50"
      >
        {saving ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <Save size={20} />
        )}
        {saving
          ? "Guardando..."
          : `Guardar ${recordCount} registro${recordCount !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}

// ── Helper: short column label for event types ──

function shortLabel(tipo: TipoEventoSalud): string {
  const map: Record<TipoEventoSalud, string> = {
    Vacuna: "Vac",
    Desparasitación: "Des",
    Vitamina: "Vit",
    Enfermedad: "Enf",
    Tratamiento: "Tra",
    Revisión: "Rev",
  };
  return map[tipo];
}

// ── Animal row sub-component ──

interface AnimalCheckRowProps {
  animal: Animal;
  selectedTypes: TipoEventoSalud[];
  row: AnimalRow;
  onToggle: (tipo: string) => void;
  onChangeEstado: (value: string) => void;
  onToggleNote: () => void;
  onChangeNote: (value: string) => void;
}

function AnimalCheckRow({
  animal,
  selectedTypes,
  row,
  onToggle,
  onChangeEstado,
  onToggleNote,
  onChangeNote,
}: AnimalCheckRowProps) {
  return (
    <div>
      {/* Main row */}
      <div className="flex items-center gap-1 px-3 py-2">
        {/* Animal info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">
            {animal.nombre || animal.arete_id}
          </p>
          <p className="truncate text-xs text-gray-400">
            {animal.animal_id}
          </p>
        </div>

        {/* Check columns */}
        {selectedTypes.map((tipo) => (
          <button
            key={tipo}
            type="button"
            onClick={() => onToggle(tipo)}
            className={`flex h-9 w-12 items-center justify-center rounded-lg transition-colors ${
              row.checked[tipo]
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-300"
            }`}
            aria-label={`${tipo} — ${animal.nombre}`}
          >
            <Check size={18} strokeWidth={3} />
          </button>
        ))}

        {/* Estado general */}
        <select
          value={row.estado_general}
          onChange={(e) => onChangeEstado(e.target.value)}
          className="w-20 rounded-lg border border-gray-200 bg-white px-1 py-1.5 text-xs text-gray-700"
        >
          {ESTADOS_GENERAL.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>

        {/* Note toggle */}
        <button
          type="button"
          onClick={onToggleNote}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
            row.nota
              ? "bg-amber-100 text-amber-600"
              : "text-gray-300 hover:text-gray-500"
          }`}
          aria-label="Nota"
        >
          {row.noteOpen ? <X size={16} /> : <StickyNote size={16} />}
        </button>
      </div>

      {/* Expandable note */}
      {row.noteOpen && (
        <div className="px-3 pb-2">
          <textarea
            value={row.nota}
            onChange={(e) => onChangeNote(e.target.value)}
            placeholder="Nota para este animal..."
            rows={2}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}
