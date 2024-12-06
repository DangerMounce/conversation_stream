import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import logger from './logger.js';
import chalk from 'chalk'

// Path to keyFile.json
const keyFilePath = path.resolve('./src/config/keyFile.json');

// Helper: Load API keys from JSON
const loadKeys = () => {
  if (!fs.existsSync(keyFilePath)) {
    logger.warn("Key file not found. Creating a new one...");
    fs.writeFileSync(keyFilePath, JSON.stringify({ keys: [] }, null, 2));
    return [];
  }

  const data = JSON.parse(fs.readFileSync(keyFilePath, 'utf-8'));
  return data.keys || [];
};

// API Keys Menu to return objects with name and key
const apiKeysMenu = async () => {
  try {
    const keys = loadKeys(); // Assumes loadKeys() reads from keyFile.json

    // If no keys exist, inform the user and exit
    if (keys.length === 0) {
      logger.error("No API keys found. Please add keys to keyFile.json first.");
      return [];
    }

    // Add an "All Keys" option to the choices
    const choices = keys.map((entry) => ({
      name: entry.name,
      value: entry,
    }));

    choices.push({
      name: "All Keys",
      value: "ALL",
    });

    // Prompt the user to select a key or All
    const { selectedKey } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedKey',
        message: 'Select an API key or All:',
        choices,
      },
    ]);

    // Handle "All" selection
    if (selectedKey === "ALL") {
      return keys; // Return all keys (objects with name and key)
    }

    // Handle individual key selection
    return [selectedKey];
  } catch (error) {
    logger.error("Error in API keys menu:", error.message);
    return [];
  }
};

export default apiKeysMenu;