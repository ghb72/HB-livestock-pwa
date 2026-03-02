import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Save } from "lucide-react";
import { db } from "../../db";
import { generateId, now, currentUserId } from "../../db/helpers";
import { FormField, SelectField } from "../../components/ui";
import type { Observation } from "../../types";

/**
 * Observation form — quick field notes linked to an animal.
 */
export default function ObservationFormPage() {
  const [searchParams] = useSearchParams();
  const preselectedAnimal = searchParams.get("animal") ?? "";
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const animals = useLiveQuery(() => db.animals.toArray()) ?? [];
  const animalOptions = animals.map(
    (a) => `${a.animal_id} - ${a.nombre}`,
  );

  const [form, setForm] = useState({
    animal_id: preselectedAnimal
      ? animalOptions.find((o) => o.startsWith(preselectedAnimal)) ?? preselectedAnimal
      : "",
    fecha: new Date().toISOString().split("T")[0],
    notas: "",
  });

  const update = (field: string) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    try {
      const timestamp = now();
      const obsId = await generateId("OBS", db.observations);

      const record: Observation = {
        observacion_id: obsId,
        animal_id: form.animal_id.split(" - ")[0],
        fecha: form.fecha,
        notas: form.notas,
        created_by: currentUserId(),
        updated_at: timestamp,
        created_at: timestamp,
        _sync_status: "pending",
      };

      await db.observations.add(record);
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
        <h2 className="text-xl font-bold text-gray-800">Observación</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <SelectField
          label="Animal"
          name="animal_id"
          value={form.animal_id}
          onChange={update("animal_id")}
          options={animalOptions}
          required
        />

        <FormField
          label="Fecha"
          name="fecha"
          type="date"
          value={form.fecha}
          onChange={update("fecha")}
          required
        />

        <FormField
          label="Notas de observación"
          name="notas"
          type="textarea"
          value={form.notas}
          onChange={update("notas")}
          placeholder="Describe lo que observaste..."
          required
        />

        <button
          type="submit"
          disabled={saving || !form.animal_id || !form.notas}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-purple-700 disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? "Guardando..." : "Guardar observación"}
        </button>
      </form>
    </div>
  );
}
