import path from 'path';
import fs from 'fs/promises';
import { parse } from 'csv-parse/sync';

import { findOutcomeByContactReference } from './evaluationResults.js';
import logger from './logger.js';

const csvFilePath = path.resolve('export_log.csv');
const keyFilePath = path.resolve('./src/config/keyFile.json');

async function processCsvRowsWithMissingOutcomes(csvFilePath) {
    try {
        const keyFileContent = await fs.readFile(keyFilePath, 'utf8');
        const { keys } = JSON.parse(keyFileContent);

        const csvContent = await fs.readFile(csvFilePath, 'utf8');

        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true,
            relax_column_count: true
        });

        const rowsWithMissingOutcomes = records
            .filter(row => row['Contract Name'] && row['Contact Reference'] && !row['Outcome']?.trim())
            .map(row => {
                const apiKeyEntry = keys.find(key => key.name === row['Contract Name']);
                row.apiKey = apiKeyEntry ? apiKeyEntry.key : null;
                return row;
            })
            .filter(row => row.apiKey !== null);

        return { rowsWithMissingOutcomes };
    } catch (error) {
        logger.error(`Error processing CSV: ${error.message}`);
        throw error;
    }
}

async function updateOutcomesForRows(rowsWithMissingOutcomes) {
    for (const row of rowsWithMissingOutcomes) {
        const { 'Contact Reference': contactReference, apiKey, Filename } = row;

        if (!contactReference || !apiKey) {
            logger.warn(`Skipping row due to missing data: ${JSON.stringify(row)}`);
            continue;
        }

        try {
            const outcome = await findOutcomeByContactReference(contactReference, apiKey);
            if (!outcome) {
                logger.warn(`No valid outcome for Contact Reference: ${contactReference}`);
                continue;
            }

            row.Outcome = Filename.includes('_c_100') && outcome === 'Pass' ? 'OK' : outcome;
            logger.info(`Updated Outcome for Contact Reference ${contactReference} to ${row.Outcome}`);
        } catch (error) {
            logger.error(`Error fetching outcome: ${error.message}`);
        }
    }

    return rowsWithMissingOutcomes.filter(row => row.Outcome);
}

async function updateCsvWithOutcomes(csvFilePath, rowsWithUpdatedOutcomes) {
    const csvContent = await fs.readFile(csvFilePath, 'utf8');
    const rows = csvContent.split('\n').map(row => row.split(','));
    const headers = rows[0];
    const dataRows = rows.slice(1);

    const outcomeIndex = headers.indexOf('Outcome');

    rowsWithUpdatedOutcomes.forEach(updatedRow => {
        const rowToUpdate = dataRows.find(row => row[headers.indexOf('Contact Reference')] === updatedRow['Contact Reference']);
        if (rowToUpdate) {
            rowToUpdate[outcomeIndex] = updatedRow.Outcome;
        } else {
            logger.warn(`Row not found for Contact Reference: ${updatedRow['Contact Reference']}`);
        }
    });

    const updatedCsv = [headers.join(','), ...dataRows.map(row => row.join(','))].join('\n');
    await fs.writeFile(csvFilePath, updatedCsv, 'utf8');
    logger.info('export_log.csv updated successfully');
}

export async function checkQualityOfStream() {
    try {
        const { rowsWithMissingOutcomes } = await processCsvRowsWithMissingOutcomes(csvFilePath);
        const updatedOutcomes = await updateOutcomesForRows(rowsWithMissingOutcomes);
        await updateCsvWithOutcomes(csvFilePath, updatedOutcomes);
    } catch (error) {
        logger.error(`Error: ${error.message}`);
    }
}

checkQualityOfStream();
