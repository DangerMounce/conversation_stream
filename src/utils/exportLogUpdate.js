import path from 'path';
import fs from 'fs/promises';

import { findOutcomeByContactReference } from './evaluationResults.js';

const csvFilePath = path.resolve('../../export_log.csv'); // Path to your CSV file
const keyFilePath = path.resolve('../config/keyFile.json');

async function processCsvRowsWithMissingOutcomes(csvFilePath) {
    try {
        // Load the key file
        const keyFileContent = await fs.readFile(keyFilePath, 'utf8');
        const { keys } = JSON.parse(keyFileContent);

        // Read the CSV content
        const csvContent = await fs.readFile(csvFilePath, 'utf8');
        const rows = csvContent.split('\n').map(row => row.split(',').map(cell => cell.trim())); // Basic CSV parsing with trimming

        // Extract headers and data
        const headers = rows[0]; // First row as headers
        const dataRows = rows.slice(1); // Remaining rows as data

        // Ensure required headers are present
        const requiredHeaders = ['Contract Name', 'Date', 'Filename', 'Contact Reference', 'Outcome'];
        const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
        if (missingHeaders.length > 0) {
            throw new Error(`Missing headers: ${missingHeaders.join(', ')}`);
        }

        const contractNameIndex = headers.indexOf('Contract Name');
        const outcomeIndex = headers.indexOf('Outcome');

        // Filter rows with missing outcomes and construct objects
        const rowsWithMissingOutcomes = dataRows
            .filter(row => row.length > outcomeIndex && row[outcomeIndex] === '') // Check if Outcome column exists and is empty
            .map(row => {
                const rowObject = {};
                headers.forEach((header, index) => {
                    rowObject[header] = row[index];
                });

                // Add the API key to the row object
                const contractName = row[contractNameIndex];
                const apiKeyEntry = keys.find(keyEntry => keyEntry.name === contractName);

                if (apiKeyEntry) {
                    rowObject.apiKey = apiKeyEntry.key; // Updated to match the correct property in keyFile.json
                } else {
                    console.warn(`No API key found for contract name: "${contractName}"`);
                    rowObject.apiKey = null; // Indicate missing API key
                }

                return rowObject;
            })
            .filter(rowObject => rowObject.apiKey !== null); // Ensure Contract Name has a valid API key

        return rowsWithMissingOutcomes;
    } catch (error) {
        console.error(`Error processing CSV: ${error.message}`);
        throw error;
    }
}

async function updateOutcomesForRows(rowsWithMissingOutcomes) {
    try {
        // Iterate over each row and update the outcome
        for (const row of rowsWithMissingOutcomes) {
            const { 'Contact Reference': contactReference, apiKey } = row;

            if (!contactReference || !apiKey) {
                console.warn(`Skipping row due to missing Contact Reference or API Key:`, row);
                continue; // Skip rows with missing essential data
            }

            try {
                // Call findOutcomeByContactReference and add the result to the Outcome field
                const outcome = await findOutcomeByContactReference(contactReference, apiKey);

                if (outcome === 'Pass' || outcome === 'Fail') {
                    row.Outcome = outcome; // Only update with valid results
                } else {
                    console.warn(`Skipping row due to invalid outcome for Contact Reference: ${contactReference}`);
                }
            } catch (error) {
                console.error(`Error fetching outcome for Contact Reference: ${contactReference}`, error.message);
            }
        }

        console.log('Updated rows with valid outcomes:', rowsWithMissingOutcomes);
        return rowsWithMissingOutcomes;
    } catch (error) {
        console.error('Error updating rows with outcomes:', error.message);
        throw error;
    }
}

// Example Usage
(async () => {
    try {
        const rowsWithMissingOutcomes = await processCsvRowsWithMissingOutcomes(csvFilePath);
        console.log('Rows with Missing Outcomes and API Keys:', rowsWithMissingOutcomes);
        await updateOutcomesForRows(rowsWithMissingOutcomes);
        console.log('Rows with added Outcomes and API Keys:', rowsWithMissingOutcomes);
    } catch (error) {
        console.error('Error:', error.message);
    }
})();
