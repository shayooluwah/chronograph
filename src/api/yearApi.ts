import axios from 'axios';
import type { HistoricalEvent } from '../types';

/**
 * Fetches historical events for a given year from the Vercel serverless
 * function at /api/year and returns them as a typed HistoricalEvent array.
 *
 * @param year - The four-digit year to query (e.g. 1754)
 * @throws {Error} when the network request fails or the server returns a
 *                 non-2xx status code
 */
export async function fetchYearEvents(year: number): Promise<HistoricalEvent[]> {
  const { data } = await axios.get<HistoricalEvent[]>('/api/year', {
    params: { year },
    // Surface an error instead of leaving the loading overlay up indefinitely
    timeout: 30_000,
  });

  return data;
}
