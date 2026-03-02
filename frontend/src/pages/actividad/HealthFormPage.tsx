import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Save } from "lucide-react";
import { db } from "../../db";
import { generateId, now, currentUserId } from "../../db/helpers";
import { FormField, SelectField } from "../../components/ui";
import type {
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

/**
 * Health event form — register vaccinations, deworming, vitamins,
 * diseases, treatments, and general checkups.
 */
export default function HealthFormPage() {
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
    tipo_evento: "" as string,
    producto: "",
    dosis: "",
    estado_general: "" as string,
    proxima_aplicacion: "",
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
      const saludId = await generateId("SAL", db.health);

      const record: HealthRecord = {
        salud_id: saludId,
        animal_id: form.animal_id.split(" - ")[0],
        fecha: form.fecha,
        tipo_evento: form.tipo_evento as TipoEventoSalud,
        producto: form.producto,
        dosis: form.dosis,
        estado_general: form.estado_general as EstadoGeneral,
        proxima_aplicacion: form.proxima_aplicacion,
        notas: form.notas,
        created_by: currentUserId(),
        updated_at: timestamp,
        created_at: timestamp,
        _sync_status: "pending",
      };

      await db.health.add(record);
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
        <h2 className="text-xl font-bold text-gray-800">Evento de salud</h2>
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

        <SelectField
          label="Tipo de evento"
          name="tipo_evento"
          value={form.tipo_evento}
          onChange={update("tipo_evento")}
          options={TIPOS_EVENTO}
          required
        />

        <FormField
          label="Producto / Vacuna / Medicamento"
          name="producto"
          value={form.producto}
          onChange={update("producto")}
          placeholder="Ej: Ivermectina, Bacteria triple"
        />

        <FormField
          label="Dosis"
          name="dosis"
          value={form.dosis}
          onChange={update("dosis")}
          placeholder="Ej: 5 ml"
        />

        <SelectField
          label="Estado general"
          name="estado_general"
          value={form.estado_general}
          onChange={update("estado_general")}
          options={ESTADOS_GENERAL}
        />

        <FormField
          label="Próxima aplicación"
          name="proxima_aplicacion"
          type="date"
          value={form.proxima_aplicacion}
          onChange={update("proxima_aplicacion")}
        />

        <FormField
          label="Notas"
          name="notas"
          type="textarea"
          value={form.notas}
          onChange={update("notas")}
          placeholder="Observaciones adicionales..."
        />

        <button
          type="submit"
          disabled={saving || !form.animal_id || !form.tipo_evento}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-blue-700 disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? "Guardando..." : "Guardar evento"}
        </button>
      </form>
    </div>
  );
}
