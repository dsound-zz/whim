export interface FetchEventsParams {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  startDate?: Date;
  endDate?: Date;
  category?: string;
  limit: number;
  offset: number;
}

export * from './submission';

