export interface FetchEventsParams {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  startDate?: Date;
  endDate?: Date;
  timeframe?: 'tonight' | 'next_2_days' | 'this_week';
  category?: string;
  search?: string;
  limit: number;
  offset: number;
}

export * from './submission';
export * from './audit';

