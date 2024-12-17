<script context="module">
	export type SearchStep = {
		step: string;
		screenshot?: string;
		url: string;
		type?: string;
	};
</script>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { io } from 'socket.io-client';
	import type { SearchProps } from '@api/search/platforms/types';
	import { fail } from '@sveltejs/kit';
	import SearchForm from './search/SearchForm.svelte';
	import ResultItem from './search/ResultItem.svelte';
	import ResultScreenshotThumbnail from './search/ResultScreenshotThumbnail.svelte';
	import LinkIcon from './search/LinkIcon.svelte';
	type Connection = {
		steps: { step: string; screenshot?: string; url: string; type?: string }[];
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
		{ name: 'Beds Online', value: 'bedsonline', checked: true },
		{ name: 'Webbeds', value: 'webbeds', checked: true },
		{ name: 'Fora', value: 'fora', checked: true },
		{ name: 'Expedia', value: 'expedia', checked: true },
		{ name: 'Booking.com', value: 'bookingcom', checked: true }
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
				let progress: SearchStep = {
					step: step,
					url: url,
					type: 'progress'
				};
				if (image) {
					const blob = new Blob([new Uint8Array(data.image)], { type: 'image/png' });
					progress.screenshot = URL.createObjectURL(blob);
				}
				connections[platform].steps.push(progress);
			}
		);

		socket.on(
			'requestMfaCode',
			(data: { platform: string; url: string; step: string; image: Buffer }) => {
				const { platform, step, url, image } = data;
				if (!connections[platform]) {
					initNewConnection(platform);
				}
				let progress: SearchStep = {
					step: step,
					url: url,
					type: 'requestMfaCode'
				};
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

				let progress: SearchStep = {
					step: `<a class="font-semibold text-sky-700" href=${match.link} target="_blank">${match.name}</a>`,
					url,
					type: 'results'
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

			let progress: SearchStep = {
				step: `No matches found.`,
				url,
				type: 'results'
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

			let progress: SearchStep = {
				step: message,
				type: 'error'
			};
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
		const sessionResponse = (await res.json()) as { sessionId: string };
		room = sessionResponse.sessionId;
		socket.emit('subscribeToSession', { sessionId: room });
	}

	function toggleHistory(platform: string) {
		connections[platform].showHistory = !connections[platform].showHistory;
	}

	function formatTimer(elapsedTime: number) {
		const seconds = Math.floor((elapsedTime / 1000) % 60);
		const minutes = Math.floor((elapsedTime / (1000 * 60)) % 60);
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}
	const handleMfaCode = (e: SubmitEvent) => {
		e.preventDefault();
		const code = (e.target as HTMLFormElement).mfaCode.value;
		socket.emit('mfaCode', { sessionId: room, mfaCode: code });
	};

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
					{#if connections[platform].steps.length > 0}
						<ResultScreenshotThumbnail
							step={connections[platform].steps[connections[platform].steps.length - 1]}
						/>
					{/if}

					<!-- Platform and Step Information -->
					<div class="flex flex-1 flex-col gap-2">
						<h2 class="text-lg font-medium text-sky-700">{platform}</h2>
						<div class="inline-flex items-center gap-2 text-sm text-slate-600">
							{#if connections[platform].steps.length > 0}
								<LinkIcon
									url={connections[platform].steps[connections[platform].steps.length - 1].url}
								/>
								{@html connections[platform].steps[connections[platform].steps.length - 1].step}
							{:else}
								No steps yet.
							{/if}
						</div>
						{#if connections[platform].steps[connections[platform].steps.length - 1].type == 'requestMfaCode'}
							<div class="flex items-center gap-2">
								<form onsubmit={handleMfaCode}>
									<input
										class="rounded border border-red-600 px-2 py-1 text-xs"
										type="text"
										name="mfaCode"
									/>
									<button
										class="rounded border border-red-600 bg-red-500 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600"
										type="submit"
									>
										Send
									</button>
								</form>
							</div>
						{/if}
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
						onclick={() => toggleHistory(platform)}
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
					<div class="mt-2 flex flex-col">
						{#each connections[platform].steps as step}
							<ResultItem {step} />
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
