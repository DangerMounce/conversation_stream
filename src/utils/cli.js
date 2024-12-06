import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';

const keyFilePath = path.resolve('../config/keyFile.json');

// Helper: Load API keys from the JSON file
const loadKeys = () => {
  if (!fs.existsSync(keyFilePath)) {
    console.log('Key file not found. Creating a new one...');
    fs.writeFileSync(keyFilePath, JSON.stringify({ keys: [] }, null, 2));
    return [];
  }
  const data = JSON.parse(fs.readFileSync(keyFilePath, 'utf-8'));
  return data.keys || [];
};

// Helper: Save API keys to the JSON file
const saveKeys = (keys) => {
  fs.writeFileSync(keyFilePath, JSON.stringify({ keys }, null, 2));
};

// CLI Menu
const menu = async () => {
  const choices = [
    { name: 'List all API keys', value: 'list' },
    { name: 'Add a new API key', value: 'add' },
    { name: 'Remove an existing API key', value: 'remove' },
    { name: 'Exit', value: 'exit' },
  ];

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices,
    },
  ]);

  return action;
};

// List all keys
const listKeys = () => {
  const keys = loadKeys();
  if (keys.length === 0) {
    console.log('No API keys found.');
  } else {
    console.log('Stored API keys:');
    keys.forEach(({ name, key }, index) => {
      console.log(`${index + 1}. Name: ${name}, Key: ${key}`);
    });
  }
};

// Add a new key
const addKey = async () => {
  const { name, key } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Enter a name for the API key:',
    },
    {
      type: 'input',
      name: 'key',
      message: 'Enter the API key:',
    },
  ]);

  const keys = loadKeys();
  if (keys.find((entry) => entry.key === key)) {
    console.log('This API key already exists.');
  } else {
    keys.push({ name, key });
    saveKeys(keys);
    console.log('API key added successfully!');
  }
};

// Remove an existing key
const removeKey = async () => {
  const keys = loadKeys();
  if (keys.length === 0) {
    console.log('No API keys to remove.');
    return;
  }

  const { keyToRemove } = await inquirer.prompt([
    {
      type: 'list',
      name: 'keyToRemove',
      message: 'Select the key to remove:',
      choices: keys.map(({ name, key }) => ({ name: `${name} (${key})`, value: key })),
    },
  ]);

  const updatedKeys = keys.filter((entry) => entry.key !== keyToRemove);
  saveKeys(updatedKeys);
  console.log('API key removed successfully!');
};

// Main function to run the CLI
const runCLI = async () => {
  let exit = false;
  while (!exit) {
    const action = await menu();

    switch (action) {
      case 'list':
        listKeys();
        break;
      case 'add':
        await addKey();
        break;
      case 'remove':
        await removeKey();
        break;
      case 'exit':
        exit = true;
        console.log('Exiting the CLI tool.');
        break;
      default:
        console.log('Invalid action. Please try again.');
    }

    if (!exit) {
      console.log('\n'); // Add some spacing between actions
    }
  }
};

// Run the CLI
runCLI();