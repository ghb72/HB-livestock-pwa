import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Save } from "lucide-react";
import { addDays, format } from "date-fns";
import { db } from "../../db";
import { generateId, now, currentUserId } from "../../db/helpers";
import { FormField, SelectField } from "../../components/ui";
import type { ReproductionRecord, PrenezEstado } from "../../types";

const PRENEZ_OPTIONS: PrenezEstado[] = ["Pendiente", "Sí", "No"];

/** Cattle gestation period: ~283 days */
const GESTATION_DAYS = 283;

/**
 * Reproduction form — register breeding events, confirm pregnancy,
 * and record births.
 */
export default function ReproductionFormPage() {
  const [searchParams] = useSearchParams();
  const preselectedAnimal = searchParams.get("animal") ?? "";
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const animals = useLiveQuery(() => db.animals.toArray()) ?? [];
  const cows = animals
    .filter((a) => a.sexo === "Hembra")
    .map((a) => `${a.animal_id} - ${a.nombre}`);
  const bulls = animals
    .filter((a) => a.sexo === "Macho")
    .map((a) => `${a.animal_id} - ${a.nombre}`);

  const [form, setForm] = useState({
    vaca_id: preselectedAnimal
      ? cows.find((c) => c.startsWith(preselectedAnimal)) ?? preselectedAnimal
      : "",
    semental_id: "",
    fecha_monta: new Date().toISOString().split("T")[0],
    prenez_confirmada: "Pendiente" as string,
    fecha_parto_real: "",
    cria_id: "",
    peso_destete_cria: "",
    notas: "",
  });

  // Auto-calculate expected birth date
  const fechaPosibleParto = form.fecha_monta
    ? format(addDays(new Date(form.fecha_monta), GESTATION_DAYS), "yyyy-MM-dd")
    : "";

  const update = (field: string) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    try {
      const timestamp = now();
      const reproId = await generateId("REP", db.reproduction);

      const record: ReproductionRecord = {
        reproduccion_id: reproId,
        vaca_id: form.vaca_id.split(" - ")[0],
        semental_id: form.semental_id.split(" - ")[0],
        fecha_monta: form.fecha_monta,
        fecha_posible_parto: fechaPosibleParto,
        prenez_confirmada: form.prenez_confirmada as PrenezEstado,
        fecha_parto_real: form.fecha_parto_real,
        cria_id: form.cria_id.split(" - ")[0],
        peso_destete_cria: form.peso_destete_cria
          ? Number(form.peso_destete_cria)
          : null,
        notas: form.notas,
        created_by: currentUserId(),
        updated_at: timestamp,
        created_at: timestamp,
        _sync_status: "pending",
      };

      await db.reproduction.add(record);
      navigate(-1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full p-2 text-gray-600 hover:bg-gray-200"
          aria-label="Volver"
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800">Reproducción</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <SelectField
          label="Vaca"
          name="vaca_id"
          value={form.vaca_id}
          onChange={update("vaca_id")}
          options={cows}
          required
        />

        <SelectField
          label="Semental"
          name="semental_id"
          value={form.semental_id}
          onChange={update("semental_id")}
          options={bulls}
          required
        />

        <FormField
          label="Fecha de monta observada"
          name="fecha_monta"
          type="date"
          value={form.fecha_monta}
          onChange={update("fecha_monta")}
          required
        />

        {/* Auto-computed field */}
        {fechaPosibleParto && (
          <div className="rounded-lg bg-pink-50 px-4 py-3">
            <span className="text-sm text-pink-700">
              Posible parto: <strong>{fechaPosibleParto}</strong> (~283 días)
            </span>
          </div>
        )}

        <SelectField
          label="Preñez confirmada"
          name="prenez_confirmada"
          value={form.prenez_confirmada}
          onChange={update("prenez_confirmada")}
          options={PRENEZ_OPTIONS}
        />

        <FormField
          label="Fecha de parto real"
          name="fecha_parto_real"
          type="date"
          value={form.fecha_parto_real}
          onChange={update("fecha_parto_real")}
        />

        <SelectField
          label="Cría (si ya nació)"
          name="cria_id"
          value={form.cria_id}
          onChange={update("cria_id")}
          options={animals.map((a) => `${a.animal_id} - ${a.nombre}`)}
          placeholder="Seleccionar cría..."
        />

        <FormField
          label="Peso al destete de la cría (kg)"
          name="peso_destete_cria"
          type="number"
          value={form.peso_destete_cria}
          onChange={update("peso_destete_cria")}
          placeholder="Ej: 180"
        />

        <FormField
          label="Notas"
          name="notas"
          type="textarea"
          value={form.notas}
          onChange={update("notas")}
          placeholder="Observaciones..."
        />

        <button
          type="submit"
          disabled={saving || !form.vaca_id || !form.semental_id}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-pink-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-pink-700 disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? "Guardando..." : "Guardar registro"}
        </button>
      </form>
    </div>
  );
}
