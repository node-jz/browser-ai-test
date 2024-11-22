<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { io } from 'socket.io-client';
	import type { SearchProps } from '@api/search/platforms/types';
	import { fail } from '@sveltejs/kit';
	import SearchForm from './search/SearchForm.svelte';
	type Connection = {
		steps: { step: string; screenshot?: string; url: string }[];
		loading: boolean;
		failed: boolean;
		startTime: Date; // Track when the connection started
		endTime?: Date; // Track when the connection finished, optional
		showHistory: boolean; // Toggle for showing detailed steps history
		elapsedTime: number;
	};

	// Reactive variables using $state
	let destination = $state('');
	let checkinDate = $state('');
	let checkoutDate = $state('');
	let occupants = $state(1);
	let platforms = $state([
		{ name: 'Duffel', value: 'duffel', checked: true },
		{ name: 'Beds Online', value: 'bedsonline', checked: true }
		// Add more websites as needed
	]);
	let room: string | null = $state<string | null>(null);

	let socket;
	let connections = $state<Record<string, Connection>>({});
	let connectionCount = $derived(Object.keys(connections).length);

	const initNewConnection = (platform: string) => {
		connections[platform] = {
			steps: [],
			loading: true,
			startTime: new Date(),
			showHistory: false,
			failed: false,
			elapsedTime: 0
		};
	};
	onMount(() => {
		socket = io(`${import.meta.env.VITE_API_URL}/events`, {
			transports: ['websocket'],
			path: '/socket.io'
		});
		socket.on('connect', () => {});
		socket.on('connect_error', (e) => {
			console.log('socket error', socket, e);
		});

		socket.on(
			'progress',
			(data: { platform: string; url: string; step: string; image: Buffer }) => {
				const { platform, step, url, image } = data;
				if (!connections[platform]) {
					initNewConnection(platform);
				}
				let progress: { step: string; screenshot?: string; url: string } = { step: step, url: url };
				if (image) {
					const blob = new Blob([new Uint8Array(data.image)], { type: 'image/png' });
					progress.screenshot = URL.createObjectURL(blob);
				}
				connections[platform].steps.push(progress);
			}
		);

		// Handle results
		socket.on(
			'results',
			(data: {
				platform: string;
				image?: Buffer;
				url: string;
				match: { link: string; name: string; price: string };
			}) => {
				const { platform, match, image, url } = data;

				let progress: { step: string; screenshot?: string; url: string } = {
					step: `<a class="font-semibold text-sky-700" href=${match.link} target="_blank">${match.name}</a>`,
					url
				};
				if (image) {
					const blob = new Blob([new Uint8Array(image)], { type: 'image/png' });
					progress.screenshot = URL.createObjectURL(blob);
				}
				if (connections[platform]) {
					connections[platform].steps.push(progress);
					connections[platform].loading = false;
					connections[platform].failed = false;
					connections[platform].endTime = new Date();
				}
			}
		);
		// Handle results
		socket.on('no-results', (data: { platform: string; url: string; image?: Buffer }) => {
			const { platform, url, image } = data;

			let progress: { step: string; url: string; screenshot?: string } = {
				step: `No matches found.`,
				url
			};
			if (image) {
				const blob = new Blob([new Uint8Array(image)], { type: 'image/png' });
				progress.screenshot = URL.createObjectURL(blob);
			}
			if (connections[platform]) {
				connections[platform].steps.push(progress);
				connections[platform].loading = false;
				connections[platform].failed = false;
				connections[platform].endTime = new Date();
			}
		});
		socket.on('error', (data: { platform: string; message: string; image?: Buffer }) => {
			const { platform, message, image } = data;

			let progress: { step: string; screenshot?: string } = { step: message };
			if (image) {
				const blob = new Blob([new Uint8Array(image)], { type: 'image/png' });
				progress.screenshot = URL.createObjectURL(blob);
			}
			if (connections[platform]) {
				connections[platform].steps.push(progress);
				connections[platform].loading = false;
				connections[platform].failed = true;
				connections[platform].endTime = new Date();
			}
		});
	});

	// Event handler for form submission
	async function startSearch(formData: SearchProps) {
		const selectedPlatforms = platforms.filter((w) => w.checked).map((w) => w.value);
		connections = {};
		const res = await fetch(`${import.meta.env.VITE_API_URL}/search`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(formData)
		});
		const room = (await res.json()) as { sessionId: string };
		socket.emit('subscribeToSession', { sessionId: room.sessionId });
	}

	function toggleHistory(platform: string) {
		connections[platform].showHistory = !connections[platform].showHistory;
	}

	function formatTimer(elapsedTime: number) {
		const seconds = Math.floor((elapsedTime / 1000) % 60);
		const minutes = Math.floor((elapsedTime / (1000 * 60)) % 60);
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	// Set up an interval to update the timers
	const timerInterval = setInterval(() => {
		// Update to ensure Svelte knows the timer is updating every second
		Object.keys(connections).forEach((key) => {
			const { startTime, endTime } = connections[key];
			const elapsed = endTime
				? endTime.getTime() - startTime.getTime()
				: Date.now() - startTime.getTime();

			connections[key].elapsedTime = elapsed;
		});
		connections = { ...connections };
	}, 1000);
	onDestroy(() => {
		clearInterval(timerInterval);
	});
</script>

<div class="flex gap-8 px-12 py-8">
	<SearchForm onSubmit={startSearch}></SearchForm>
	<div class="flex-1 border-l border-slate-200 pl-8">
		<div class="flex flex-col gap-6">
			{#if connectionCount > 0}
				<h1 class="text-xl font-semibold text-slate-800">Platforms</h1>
			{/if}
			{#each Object.keys(connections) as platform}
				<div class="flex items-center gap-4 border-b py-4">
					<!-- Most recent screenshot or placeholder -->
					<div
						class="flex h-16 w-24 items-center justify-center rounded-lg border border-slate-300 bg-slate-100"
					>
						{#if connections[platform].steps.length > 0 && connections[platform].steps[connections[platform].steps.length - 1].screenshot}
							<img
								class="h-full w-auto rounded-lg"
								src={connections[platform].steps[connections[platform].steps.length - 1].screenshot}
								alt="Screenshot"
							/>
						{:else}
							<p class="text-4xl text-slate-600 opacity-30">?</p>
						{/if}
					</div>

					<!-- Platform and Step Information -->
					<div class="flex-1">
						<h2 class="text-lg font-medium text-sky-700">{platform}</h2>
						<div class="inline-flex items-center gap-2 text-sm text-slate-600">
							{#if connections[platform].steps.length > 0}
								<a
									target="_blank"
									href={connections[platform].steps[connections[platform].steps.length - 1].url}
									><svg
										class="h-3 w-3"
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 512 512"
										xml:space="preserve"
										><path
											fill="#6E83B7"
											d="M329.5 298.515c-29.705 0-59.41-11.307-82.024-33.921-45.228-45.229-45.228-118.821 0-164.049l56.569-56.569c45.229-45.229 118.82-45.229 164.048 0 45.229 45.229 45.229 118.821 0 164.049l-56.569 56.569c-22.614 22.614-52.319 33.921-82.024 33.921zm-45.255-70.691c24.955 24.954 65.557 24.953 90.51 0l56.569-56.569c24.954-24.954 24.953-65.556 0-90.51-24.954-24.953-65.557-24.953-90.51 0l-56.569 56.569c-24.953 24.954-24.953 65.556 0 90.51l-18.385 18.384 18.385-18.384z"
										/><path
											fill="#6E83B7"
											d="M126 502.015c-29.705 0-59.41-11.307-82.024-33.921-45.228-45.229-45.228-118.821 0-164.049l56.569-56.569c45.229-45.229 118.82-45.228 164.048 0 45.228 45.229 45.228 118.821 0 164.049l-56.569 56.569c-22.614 22.614-52.319 33.921-82.024 33.921zm56.568-236.485c-16.389 0-32.778 6.238-45.254 18.715l-56.569 56.569c-24.954 24.954-24.954 65.556 0 90.509 24.954 24.954 65.557 24.954 90.51 0l56.569-56.569c24.954-24.954 24.953-65.556 0-90.51-12.477-12.475-28.866-18.714-45.256-18.714z"
										/><path
											fill="#466089"
											d="m154.077 314.08 159.999-160 43.84 43.84-159.999 160z"
										/></svg
									></a
								>
								{@html connections[platform].steps[connections[platform].steps.length - 1].step}
							{:else}
								No steps yet.
							{/if}
						</div>
					</div>

					<!-- Status Tag -->
					<div
						class="rounded px-2 py-1 text-sm font-semibold"
						class:text-green-700={connections[platform].loading == false &&
							connections[platform].failed == false}
						class:text-yellow-700={connections[platform].loading == true}
						class:text-red-700={connections[platform].loading == false &&
							connections[platform].failed == true}
					>
						{#if connections[platform].loading == false}
							{#if connections[platform].failed == true}
								<span class="bg-red-100 text-red-700">Failed</span>
							{:else}
								<span class="bg-green-100 text-green-700">Done</span>
							{/if}
						{:else}
							<span class="bg-yellow-100 text-yellow-700">Running</span>
						{/if}
					</div>

					<!-- Timer -->
					<div class="font-mono text-sm">
						<span>{formatTimer(connections[platform].elapsedTime)}</span>
					</div>

					<!-- History Button -->
					<button
						on:click={() => toggleHistory(platform)}
						class="flex items-center text-sm font-semibold text-sky-700 hover:underline"
					>
						<span>History</span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="ml-1 h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 5l7 7-7 7"
							/>
						</svg>
					</button>
				</div>

				<!-- Expanded History Section -->
				{#if connections[platform].showHistory}
					<div class="mt-2 flex flex-col gap-3">
						{#each connections[platform].steps as step}
							<div
								class="flex items-center gap-3 border border-b-0 border-solid border-slate-200 px-4 py-2 first:border-t-0"
							>
								<div
									class="flex aspect-video w-72 items-center justify-center rounded-lg border border-slate-300 bg-slate-100"
								>
									{#if step.screenshot}
										<img class="h-auto w-full rounded-lg" src={step.screenshot} alt="Screenshot" />
									{:else}
										<p class="text-4xl text-slate-600 opacity-30">?</p>
									{/if}
								</div>
								<div class="inline-flex flex-1 items-center gap-1.5 text-sm">
									<a target="_blank" href={step.url}
										><svg
											class="h-3 w-3"
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 512 512"
											xml:space="preserve"
											><path
												fill="#6E83B7"
												d="M329.5 298.515c-29.705 0-59.41-11.307-82.024-33.921-45.228-45.229-45.228-118.821 0-164.049l56.569-56.569c45.229-45.229 118.82-45.229 164.048 0 45.229 45.229 45.229 118.821 0 164.049l-56.569 56.569c-22.614 22.614-52.319 33.921-82.024 33.921zm-45.255-70.691c24.955 24.954 65.557 24.953 90.51 0l56.569-56.569c24.954-24.954 24.953-65.556 0-90.51-24.954-24.953-65.557-24.953-90.51 0l-56.569 56.569c-24.953 24.954-24.953 65.556 0 90.51l-18.385 18.384 18.385-18.384z"
											/><path
												fill="#6E83B7"
												d="M126 502.015c-29.705 0-59.41-11.307-82.024-33.921-45.228-45.229-45.228-118.821 0-164.049l56.569-56.569c45.229-45.229 118.82-45.228 164.048 0 45.228 45.229 45.228 118.821 0 164.049l-56.569 56.569c-22.614 22.614-52.319 33.921-82.024 33.921zm56.568-236.485c-16.389 0-32.778 6.238-45.254 18.715l-56.569 56.569c-24.954 24.954-24.954 65.556 0 90.509 24.954 24.954 65.557 24.954 90.51 0l56.569-56.569c24.954-24.954 24.953-65.556 0-90.51-12.477-12.475-28.866-18.714-45.256-18.714z"
											/><path
												fill="#466089"
												d="m154.077 314.08 159.999-160 43.84 43.84-159.999 160z"
											/></svg
										></a
									>
									{@html step.step}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	</div>
</div>

<style>
	.card {
		@apply mb-4 rounded bg-white p-4 shadow;
	}
	.input {
		@apply w-full rounded border p-2;
	}
	.btn {
		@apply rounded bg-blue-500 px-4 py-2 text-white;
	}
</style>
