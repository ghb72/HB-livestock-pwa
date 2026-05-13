import { useRef, useState } from "react";
import { Camera, Image as ImageIcon, X } from "lucide-react";
import { compressImage } from "../../utils/compressImage";

/**
 * Photo capture component — camera or gallery picker with preview.
 *
 * On mobile devices opens the camera directly; on desktop shows the
 * file picker. The captured image is compressed before being returned.
 */
export default function PhotoCapture({
  value,
  onChange,
}: {
  /** Current photo data URL (base64) or remote URL. */
  value: string;
  /** Called with the compressed base64 data URL. */
  onChange: (dataUrl: string) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    try {
      const compressed = await compressImage(file);
      onChange(compressed);
    } catch {
      // Silent fail — user can retry
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    onChange("");
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">Foto</label>

      {/* Preview */}
      {value ? (
        <div className="relative">
          <img
            src={value}
            alt="Foto del animal"
            className="h-48 w-full rounded-xl object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white transition-colors active:bg-black/70"
            aria-label="Quitar foto"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          {/* Camera button */}
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={loading}
            className="flex flex-1 flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-6 text-gray-500 transition-colors active:border-green-500 active:text-green-600"
          >
            <Camera size={28} />
            <span className="text-sm font-medium">
              {loading ? "Procesando..." : "Cámara"}
            </span>
          </button>

          {/* Gallery button */}
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={loading}
            className="flex flex-1 flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-6 text-gray-500 transition-colors active:border-green-500 active:text-green-600"
          >
            <ImageIcon size={28} />
            <span className="text-sm font-medium">
              {loading ? "Procesando..." : "Galería"}
            </span>
          </button>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
