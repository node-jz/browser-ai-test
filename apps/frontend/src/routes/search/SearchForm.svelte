<script lang="ts">
	import type { DateRange, HotelDetails, SearchProps } from '@api/search/platforms/types';
	type Suggestion = {
		mainText: string;
		secondaryText: string;
		place_id: string;
	};

	type SearchFormProps = {
		onSubmit: (data: SearchProps) => void;
	};
	let { onSubmit }: SearchFormProps = $props();

	let hotelName = $state<string>('');
	let suggestions = $state<Suggestion[]>([]);
	let hasSuggestions = $derived(suggestions.length > 0);
	let selectedHotel = $state<HotelDetails | null>(null);
	let dateRanges = $state<DateRange[]>([{ from: '', to: '' }]);
	let adults = $state<number>(1);
	let children = $state<number>(0);
	let childrenAges = $state<number[]>([]);

	let platforms = $state([
		{ name: 'Duffel', value: 'duffel', checked: true, blocked: false, type: 'private' },
		{ name: 'Beds Online', value: 'bedsonline', checked: true, blocked: false, type: 'private' },
		{ name: 'Webbeds', value: 'webbeds', checked: true, blocked: false, type: 'private' },
		{ name: 'TPI', value: 'tpi', checked: true, blocked: false, type: 'private' },
		{ name: 'Travel Edge', value: 'traveledge', checked: true, blocked: false, type: 'private' },
		{ name: 'Fora', value: 'fora', checked: true, blocked: false, type: 'private' },
		{ name: 'Expedia', value: 'expedia', checked: true, blocked: true, type: 'public' },
		{ name: 'Priceline', value: 'priceline', checked: true, blocked: true, type: 'public' },
		{ name: 'Booking.com', value: 'bookingcom', checked: true, blocked: false, type: 'public' },
		{ name: 'Google Hotels', value: 'googleHotels', checked: true, blocked: false, type: 'public' }
	]);

	const GOOGLE_API_KEY: string = import.meta.env.VITE_GOOGLE_API_KEY;

	function debounce(func: (...args: any[]) => void, wait: number) {
		let timeout: NodeJS.Timeout;
		return function (...args: any[]) {
			clearTimeout(timeout);
			timeout = setTimeout(() => func(...args), wait);
		};
	}

	async function fetchSuggestions(): Promise<void> {
		if (hotelName.trim().length < 5) return;
		try {
			const response = await fetch(`https://places.googleapis.com/v1/places:autocomplete`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Goog-Api-Key': GOOGLE_API_KEY
				},
				body: JSON.stringify({
					input: hotelName
				})
			});
			const data = await response.json();
			suggestions = data.suggestions.map((item) => ({
				mainText: item.placePrediction.structuredFormat.mainText.text,
				secondaryText: item.placePrediction.structuredFormat.secondaryText.text,
				place_id: item.placePrediction.placeId
			}));
		} catch (error) {
			console.error('Error fetching suggestions:', error);
		}
	}

	const debouncedFetchSuggestions = debounce(fetchSuggestions, 300);

	async function fetchHotelDetails(placeId: string): Promise<void> {
		try {
			const response = await fetch(
				`https://places.googleapis.com/v1/places/${placeId}?fields=location,addressComponents,formattedAddress,displayName&key=${GOOGLE_API_KEY}`,
				{
					headers: {
						'X-Goog-Api-Key': GOOGLE_API_KEY,
						'X-Goog-FieldMask': 'location,addressComponents,formattedAddress,displayName'
					}
				}
			);
			const data = await response.json();
			data.addressComponents.forEach((component: any) => {
				if (component.types.includes('locality')) {
					data.city = component.longText;
				} else if (component.types.includes('administrative_area_level_1')) {
					data.state = component.shortText;
				}
			});
			data.displayName = data.displayName.text;
			selectedHotel = data;
			suggestions = [];
		} catch (error) {
			console.error('Error fetching hotel details:', error);
		}
	}

	function addDateRange(): void {
		dateRanges = [...dateRanges, { from: '', to: '' }];
	}

	function submitForm(): void {
		const formData: SearchProps = {
			hotel: selectedHotel as HotelDetails,
			dateRanges,
			adults,
			children: childrenAges,
			platforms: platforms.filter((platform) => platform.checked).map((platform) => platform.value)
		};
		onSubmit?.(formData);
	}

	function updateChildrenAgesOnChildrenChange() {
		if (children > childrenAges.length) {
			childrenAges = [...childrenAges, ...Array(children - childrenAges.length).fill(1)];
		} else {
			childrenAges = childrenAges.slice(0, children);
		}
	}

	function selectNoneOfType(type: 'private' | 'public') {
		platforms = platforms.map((platform) => ({
			...platform,
			checked: platform.type === type ? false : platform.checked
		}));
	}
</script>

<div class="mx-auto w-full max-w-md rounded-lg bg-white p-8 shadow-md">
	<h2 class="mb-4 text-xl font-semibold">Find and Book a Hotel</h2>
	<div>
		<label class="mb-2 block text-sm font-medium">Hotel Name</label>
		<input
			type="text"
			bind:value={hotelName}
			oninput={debouncedFetchSuggestions}
			class="mb-3 w-full rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
		/>
		{#if hasSuggestions}
			<ul class="mt-1 rounded-md border bg-white shadow-lg">
				{#each suggestions as suggestion}
					<li
						class="cursor-pointer p-2 hover:bg-blue-50"
						onclick={() => fetchHotelDetails(suggestion.place_id)}
					>
						<strong>{suggestion.mainText}</strong>,
						<span class="text-sm text-gray-600">{suggestion.secondaryText}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if selectedHotel}
		<div class="mt-4">
			<h3 class="text-lg font-medium">Selected Hotel</h3>
			<p class="text-sm text-gray-600">{selectedHotel.displayName}</p>
			<p class="text-sm text-gray-600">{selectedHotel.formattedAddress}</p>
		</div>
	{/if}

	<div class="mt-6">
		<h4 class="mb-3 text-lg font-medium">Dates</h4>
		{#each dateRanges as dateRange, i (i)}
			<div class="mb-4 flex items-center space-x-2">
				<input
					type="date"
					bind:value={dateRange.from}
					class="rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
				/>
				<span>to</span>
				<input
					type="date"
					bind:value={dateRange.to}
					class="rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
				/>
			</div>
		{/each}
	</div>

	<div class="mt-6">
		<h4 class="mb-3 text-lg font-medium">Guests</h4>
		<div class="flex space-x-4">
			<div>
				<label class="mb-1 block text-sm font-medium">Adults</label>
				<select
					bind:value={adults}
					class="w-16 rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
				>
					{#each Array(11)
						.fill(0)
						.map((_, i) => i) as n}
						<option value={n}>{n}</option>
					{/each}
				</select>
			</div>
			<div>
				<label class="mb-1 block text-sm font-medium">Children</label>
				<select
					bind:value={children}
					onchange={updateChildrenAgesOnChildrenChange}
					class="w-16 rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
				>
					{#each Array(11)
						.fill(0)
						.map((_, i) => i) as n}
						<option value={n}>{n}</option>
					{/each}
				</select>
			</div>
		</div>
		{#if children > 0}
			<div class="mt-4">
				<h5 class="mb-2 text-sm font-medium">Children's Ages</h5>

				<div class="flex space-x-4">
					{#each childrenAges as age, i}
						<select
							bind:value={childrenAges[i]}
							class="mb-2 w-16 rounded-md border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
						>
							{#each Array(18)
								.fill(0)
								.map((_, j) => j + 1) as ageOption}
								<option value={ageOption}>{ageOption}</option>
							{/each}
						</select>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<div class="mt-6">
		<h4 class="mb-1 text-lg font-medium">Platforms</h4>
		<div class="mb-2 text-xs text-gray-600">
			<span class="font-bold text-red-500">*</span>these platforms are blocked and will just link to
			the search page.
		</div>
		<div class="mb-6 flex flex-col gap-2">
			<span class="mb-1 text-sm font-medium text-gray-600"
				>Private Services <button
					class="text-xs font-bold text-blue-500"
					onclick={() => selectNoneOfType('private')}>select none</button
				></span
			>
			<div class="grid grid-cols-2 gap-3">
				{#each platforms.filter((platform) => platform.type === 'private') as platform}
					<div>
						<input type="checkbox" bind:checked={platform.checked} value={platform.value} />
						<label
							>{platform.name}{#if platform.blocked}
								<span class="text-xs font-bold text-red-500">*</span>
							{/if}</label
						>
					</div>
				{/each}
			</div>
		</div>
		<div class="flex flex-col gap-2">
			<span class="mb-1 text-sm font-medium text-gray-600"
				>Public Websites <button
					class="text-xs font-bold text-blue-500"
					onclick={() => selectNoneOfType('public')}>select none</button
				></span
			>
			<div class="grid grid-cols-2 gap-4">
				{#each platforms.filter((platform) => platform.type === 'public') as platform}
					<div>
						<input type="checkbox" bind:checked={platform.checked} value={platform.value} />
						<label
							>{platform.name}{#if platform.blocked}
								<span class="text-xs font-bold text-red-500">*</span>
							{/if}</label
						>
					</div>
				{/each}
			</div>
		</div>
	</div>
	<div class="mt-6">
		<button
			onclick={submitForm}
			class="w-full rounded-md bg-green-500 p-3 font-medium text-white focus:outline-none focus:ring-2 focus:ring-green-600"
		>
			Find Bookings
		</button>
	</div>
</div>

<style>
	/* Optional additional custom styles */
</style>
