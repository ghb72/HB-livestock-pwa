<script lang="ts">
	import { CalendarDays } from 'lucide-svelte';
	import { format, isValid } from 'date-fns';
	import { parseStoredDate } from '$lib/date';

	interface Props {
		label?: string;
		name: string;
		value: string | number;
		onchange: (value: string) => void;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		inputClass?: string;
		labelClass?: string;
	}

	let {
		label = '',
		name,
		value,
		onchange,
		placeholder = 'DD/MM/AAAA',
		required = false,
		disabled = false,
		inputClass = '',
		labelClass = 'block text-sm font-semibold text-gray-700'
	}: Props = $props();

	let pickerInput: HTMLInputElement | null = null;
	let displayValue = $state('');
	let previousValue = '';

	function formatDisplay(dateStr: string): string {
		const parsed = parseStoredDate(dateStr);
		return parsed ? format(parsed, 'dd/MM/yyyy') : '';
	}

	function toIsoDate(display: string): string | null {
		const match = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
		if (!match) return null;

		const [, day, month, year] = match;
		const iso = `${year}-${month}-${day}`;
		const parsed = parseStoredDate(iso);
		if (!parsed) return null;

		if (
			parsed.getFullYear() !== Number(year) ||
			parsed.getMonth() + 1 !== Number(month) ||
			parsed.getDate() !== Number(day)
		) {
			return null;
		}

		return iso;
	}

	function normalizeDisplay(raw: string): string {
		const digits = raw.replace(/\D/g, '').slice(0, 8);
		const day = digits.slice(0, 2);
		const month = digits.slice(2, 4);
		const year = digits.slice(4, 8);

		return [day, month, year].filter(Boolean).join('/');
	}

	$effect(() => {
		const nextValue = String(value ?? '');
		if (nextValue !== previousValue) {
			previousValue = nextValue;
			displayValue = formatDisplay(nextValue);
		}
	});

	function handleInput(raw: string) {
		displayValue = normalizeDisplay(raw);

		if (!displayValue) {
			onchange('');
			return;
		}

		const iso = toIsoDate(displayValue);
		if (iso) onchange(iso);
	}

	function handleBlur() {
		if (!displayValue) {
			onchange('');
			return;
		}

		const iso = toIsoDate(displayValue);
		if (!iso) {
			displayValue = formatDisplay(String(value ?? ''));
			return;
		}

		displayValue = formatDisplay(iso);
		onchange(iso);
	}

	function handlePickerChange(nextValue: string) {
		onchange(nextValue);
		displayValue = formatDisplay(nextValue);
	}

	function openPicker() {
		if (disabled) return;
		pickerInput?.showPicker?.();
		pickerInput?.focus();
	}

	const wrapperClass =
		'flex items-center rounded-lg border border-gray-300 bg-white focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-500/20 disabled:cursor-not-allowed disabled:bg-gray-100';
</script>

<div class="space-y-1">
	{#if label}
		<label for={name} class={labelClass}>
			{label}
			{#if required}<span class="ml-0.5 text-red-500">*</span>{/if}
		</label>
	{/if}
	<div class={wrapperClass}>
		<input
			id={name}
			name={`${name}_display`}
			type="text"
			inputmode="numeric"
			value={displayValue}
			oninput={(e) => handleInput(e.currentTarget.value)}
			onblur={handleBlur}
			{placeholder}
			{required}
			{disabled}
			class={`w-full rounded-lg bg-transparent px-4 py-3 text-base text-gray-900 placeholder-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:text-gray-500 ${inputClass}`}
		/>
		<button
			type="button"
			onclick={openPicker}
			disabled={disabled}
			class="flex h-full shrink-0 items-center px-3 text-gray-500 disabled:cursor-not-allowed disabled:text-gray-300"
			aria-label="Abrir selector de fecha"
		>
			<CalendarDays size={18} />
		</button>
		<input
			bind:this={pickerInput}
			tabindex="-1"
			type="date"
			value={String(value ?? '')}
			oninput={(e) => handlePickerChange(e.currentTarget.value)}
			{disabled}
			class="pointer-events-none absolute opacity-0"
			aria-hidden="true"
		/>
	</div>
</div>
