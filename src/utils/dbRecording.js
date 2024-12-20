import axios from 'axios'
import logger from "./logger.js";
import { dbApiKey } from '../../stream.js'

const dbUrl = "https://unynainnymoaazvqwizf.supabase.co"

// Fetch the data
async function fetchData() {
    try {
        const response = await axios.get(
            `${dbUrl}/rest/v1/contacts`,
            {
                headers: {
                    'apikey': dbApiKey,
                    'Authorization': `Bearer ${dbApiKey}`,
                    'Content-Type': `application/json`
                },
                // Optional query parameters (e.g., filters, ordering, etc.)
                params: {
                    select: '*', // Select all columns
                    order: 'id.asc' // Order by ID in ascending order
                }
            }
        );
        logger.debug(`Database record received: ${response.data}`)
    } catch (error) {
        logger.error('Error fetching data:', error.response ? error.response.data : error.message);
    }
}

// Function to send a POST request
async function sendData(payload) {
    try {
        const response = await axios.post(
            `${dbUrl}/rest/v1/contacts`,
            payload,
            {
                headers: {
                    'apikey' : dbApiKey,
                    'Authorization' : `Bearer ${dbApiKey}`,
                    'Content-Type' : 'application/json'
                }
            }
        );
        logger.http(`stream_db updated`);
    } catch (error) {
        logger.error('Error inserting data:', error.response ? error.response.data : error.message);
    }
}

// Function to fetch records with a null outcome
async function fetchNullOutcomes() {
    try {
        const response = await axios.get(
            `${dbUrl}/rest/v1/contacts`,
            {
                headers: {
                    'apikey': dbApiKey,
                    'Authorization': `Bearer ${dbApiKey}`,
                    'Content-Type': 'application/json'
                },
                // Query parameters to filter for null outcomes
                params: {
                    select: '*', // Select all columns
                    outcome: 'is.null' // Filter where outcome is NULL
                }
            }
        );
        
        return response.data
    } catch (error) {
        logger.error('Error fetching records with null outcomes:', error.response ? error.response.data : error.message);
    }
}

// Function to update the outcome of a record
async function updateOutcome(record) {
    try {
        // Ensure the input object has an `id`
        if (!record.id) {
            throw new Error('The record must have an "id" property to identify it in the database.');
        }

        // Ensure the record has an outcome
        if (record.outcome === undefined) {
            throw new Error('The record must have an "outcome" property to update it in the database.');
        }

        // Send a PATCH request to update the record in the database with its existing outcome
        const response = await axios.patch(
            `${dbUrl}/rest/v1/contacts?id=eq.${record.id}`, // Update the record by ID
            { outcome: record.outcome }, // Use the outcome from the record
            {
                headers: {
                    'apikey': dbApiKey,
                    'Authorization': `Bearer ${dbApiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        if (record.outcome === "Pass") {
            logger.info(`ID ${record.id} updated successfully with outcome: ${record.outcome}`);
        } else {
            logger.warn(`ID ${record.id} updated successfully with outcome: ${record.outcome}`);
        }
        
    } catch (error) {
        logger.error('Error updating record.', error.response ? error.response.data : error.message);
    }
}


export const database = {
    updateOutcome,
    fetchNullOutcomes,
    sendData
}
