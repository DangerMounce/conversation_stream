import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csv from 'csv-parser';

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the absolute path to the CSV file in the project root directory
const csvFilePath = path.resolve(__dirname, '../../export_log.csv');

async function getContractsWithMissingOutcomes(csvFilePath) {
    const contractsWithMissingOutcomes = [];

    return new Promise((resolve, reject) => {
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on('data', (row) => {
                // Check if the 'Outcome' column is empty
                if (!row['Outcome']) {
                    contractsWithMissingOutcomes.push(row['Contract Name']);
                }
            })
            .on('end', () => {
                console.log('CSV file processed successfully.');
                resolve(contractsWithMissingOutcomes);
            })
            .on('error', (error) => {
                console.error('Error reading the CSV file:', error.message);
                reject(error);
            });
    });
}

async function getContractApiKey(contractName) {
    const keyFilePath = path.resolve('../config/keyFile.json');

    try {
        // Read and parse the key file
        const fileContent = await fs.promises.readFile(keyFilePath, 'utf8');
        const { keys } = JSON.parse(fileContent);

        // Find the key for the provided contract name
        const contract = keys.find(keyEntry => keyEntry.name === contractName);

        if (!contract) {
            throw new Error(`API key not found for contract: ${contractName}`);
        }

        return contract.key;
    } catch (error) {
        console.error(`Error retrieving API key for contract '${contractName}': ${error.message}`);
        throw error;
    }    
}

// Function to process an array of contract names
async function processContractNames(contractNames) {
    const results = {};

    for (const contractName of contractNames) {
        try {
            const apiKey = await getContractApiKey(contractName);
            results[contractName] = apiKey;
        } catch (error) {
            results[contractName] = `Error: ${error.message}`;
        }
    }

    return results;
}

// Example usage
(async () => {
    try {
        const contracts = await getContractsWithMissingOutcomes(csvFilePath);
        
        try {
            const apiKeys = await processContractNames(contracts);
            console.log('API Keys:', apiKeys);
        } catch (error) {
            console.error('Error processing contract names:', error.message);
        }
    } catch (error) {
        console.error('Error processing the CSV file:', error.message);
    }
})();