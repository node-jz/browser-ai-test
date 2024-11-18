export type SearchProps = {
  dateRanges: DateRange[];
  hotel: HotelDetails;
  adults: number;
  children: number[];
  platforms: string[];
};

export type HotelDetails = {
  displayName: string;
  formattedAddress: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  city: string;
  state: string;
};

export type DateRange = {
  from: string;
  to: string;
};

export type SearchResult = {
  link: string;
  name: string;
  price: string;
  address: string;
};
