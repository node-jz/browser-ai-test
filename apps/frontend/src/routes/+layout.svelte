<script lang="ts">
	import '../app.css';
	import ProtectedLayout from './ProtectedLayout.svelte';
	let { children } = $props();
</script>

<ProtectedLayout>
	{@render children()}
</ProtectedLayout>
