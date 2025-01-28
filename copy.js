import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

// Configuration
const SEARCH_DIR = '/Users/chrismounce/desktop/projects/conversation_stream/data';

/**
 * Prompt the user for input via the terminal.
 * @param {string} question - The prompt message.
 * @returns {Promise<string>} - The user input.
 */
const askQuestion = (question) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
};

/**
 * Recursively search for the most recent occurrence of a file in a directory.
 * @param {string} dir - The directory to search in.
 * @param {string} filename - The filename to search for.
 * @returns {Promise<string|null>} - The path of the most recent file or null if not found.
 */
const findMostRecentFile = async (dir, filename) => {
    let latestFile = null;
    let latestMtime = 0;

    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                // Recursive search in subdirectories
                const subDirFile = await findMostRecentFile(fullPath, filename);
                if (subDirFile) {
                    const subDirStats = await fs.stat(subDirFile);
                    if (subDirStats.mtimeMs > latestMtime) {
                        latestMtime = subDirStats.mtimeMs;
                        latestFile = subDirFile;
                    }
                }
            } else if (entry.isFile() && entry.name === filename) {
                const stats = await fs.stat(fullPath);
                if (stats.mtimeMs > latestMtime) {
                    latestMtime = stats.mtimeMs;
                    latestFile = fullPath;
                }
            }
        }
    } catch (error) {
        console.error(`Error searching in directory ${dir}: ${error.message}`);
    }

    return latestFile;
};

/**
 * Copy a file to the target directory.
 * @param {string} sourceFile - The source file path.
 * @param {string} targetDir - The target directory.
 */
const copyFileToTarget = async (sourceFile, targetDir) => {
    try {
        const fileName = path.basename(sourceFile);
        const destination = path.join(targetDir, fileName);

        await fs.copyFile(sourceFile, destination);
        console.log(`File copied to: ${destination}`);
    } catch (error) {
        console.error(`Error copying file: ${error.message}`);
    }
};

/**
 * Main function to prompt the user and process the file.
 */
const main = async () => {
    const sourceDir = await askQuestion('Enter the target directory (source): ');
    const filename = await askQuestion('Enter the filename to search for: ');

    console.log(`Searching for the most recent "${filename}" in ${SEARCH_DIR}...`);
    const recentFile = await findMostRecentFile(SEARCH_DIR, filename);

    if (recentFile) {
        console.log(`Most recent file found: ${recentFile}`);
        await copyFileToTarget(recentFile, sourceDir);
    } else {
        console.log(`File "${filename}" not found in ${SEARCH_DIR}`);
    }
};

main();
