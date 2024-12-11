const apiKey = '33ac9e56-8a18-42d1-be45-9fb5a5f9ed27:51a2f75712fccd47a5e9dff77fee2f5066628cb8';

import axios from 'axios';
import { subHours, formatISO } from 'date-fns';
import dump from './dump.js';

async function fetchEvaluationsLast24Hours() {
  try {
    const baseUrl = 'https://api.evaluagent.com/v1/quality/evaluations';

    // Calculate the date range for the last 24 hours
    const now = new Date();
    const yesterday = subHours(now, 24);
    const dateRange = `${formatISO(yesterday)},${formatISO(now)}`;

    // Prepare query parameters
    const params = new URLSearchParams();
    params.append('filter[published_at;between]', dateRange);
    params.append('sort', '-published_at'); // Sort by published_at in descending order
    params.append('include', 'contacts'); // Include related contacts in the response

    // Make the API request
    const response = await axios.get(baseUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey).toString('base64')}`,
      },
      params,
    });

    // Return the evaluation data
    await dump(response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching evaluations from the last 24 hours:', error.response?.data || error.message);
    throw error;
  }
}

// Example Usage
(async () => {
  try {
    const evaluations = await fetchEvaluationsLast24Hours();
    console.log('Fetched Evaluations from Last 24 Hours:', evaluations);
  } catch (error) {
    console.error('Failed to fetch evaluations:', error.message);
  }
})();