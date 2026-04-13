<script lang="ts">
	interface Props {
		label: string;
		name: string;
		type?: 'text' | 'number' | 'date' | 'textarea';
		value: string | number;
		onchange: (value: string) => void;
		placeholder?: string;
		required?: boolean;
	}

	let {
		label,
		name,
		type = 'text',
		value,
		onchange,
		placeholder,
		required = false
	}: Props = $props();

	const baseClasses =
		'w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20';
</script>

<div class="space-y-1">
	<label for={name} class="block text-sm font-semibold text-gray-700">
		{label}
		{#if required}<span class="ml-0.5 text-red-500">*</span>{/if}
	</label>
	{#if type === 'textarea'}
		<textarea
			id={name}
			{name}
			value={String(value)}
			oninput={(e) => onchange(e.currentTarget.value)}
			{placeholder}
			rows={3}
			class={baseClasses}
		></textarea>
	{:else}
		<input
			id={name}
			{name}
			{type}
			inputmode={type === 'number' ? 'decimal' : undefined}
			value={String(value)}
			oninput={(e) => onchange(e.currentTarget.value)}
			{placeholder}
			{required}
			class={baseClasses}
		/>
	{/if}
</div>
