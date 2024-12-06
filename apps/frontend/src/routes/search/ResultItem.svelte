<script lang="ts">
	import type { SearchStep } from '../+page.svelte';
	import LinkIcon from './LinkIcon.svelte';
	import ResultScreenshotThumbnail from './ResultScreenshotThumbnail.svelte';

	export let step: SearchStep;
</script>

<div
	class="flex items-center gap-2 border border-b-0 border-solid border-slate-200 px-4 py-1.5 first:border-t-0"
>
	<ResultScreenshotThumbnail {step} />
	<div class="inline-flex flex-1 items-center gap-1.5 text-sm">
		<LinkIcon url={step.url} />
		{@html step.step}
	</div>
</div>
