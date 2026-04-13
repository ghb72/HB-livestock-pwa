<script lang="ts">
	import { page } from '$app/state';
	import { Home, Beef, ClipboardList, DollarSign } from 'lucide-svelte';

	const tabs = [
		{ href: '/', icon: Home, label: 'Inicio' },
		{ href: '/ganado', icon: Beef, label: 'Ganado' },
		{ href: '/actividad', icon: ClipboardList, label: 'Actividad' },
		{ href: '/ventas', icon: DollarSign, label: 'Ventas' }
	] as const;
</script>

<nav
	class="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-[var(--sab)]"
>
	<div class="mx-auto flex max-w-lg items-center justify-around">
		{#each tabs as { href, icon: Icon, label }}
			{@const active =
				href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href)}
			<a
				{href}
				class="flex flex-col items-center gap-0.5 px-3 py-2 text-xs font-medium transition-colors {active
					? 'text-green-700'
					: 'text-gray-500 hover:text-gray-700'}"
			>
				<Icon size={24} strokeWidth={active ? 2.5 : 2} />
				<span>{label}</span>
			</a>
		{/each}
	</div>
</nav>
