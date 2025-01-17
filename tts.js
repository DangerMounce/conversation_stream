import fs from 'fs';
import path from 'path';
import { convertTicketToAudio } from './ttsGenerator2.js';

const dataDir = './data'; // Path to the data directory

async function collectJsonFilePaths() {
    try {
        const filePaths = [];
        const directories = fs.readdirSync(dataDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        const ticketDirs = directories.filter(dir => dir.endsWith('import_tickets'));
        for (const ticketDir of ticketDirs) {
            const ticketDirPath = path.join(dataDir, ticketDir);
            const jsonFiles = fs.readdirSync(ticketDirPath)
                .filter(file => file.endsWith('.json'))
                .map(file => ({
                    filePath: path.join(ticketDirPath, file),
                    callDir: path.join(dataDir, ticketDir.replace('_tickets', '_calls'))
                }));

            filePaths.push(...jsonFiles);
        }

        return filePaths;
    } catch (error) {
        console.error(`Error collecting JSON file paths: ${error.message}`);
        return [];
    }
}

async function main() {
    try {
        const jsonFileDetails = await collectJsonFilePaths();

        console.log('Collected JSON file paths with call directories:');

        for (const { filePath, callDir } of jsonFileDetails) {
            console.log(`File: ${filePath}, Call Directory: ${callDir}`);
            await convertTicketToAudio(filePath, callDir); // Use the correct arguments here
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
}


// Execute the script
main();
