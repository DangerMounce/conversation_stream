import fs from 'fs';
import path from 'path';
import logger from './logger.js';

const configFilePath = path.resolve('./src/config/config.json');

let ticketStream = false;
let callStream = false;
let deleteGeneratedCalls = false; // Add deleteGeneratedCalls

const loadConfig = () => {
  try {
    if (!fs.existsSync(configFilePath)) {
      console.error("Config file not found. Please create config.json in the config directory.");
      process.exit(1);
    }

    const configData = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));

    // Assign values to variables
    ticketStream = configData.ticketStream || false;
    callStream = configData.callStream || false;
    deleteGeneratedCalls = configData.deleteGeneratedCalls || false; // Assign deleteGeneratedCalls

    logger.info(
      `Config loaded: ticketStream=${ticketStream}, callStream=${callStream}, deleteGeneratedCalls=${deleteGeneratedCalls}`
    );
  } catch (error) {
    console.error(`Error reading config file: ${error.message}`);
    process.exit(1);
  }
};

export { ticketStream, callStream, deleteGeneratedCalls, loadConfig };