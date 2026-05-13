type SelectOption = string | { value: string; label: string };

interface SelectFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  required?: boolean;
}

function getOptionValue(option: SelectOption) {
  return typeof option === "string" ? option : option.value;
}

function getOptionLabel(option: SelectOption) {
  return typeof option === "string" ? option : option.label;
}

export function SelectField({
  label,
  name,
  value,
  onChange,
  options,
  placeholder = "Seleccionar...",
  required = false,
}: SelectFieldProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="block text-sm font-semibold text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={getOptionValue(opt)} value={getOptionValue(opt)}>
            {getOptionLabel(opt)}
          </option>
        ))}
      </select>
    </div>
  );
}
