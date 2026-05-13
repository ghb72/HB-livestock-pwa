<script lang="ts">
	type SelectOption = string | { value: string; label: string };

	interface Props {
		label: string;
		name: string;
		value: string;
		onchange: (value: string) => void;
		options: readonly SelectOption[];
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
	}

	let {
		label,
		name,
		value,
		onchange,
		options,
		placeholder = 'Seleccionar...',
		required = false,
		disabled = false
	}: Props = $props();

	function getOptionValue(option: SelectOption) {
		return typeof option === 'string' ? option : option.value;
	}

	function getOptionLabel(option: SelectOption) {
		return typeof option === 'string' ? option : option.label;
	}
</script>

<div class="space-y-1">
	<label for={name} class="block text-sm font-semibold text-gray-700">
		{label}
		{#if required}<span class="ml-0.5 text-red-500">*</span>{/if}
	</label>
	<select
		id={name}
		{name}
		{value}
		onchange={(e) => onchange(e.currentTarget.value)}
		{required}
		{disabled}
		class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
	>
		<option value="">{placeholder}</option>
		{#each options as opt}
			<option value={getOptionValue(opt)}>{getOptionLabel(opt)}</option>
		{/each}
	</select>
</div>
