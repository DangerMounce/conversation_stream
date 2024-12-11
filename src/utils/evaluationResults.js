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
    return response.data;
  } catch (error) {
    console.error('Error fetching evaluations from the last 24 hours:', error.response?.data || error.message);
    throw error;
  }
}

export async function findOutcomeByContactReference(targetContactReference) {
  try {
    // Fetch the data asynchronously
    const data = await fetchEvaluationsLast24Hours();

    // Validate the data structure
    if (!data || !Array.isArray(data.included) || !Array.isArray(data.data)) {
      throw new Error('Invalid data structure');
    }

    // Find the contact with the matching contact_reference
    const contact = data.included.find(
      (item) =>
        item.type === 'contacts' &&
        item.attributes?.contact_reference === targetContactReference
    );

    if (!contact) {
      return `No contact found with reference: ${targetContactReference}`;
    }

    // Find the evaluation associated with the contact
    const evaluationId = contact.relationships?.evaluation?.data?.id;

    if (!evaluationId) {
      return `No evaluation associated with the contact reference: ${targetContactReference}`;
    }

    // Find the evaluation details in the main data array
    const evaluation = data.data.find(
      (item) => item.type === 'evaluations' && item.id === evaluationId
    );

    if (!evaluation) {
      return `No evaluation found for the contact reference: ${targetContactReference}`;
    }

    // Return the outcome from the evaluation attributes
    return evaluation.attributes?.outcome || 'Outcome not available';
  } catch (error) {
    console.error(`Error finding outcome for contact reference ${targetContactReference}:`, error.message);
    throw error;
  }
}

// Example Usage
(async () => {
  try {
    const outcome = await findOutcomeByContactReference('a2c6d370-1f69-4bd9-8bb1-08738c30643c');
    console.log(`Outcome: ${outcome}`);
  } catch (error) {
    console.error('Failed to find outcome:', error.message);
  }
})();