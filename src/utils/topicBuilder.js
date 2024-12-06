import fs from "fs";
import path from "path";
import inquirer from "inquirer";

const __dirname = path.resolve(); // Use to resolve relative paths

const topicsFilePath = path.resolve(__dirname, "../../src/config/topics.json");
const baseDir = path.resolve(__dirname, "../../data"); // Base directory for topics

// Helper: Load topics from JSON
const loadTopics = () => {
  if (!fs.existsSync(topicsFilePath)) {
    console.log("topics.json file not found. Creating a new one...");
    fs.writeFileSync(topicsFilePath, JSON.stringify({ topics: [] }, null, 2));
    return [];
  }
  const data = JSON.parse(fs.readFileSync(topicsFilePath, "utf-8"));
  return data.topics || [];
};

// Helper: Save topics to JSON
const saveTopics = (topics) => {
  fs.writeFileSync(topicsFilePath, JSON.stringify({ topics }, null, 2));
};

// List all topics
const listDirectories = () => {
  const topics = loadTopics();
  if (topics.length === 0) {
    console.log("No topics found.");
  } else {
    console.log("Current topics:");
    topics.forEach((topic, index) => console.log(`${index + 1}. ${topic}`));
  }
};

// Add a new topic
const addDirectory = async () => {
  const { dirTitle } = await inquirer.prompt([
    {
      type: "input",
      name: "dirTitle",
      message: "Enter the topic title:",
    },
  ]);

  const topics = loadTopics();

  // Ensure the topic is unique
  if (topics.includes(dirTitle)) {
    console.log(`The topic "${dirTitle}" already exists.`);
    return;
  }

  // Add the topic to the JSON file
  topics.push(dirTitle);

  // Create the _calls and _tickets directories
  const callsDir = path.join(baseDir, `${dirTitle}_calls`);
  const ticketsDir = path.join(baseDir, `${dirTitle}_tickets`);

  if (!fs.existsSync(callsDir)) {
    fs.mkdirSync(callsDir, { recursive: true });
    console.log(`Directory created: ${callsDir}`);
  }
  if (!fs.existsSync(ticketsDir)) {
    fs.mkdirSync(ticketsDir, { recursive: true });
    console.log(`Directory created: ${ticketsDir}`);
  }

  saveTopics(topics);
  console.log(`Topic "${dirTitle}" added successfully!`);
};

// Remove a topic
const removeDirectory = async () => {
  const { dirTitle } = await inquirer.prompt([
    {
      type: "input",
      name: "dirTitle",
      message: "Enter the topic title to delete:",
    },
  ]);

  const topics = loadTopics();

  if (!topics.includes(dirTitle)) {
    console.log(`The topic "${dirTitle}" does not exist.`);
    return;
  }

  // Remove the topic from the JSON file
  const updatedTopics = topics.filter((topic) => topic !== dirTitle);

  // Remove the physical directories
  const callsDir = path.join(baseDir, `${dirTitle}_calls`);
  const ticketsDir = path.join(baseDir, `${dirTitle}_tickets`);

  if (fs.existsSync(callsDir)) {
    fs.rmSync(callsDir, { recursive: true, force: true });
    console.log(`Directory removed: ${callsDir}`);
  }
  if (fs.existsSync(ticketsDir)) {
    fs.rmSync(ticketsDir, { recursive: true, force: true });
    console.log(`Directory removed: ${ticketsDir}`);
  }

  saveTopics(updatedTopics);
  console.log(`Topic "${dirTitle}" removed successfully!`);
};

// CLI Menu
const menu = async () => {
  const choices = [
    { name: "List all topics", value: "list" },
    { name: "Add a new topic", value: "add" },
    { name: "Remove an existing topic", value: "remove" },
    { name: "Exit", value: "exit" },
  ];

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices,
    },
  ]);

  return action;
};

// Main CLI Function
const runCLI = async () => {
  let exit = false;

  // Ensure base directory exists
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  while (!exit) {
    const action = await menu();

    switch (action) {
      case "list":
        listDirectories();
        break;
      case "add":
        await addDirectory();
        break;
      case "remove":
        await removeDirectory();
        break;
      case "exit":
        exit = true;
        console.log("Exiting the CLI tool.");
        break;
      default:
        console.log("Invalid action. Please try again.");
    }

    if (!exit) {
      console.log("\n"); // Add spacing between actions
    }
  }
};

runCLI();