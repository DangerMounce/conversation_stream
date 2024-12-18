// autoUpdate.js
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import inquirer from 'inquirer';
import { execSync } from 'child_process';

// Constants
const REPO_OWNER = 'DangerMounce';
const REPO_NAME = 'conversation_stream';
const BRANCH = 'main';
const LOCAL_VERSION_FILE = path.resolve('./version.json');
const TEMP_ZIP_PATH = path.resolve('./update.zip');
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const GITHUB_ZIP_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${BRANCH}.zip`;

// Fetch the latest commit hash from GitHub
async function fetchLatestCommit() {
    try {
        const response = await fetch(`${GITHUB_API_URL}/commits/${BRANCH}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch latest commit: ${response.statusText}`);
        }
        const commitData = await response.json();
        return commitData.sha;
    } catch (error) {
        console.error('Error fetching latest commit:', error.message);
        throw error;
    }
}

// Get the locally stored commit hash
function getLocalCommitHash() {
    if (fs.existsSync(LOCAL_VERSION_FILE)) {
        const versionData = JSON.parse(fs.readFileSync(LOCAL_VERSION_FILE, 'utf8'));
        return versionData.commit || null;
    }
    return null;
}

// Update the local commit hash
function updateLocalCommitHash(commitHash) {
    const versionData = { commit: commitHash };
    fs.writeFileSync(LOCAL_VERSION_FILE, JSON.stringify(versionData, null, 2));
    console.log('Updated local version file.');
}

// Prompt the user to confirm the update
async function promptUpdate() {
    const { confirmUpdate } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'confirmUpdate',
            message: 'A new version is available. Do you want to update?',
        },
    ]);
    return confirmUpdate;
}

// Download and extract the ZIP file
async function downloadAndExtract() {
    try {
        console.log('Downloading update...');
        const response = await fetch(GITHUB_ZIP_URL);
        if (!response.ok) {
            throw new Error(`Failed to download ZIP: ${response.statusText}`);
        }
        const buffer = await response.buffer();
        fs.writeFileSync(TEMP_ZIP_PATH, buffer);

        console.log('Extracting update...');
        const zip = new AdmZip(TEMP_ZIP_PATH);
        zip.extractAllTo('./', true);

        console.log('Replacing files...');
        const extractedDir = path.resolve(`./${REPO_NAME}-${BRANCH}`);
        const files = fs.readdirSync(extractedDir);

        for (const file of files) {
            const src = path.join(extractedDir, file);
            const dest = path.resolve('./', file);

            if (fs.lstatSync(src).isDirectory()) {
                fs.cpSync(src, dest, { recursive: true });
            } else {
                fs.copyFileSync(src, dest);
            }
        }

        // Clean up
        fs.rmSync(extractedDir, { recursive: true, force: true });
        fs.unlinkSync(TEMP_ZIP_PATH);
        console.log('Update completed successfully!');
    } catch (error) {
        console.error('Error during update:', error.message);
        throw error;
    }
}

// Main function to check for updates and process them
export async function checkForUpdate() {
    try {
        console.log('Checking for updates...');
        const latestCommit = await fetchLatestCommit();
        const localCommit = getLocalCommitHash();

        if (latestCommit !== localCommit) {
            console.log('New update available.');
            const confirmUpdate = await promptUpdate();
            if (confirmUpdate) {
                await downloadAndExtract();
                updateLocalCommitHash(latestCommit);
                console.log(chalk.bold.yellow(`Check README.md for any new dependencies following this update and restart the application.`))
                process.exit(0);
            } else {
                console.log('Update canceled.');
            }
        } else {
            console.log('You are already up-to-date.');
        }
    } catch (error) {
        console.error('Error in auto-update process:', error.message);
    }
}