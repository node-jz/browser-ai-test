<script lang="ts">
	import type { SearchStep } from '../+page.svelte';
	export let step: SearchStep;
</script>

<div
	class="flex aspect-video h-14 w-24 items-center justify-center overflow-clip rounded-lg border border-slate-300 bg-slate-100"
>
	{#if step.screenshot}
		<a href={step.screenshot} class="h-auto w-full" target="_blank">
			<img
				class="h-full w-full rounded-lg object-cover object-top"
				src={step.screenshot}
				alt="Screenshot"
			/>
		</a>
	{:else}
		<p class="text-4xl text-slate-600 opacity-30">?</p>
	{/if}
</div>
