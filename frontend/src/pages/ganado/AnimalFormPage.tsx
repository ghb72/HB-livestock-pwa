import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Save } from "lucide-react";
import { db } from "../../db";
import { generateId, now, currentUserId } from "../../db/helpers";
import { FormField, SelectField, PhotoCapture } from "../../components/ui";
import type {
  Animal,
  AnimalTipo,
  Sexo,
  Temperamento,
  EstadoAnimal,
} from "../../types";

const TIPOS: AnimalTipo[] = [
  "Semental",
  "Becerro(a)",
  "Vaquilla",
  "Vaca",
  "Torete",
];
const SEXOS: Sexo[] = ["Macho", "Hembra"];
const TEMPERAMENTOS: Temperamento[] = ["Normal", "Manso(a)", "Bravo(a)"];
const ESTADOS: EstadoAnimal[] = ["Vivo(a)", "Muerto(a)", "Vendido(a)"];

/** Empty animal template. */
function blankAnimal(): Omit<Animal, "animal_id" | "created_at" | "updated_at" | "created_by" | "_sync_status"> {
  return {
    arete_id: "",
    nombre: "",
    tipo: "Vaca",
    sexo: "Hembra",
    fecha_nacimiento: "",
    raza: "",
    madre_id: "",
    padre_id: "",
    temperamento: "Normal",
    estado: "Vivo(a)",
    peso_actual: null,
    notas: "",
    foto_url: "",
  };
}

/**
 * Animal form — create or edit an animal.
 * Accessed via /ganado/nuevo or /ganado/:id/editar
 */
export default function AnimalFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [photoData, setPhotoData] = useState("");

  // Load existing animal for editing
  const existing = useLiveQuery(
    () => (id ? db.animals.get(id) : undefined),
    [id],
  );

  const [form, setForm] = useState<ReturnType<typeof blankAnimal>>(
    blankAnimal(),
  );
  const [initialized, setInitialized] = useState(false);

  // Populate form when editing an existing animal
  if (isEdit && existing && !initialized) {
    setForm({
      arete_id: existing.arete_id,
      nombre: existing.nombre,
      tipo: existing.tipo,
      sexo: existing.sexo,
      fecha_nacimiento: existing.fecha_nacimiento,
      raza: existing.raza,
      madre_id: existing.madre_id,
      padre_id: existing.padre_id,
      temperamento: existing.temperamento,
      estado: existing.estado,
      peso_actual: existing.peso_actual,
      notas: existing.notas,
      foto_url: existing.foto_url,
    });
    setInitialized(true);
  }

  // Load existing photo for edit mode
  const existingPhoto = useLiveQuery(
    () => (id ? db.photos.where("animal_id").equals(id).first() : undefined),
    [id],
  );
  if (isEdit && existingPhoto && !photoData && initialized) {
    setPhotoData(existingPhoto.data_url || existingPhoto.drive_url);
  }

  // Load all animals for parent selection
  const allAnimals = useLiveQuery(() => db.animals.toArray()) ?? [];
  const mothers = allAnimals
    .filter((a) => a.sexo === "Hembra" && (!id || a.animal_id !== id))
    .map((a) => `${a.animal_id} - ${a.nombre}`);
  const fathers = allAnimals
    .filter((a) => a.sexo === "Macho" && (!id || a.animal_id !== id))
    .map((a) => `${a.animal_id} - ${a.nombre}`);

  const update = (field: string) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    try {
      const timestamp = now();
      const userId = currentUserId();

      if (isEdit && id) {
        // Update existing
        await db.animals.update(id, {
          ...form,
          peso_actual: form.peso_actual ? Number(form.peso_actual) : null,
          madre_id: form.madre_id.split(" - ")[0] ?? form.madre_id,
          padre_id: form.padre_id.split(" - ")[0] ?? form.padre_id,
          updated_at: timestamp,
          _sync_status: "pending",
        });

        // Update or create photo
        if (photoData && photoData.startsWith("data:")) {
          const existingPhotoRec = await db.photos
            .where("animal_id")
            .equals(id)
            .first();
          if (existingPhotoRec) {
            await db.photos.update(existingPhotoRec.photo_id, {
              data_url: photoData,
              _sync_status: "pending",
            });
          } else {
            const photoId = await generateId("PHT", db.photos);
            await db.photos.add({
              photo_id: photoId,
              animal_id: id,
              data_url: photoData,
              drive_url: "",
              _sync_status: "pending",
              created_at: timestamp,
            });
          }
        } else if (!photoData) {
          // Photo removed
          await db.photos.where("animal_id").equals(id).delete();
        }
      } else {
        // Create new
        const animalId = await generateId("ANI", db.animals);
        const newAnimal: Animal = {
          animal_id: animalId,
          ...form,
          peso_actual: form.peso_actual ? Number(form.peso_actual) : null,
          madre_id: form.madre_id.split(" - ")[0] ?? form.madre_id,
          padre_id: form.padre_id.split(" - ")[0] ?? form.padre_id,
          created_by: userId,
          updated_at: timestamp,
          created_at: timestamp,
          _sync_status: "pending",
        };
        await db.animals.add(newAnimal);

        // Save photo if captured
        if (photoData && photoData.startsWith("data:")) {
          const photoId = await generateId("PHT", db.photos);
          await db.photos.add({
            photo_id: photoId,
            animal_id: animalId,
            data_url: photoData,
            drive_url: "",
            _sync_status: "pending",
            created_at: timestamp,
          });
        }
      }

      navigate("/ganado", { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-200"
          aria-label="Volver"
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="text-xl font-bold text-gray-800">
          {isEdit ? "Editar animal" : "Registrar animal"}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Photo capture */}
        <PhotoCapture value={photoData} onChange={setPhotoData} />

        <FormField
          label="Nombre"
          name="nombre"
          value={form.nombre}
          onChange={update("nombre")}
          placeholder="Ej: La Morenita"
          required
        />

        <FormField
          label="No. Arete (ID)"
          name="arete_id"
          value={form.arete_id}
          onChange={update("arete_id")}
          placeholder="Ej: 1234"
        />

        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Tipo"
            name="tipo"
            value={form.tipo}
            onChange={update("tipo")}
            options={TIPOS}
            required
          />
          <SelectField
            label="Sexo"
            name="sexo"
            value={form.sexo}
            onChange={update("sexo")}
            options={SEXOS}
            required
          />
        </div>

        <FormField
          label="Fecha de nacimiento"
          name="fecha_nacimiento"
          type="date"
          value={form.fecha_nacimiento}
          onChange={update("fecha_nacimiento")}
        />

        <FormField
          label="Raza"
          name="raza"
          value={form.raza}
          onChange={update("raza")}
          placeholder="Ej: Brahman, Angus, Criollo"
        />

        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Madre"
            name="madre_id"
            value={form.madre_id}
            onChange={update("madre_id")}
            options={mothers}
            placeholder="Sin madre"
          />
          <SelectField
            label="Padre"
            name="padre_id"
            value={form.padre_id}
            onChange={update("padre_id")}
            options={fathers}
            placeholder="Sin padre"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Temperamento"
            name="temperamento"
            value={form.temperamento}
            onChange={update("temperamento")}
            options={TEMPERAMENTOS}
          />
          <SelectField
            label="Estado"
            name="estado"
            value={form.estado}
            onChange={update("estado")}
            options={ESTADOS}
          />
        </div>

        <FormField
          label="Peso actual (kg)"
          name="peso_actual"
          type="number"
          value={form.peso_actual ?? ""}
          onChange={update("peso_actual")}
          placeholder="Ej: 350"
        />

        <FormField
          label="Notas"
          name="notas"
          type="textarea"
          value={form.notas}
          onChange={update("notas")}
          placeholder="Observaciones generales..."
        />

        {/* Submit */}
        <button
          type="submit"
          disabled={saving || !form.nombre}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-4 text-base font-bold text-white shadow-sm transition-colors active:bg-green-700 disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Registrar animal"}
        </button>
      </form>
    </div>
  );
}
