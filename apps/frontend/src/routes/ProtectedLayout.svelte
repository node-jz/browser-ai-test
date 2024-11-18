<script lang="ts">
	import { onMount } from 'svelte';

	// Retrieve the password from the environment variable
	const ENV_PASSWORD = import.meta.env.VITE_APP_PASSWORD;

	let passwordInput = '';
	let isAuthenticated = $state(false);

	function handleLogin() {
		if (passwordInput === ENV_PASSWORD) {
			localStorage.setItem('isAuthenticated', 'true');
			isAuthenticated = true;
		}
	}

	function handleLogout() {
		localStorage.removeItem('isAuthenticated'); // Clear auth state
		isAuthenticated = false;
	}

	onMount(() => {
		isAuthenticated = !!localStorage.getItem('isAuthenticated');
	});
</script>

{#if isAuthenticated}
	<slot />
{:else}
	<div class="flex min-h-screen items-center justify-center bg-gray-100">
		<div class="flex flex-col items-center rounded-lg bg-white p-6 text-center shadow-lg">
			<div class="mb-4 text-6xl text-gray-500">🔒</div>
			<h1 class="mb-2 text-2xl font-semibold">Password Required</h1>
			<p class="mb-4 text-gray-600">Enter the password to unlock the content.</p>
			<input
				type="password"
				placeholder="Enter password"
				bind:value={passwordInput}
				class="mb-4 w-64 rounded-md border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
			/>
			<button
				on:click={handleLogin}
				class="w-64 rounded-md bg-blue-500 px-4 py-2 text-white transition hover:bg-blue-600"
			>
				Login
			</button>
		</div>
	</div>
{/if}
