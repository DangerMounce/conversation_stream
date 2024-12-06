// src/updateChecker.js
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import AdmZip from 'adm-zip';
import logger from './src/utils/logger.js';

// Constants
const REPO_OWNER = "DangerMounce";
const REPO_NAME = "conversation_stream";
const LOCAL_VERSION_FILE = path.resolve('./version.json');
const TEMP_UPDATE_DIR = path.resolve('./temp_update');
const BACKUP_DIR = path.resolve('./backup');
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

// Helper: Fetch GitHub API
async function fetchGitHubAPI(endpoint) {
    try {
        const response = await fetch(`${GITHUB_API_URL}${endpoint}`);
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.statusText}`);
        }
        return response.json();
    } catch (error) {
        throw new Error(`Failed to fetch from GitHub API: ${error.message}`);
    }
}

// Check for updates
export async function checkForUpdates() {
    logger.info("Checking for updates...");
    try {
        const latestRelease = await fetchGitHubAPI('/releases/latest');
        const latestVersion = latestRelease.tag_name;

        // Read local version
        let localVersion = "0.0.0";
        if (fs.existsSync(LOCAL_VERSION_FILE)) {
            const versionData = JSON.parse(fs.readFileSync(LOCAL_VERSION_FILE, 'utf8'));
            localVersion = versionData.version;
        }

        logger.info(`Local version: ${localVersion}, Latest version: ${latestVersion}`);

        if (localVersion === latestVersion) {
            logger.info("You are already up-to-date!");
            return;
        }

        // Prompt user for update
        const { shouldUpdate } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'shouldUpdate',
                message: `Update available (${latestVersion}). Do you want to update?`,
            },
        ]);

        if (shouldUpdate) {
            await backupCurrentFiles();
            await downloadAndInstall(latestRelease.zipball_url, latestVersion);
        }
        logger.warn("Restart required")
        process.exit(0)
    } catch (error) {
        logger.error("Error during update check:", error.message);
    }
}

// Backup current files
async function backupCurrentFiles() {
    try {
        console.log("Creating a backup...");
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }

        const filesToBackup = fs.readdirSync('./');
        for (const file of filesToBackup) {
            if (file !== BACKUP_DIR && file !== TEMP_UPDATE_DIR && file !== 'node_modules') {
                const srcPath = path.resolve('./', file);
                const destPath = path.join(BACKUP_DIR, file);

                // Copy directories and files
                if (fs.statSync(srcPath).isDirectory()) {
                    fs.cpSync(srcPath, destPath, { recursive: true });
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        }
        console.log("Backup completed successfully.");
    } catch (error) {
        throw new Error(`Failed to create a backup: ${error.message}`);
    }
}

// Download and install the update
async function downloadAndInstall(zipUrl, latestVersion) {
    try {
        console.log("Downloading update...");

        const response = await fetch(zipUrl);
        if (!response.ok) {
            throw new Error(`Failed to download ZIP: ${response.statusText}`);
        }

        const buffer = await response.buffer();
        if (!fs.existsSync(TEMP_UPDATE_DIR)) {
            fs.mkdirSync(TEMP_UPDATE_DIR, { recursive: true });
        }

        const zipPath = path.join(TEMP_UPDATE_DIR, 'update.zip');
        fs.writeFileSync(zipPath, buffer);

        console.log("Extracting update...");
        const zip = new AdmZip(zipPath);
        zip.extractAllTo('./', true);

        // Cleanup temporary files
        fs.rmSync(TEMP_UPDATE_DIR, { recursive: true, force: true });

        // Update local version file
        fs.writeFileSync(
            LOCAL_VERSION_FILE,
            JSON.stringify({ version: latestVersion }, null, 2),
        );

        console.log("Update installed successfully!");
    } catch (error) {
        console.error("Error during update installation:", error.message);

        console.log("Attempting rollback...");
        rollback();
    }
}

// Rollback to previous version
function rollback() {
    try {
        if (!fs.existsSync(BACKUP_DIR)) {
            console.error("No backup found for rollback.");
            return;
        }

        const backupFiles = fs.readdirSync(BACKUP_DIR);
        for (const file of backupFiles) {
            const srcPath = path.join(BACKUP_DIR, file);
            const destPath = path.resolve('./', file);

            // Restore directories and files
            if (fs.statSync(srcPath).isDirectory()) {
                fs.cpSync(srcPath, destPath, { recursive: true });
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }

        console.log("Rollback completed successfully.");
    } catch (error) {
        console.error("Failed to rollback:", error.message);
    }
}


//Automate with GH actions