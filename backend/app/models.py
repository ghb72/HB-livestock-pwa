"""
Pydantic models for the Livestock Register API.

Each model mirrors the IndexedDB / Google Sheets data schema.
"""

from pydantic import BaseModel


class SyncMeta(BaseModel):
    """Common sync metadata fields."""

    _sync_status: str = "synced"
    updated_at: str
    created_at: str
    created_by: str


class AnimalRecord(SyncMeta):
    animal_id: str
    arete_id: str = ""
    nombre: str = ""
    tipo: str = ""
    sexo: str = ""
    fecha_nacimiento: str = ""
    raza: str = ""
    madre_id: str = ""
    padre_id: str = ""
    temperamento: str = ""
    estado: str = ""
    peso_actual: float | None = None
    notas: str = ""
    foto_url: str = ""


class HealthRecordModel(SyncMeta):
    salud_id: str
    animal_id: str
    fecha: str = ""
    tipo_evento: str = ""
    producto: str = ""
    dosis: str = ""
    estado_general: str = ""
    proxima_aplicacion: str = ""
    notas: str = ""


class ReproductionRecordModel(SyncMeta):
    reproduccion_id: str
    vaca_id: str
    semental_id: str = ""
    fecha_monta: str = ""
    fecha_posible_parto: str = ""
    prenez_confirmada: str = ""
    fecha_parto_real: str = ""
    cria_id: str = ""
    peso_destete_cria: float | None = None
    notas: str = ""


class ObservationRecord(SyncMeta):
    observacion_id: str
    fecha: str = ""
    animal_id: str = ""
    notas: str = ""


class SaleRecord(SyncMeta):
    venta_id: str
    animal_id: str
    fecha_venta: str = ""
    motivo_venta: str = ""
    peso: float | None = None
    precio_total: float | None = None
    precio_kg: float | None = None
    comprador: str = ""
    notas: str = ""


class RecorridoEntryRecord(SyncMeta):
    recorrido_id: str
    fecha: str = ""
    animal_id: str = ""
    notas: str = ""


class SyncRequest(BaseModel):
    """Request body for sync endpoint."""

    records: list[dict]


class SyncResponse(BaseModel):
    """Response body for sync endpoint."""

    merged: list[dict]
    synced_count: int
    server_count: int


class PullResponse(BaseModel):
    """Response body for full data pull."""

    animals: list[dict]
    health: list[dict]
    reproduction: list[dict]
    observations: list[dict]
    sales: list[dict]
    recorridos: list[dict]
