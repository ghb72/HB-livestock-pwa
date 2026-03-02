interface FormFieldProps {
  label: string;
  name: string;
  type?: "text" | "number" | "date" | "textarea";
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

export function FormField({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  required = false,
}: FormFieldProps) {
  const baseClasses =
    "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20";

  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-semibold text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {type === "textarea" ? (
        <textarea
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={baseClasses}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          inputMode={type === "number" ? "decimal" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={baseClasses}
        />
      )}
    </div>
  );
}
