import path from 'path';
import fs from 'fs/promises';

import { findOutcomeByContactReference } from './evaluationResults.js';
import logger from './logger.js';

const csvFilePath = path.resolve('export_log.csv'); // Path to your CSV file
const keyFilePath = path.resolve('./src/config/keyFile.json');

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
            logger.error(`Missing headers: ${missingHeaders.join(', ')}`)
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
                    logger.warn(`No API key found for contract name: "${contractName}"`);
                    rowObject.apiKey = null; // Indicate missing API key
                }

                return rowObject;
            })
            .filter(rowObject => rowObject.apiKey !== null); // Ensure Contract Name has a valid API key

        return { headers, dataRows, rowsWithMissingOutcomes };
    } catch (error) {
        logger.error(`Error processing CSV: ${error.message}`);
        throw error;
    }
}

async function updateOutcomesForRows(rowsWithMissingOutcomes) {
    try {
        // Iterate over each row and update the outcome
        for (const row of rowsWithMissingOutcomes) {
            const { 'Contact Reference': contactReference, apiKey, Filename } = row;

            if (!contactReference || !apiKey) {
                logger.warn(`Skipping row due to missing Contact Reference or API Key:`, row);
                continue; // Skip rows with missing essential data
            }

            try {
                // Call findOutcomeByContactReference
                let outcome = await findOutcomeByContactReference(contactReference, apiKey);

                // Adjust outcome logic based on Filename
                if (Filename.includes('_c_100')) {
                    if (outcome === 'Pass') {
                        row.Outcome = 'OK'; // Change PASS to OK for matching filenames
                    } else if (outcome === 'Fail') {
                        row.Outcome = 'Fail'; // Keep FAIL as it is
                        logger.warn(`${contactReference} has failed.`)
                    } else {
                        logger.info(`${outcome}. Skipping row.`);
                        continue;
                    }
                } else {
                    row.Outcome = 'OK'; // Set outcome as OK for other filenames
                }
            } catch (error) {
                logger.error(`Error fetching outcome for Contact Reference: ${contactReference}`, error.message);
            }
        }
        return rowsWithMissingOutcomes;
    } catch (error) {
        logger.error('Error updating rows with outcomes:', error.message);
    }
}

async function updateCsvWithOutcomes(csvFilePath, rowsWithUpdatedOutcomes) {
    try {
        // Read the original CSV content
        const csvContent = await fs.readFile(csvFilePath, 'utf8');
        const rows = csvContent.split('\n').map(row => row.split(',').map(cell => cell.trim())); // Basic CSV parsing with trimming

        const headers = rows[0]; // Extract headers
        const dataRows = rows.slice(1); // Extract data rows

        // Update the original rows with the new outcomes
        const outcomeIndex = headers.indexOf('Outcome');
        for (const updatedRow of rowsWithUpdatedOutcomes) {
            const rowToUpdate = dataRows.find(row => row.includes(updatedRow['Contact Reference']));
            if (rowToUpdate) {
                rowToUpdate[outcomeIndex] = updatedRow.Outcome; // Update the Outcome column
            }
        }

        // Reconstruct the CSV
        const updatedCsv = [headers.join(','), ...dataRows.map(row => row.join(','))].join('\n');
        await fs.writeFile(csvFilePath, updatedCsv, 'utf8');
        logger.info('export_log.csv updated successfully');
    } catch (error) {
        logger.error('Error updating export_log.csv with outcomes:', error.message);
    }
}


export async function checkQualityOfStream() {
    logger.info('Performing quality check on stream...')
    try {
        const { headers, dataRows, rowsWithMissingOutcomes } = await processCsvRowsWithMissingOutcomes(csvFilePath);
        const updatedOutcomes = await updateOutcomesForRows(rowsWithMissingOutcomes);
        await updateCsvWithOutcomes(csvFilePath, updatedOutcomes);
    } catch (error) {
        logger.error('Error:', error.message);
    }
}
