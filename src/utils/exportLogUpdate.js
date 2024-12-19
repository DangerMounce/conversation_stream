import path from 'path';
import fs from 'fs/promises';
import { parse } from 'csv-parse/sync';
import { database } from './dbRecording.js';
import { findOutcomeByContactReference } from './evaluationResults.js';
import logger from './logger.js';
import dump from './dump.js';

const keyFilePath = path.resolve('./src/config/keyFile.json');


async function updateOutcomesForRows(rowsWithMissingOutcomes) {
    for (const row of rowsWithMissingOutcomes) {
        const { 'Contact Reference': contactReference, apiKey, Filename } = row;

        if (!contactReference || !apiKey) {
            logger.warn(`Skipping row due to missing data: ${JSON.stringify(row)}`);
            continue; // Skip rows with missing essential data
        }

        try {
            // Call findOutcomeByContactReference
            const outcome = await findOutcomeByContactReference(contactReference, apiKey);

            // If no valid outcome, skip updating this row
            if (!outcome) {
                logger.warn(`No valid evaluation result for Contact Reference: ${contactReference}`);
                continue; // Do not update the outcome
            }

            // Adjust outcome logic based on Filename
            if (Filename.includes('_c_100')) {
                if (outcome === 'Pass') {
                    row.Outcome = 'OK'; // Change PASS to OK for matching filenames
                    logger.http(`Contact Reference: ${contactReference} has passed.`);
                } else if (outcome === 'Fail') {
                    row.Outcome = 'Fail'; // Keep FAIL as it is
                    logger.warn(`Contact Reference: ${contactReference} has failed.`);
                } else {
                    logger.warn(`${outcome}`);
                    continue; // Skip invalid outcomes
                }
            } else {
                // For all other filenames, set outcome to OK
                row.Outcome = 'OK';
                logger.http(`Contact Reference: ${contactReference} has passed.`);
            }
        } catch (error) {
            logger.error(`Error fetching outcome for Contact Reference: ${contactReference}: ${error.message}`);
        }
    }

    // Return only rows where the Outcome has been updated
    const updatedRows = rowsWithMissingOutcomes.filter(row => row.Outcome);
    return updatedRows;
}


// Obtain results of quality evaluations done on contacts
export async function checkQualityOfStream() {

    // Need to get the records of missing outcomes
    const recordsToCheck = await database.fetchNullOutcomes()
    await updateAllOutcomes(recordsToCheck)
}

// Function to load API keys from keyFile
async function loadApiKey(contractName) {
    try {
        // Read and parse the key file
        const keyFileContent = await fs.readFile(keyFilePath, 'utf-8');
        const { keys } = JSON.parse(keyFileContent);

        // Find the matching API key
        const keyEntry = keys.find((key) => key.name === contractName);
        if (!keyEntry) {
            logger.error(`API key not found for contract_name: ${contractName}`);
            throw new Error(`API key not found for contract_name: ${contractName}`);
        }
        return keyEntry.key; // Return the API key
    } catch (error) {
        logger.error(`Error loading API key for contract_name ${contractName}: ${error.message}`);
        throw error;
    }
}


export async function updateAllOutcomes(records) {
    try {
        for (const record of records) {
            const { contact_reference, id, contract_name } = record;

            if (!contact_reference || !id || !contract_name) {
                logger.warn(`Record missing contact_reference, id, or contract_name. Skipping record: ${JSON.stringify(record)}`);
                continue; // Skip invalid records
            }

            let ea_apiKey;
            try {
                // Load the API key for the current contract_name
                ea_apiKey = await loadApiKey(contract_name);
            } catch (error) {
                logger.warn(error.message);
                continue; // Skip if no API key is found
            }

            try {
                // Find the outcome using the existing function
                const outcome = await findOutcomeByContactReference(contact_reference, ea_apiKey);

                if (outcome.startsWith('No evaluation')) {
                    logger.warn(`No evaluation result for contact_reference: ${contact_reference}. Skipping update.`);
                    continue;
                }

                // Update the record in the database
                record.outcome = outcome; // Add outcome to the record
                await database.updateOutcome(record);
                logger.info(`Successfully updated outcome for contact_reference: ${contact_reference}`);
            } catch (innerError) {
                logger.error(`Error processing record with contact_reference: ${contact_reference} - ${innerError.message}`);
            }
        }
    } catch (outerError) {
        logger.error(`Error updating outcomes: ${outerError.message}`);
    }
}

