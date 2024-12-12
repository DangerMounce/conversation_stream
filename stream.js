import path from "path";
import fs from "fs";
import { checkForUpdate } from "./autoUpdate.js";
import logger from "./src/utils/logger.js";
import inquirer from "inquirer";
import chalk from "chalk";
import apiKeysMenu from "./src/utils/apikeyMenu.js";
import { ticketStream, callStream, loadConfig } from './src/utils/loadConfig.js';
import { evaluagent } from "./src/utils/apiUtils.js";
import dump from "./src/utils/dump.js";
import { getDate, createChatTemplate, createCallTemplate, getTicketList } from "./src/utils/contactTemplateGenerator.js";



const apiKeysPath = path.resolve("./src/config/keyFile.json");
const logFilePath = path.resolve("./logs/app.log");

const topicsFilePath = path.resolve("./src/config/topics.json");
const baseDir = path.resolve("./data"); // Base directory for the topics

export let ticketStreamDir = null
export let callStreamDir = null
export let importStream = false;

// Retrieve the command-line argument for wayBackMachine
export const wayBackMachine = (() => {
    const wayBackArg = process.argv[2];
    if (wayBackArg && !isNaN(wayBackArg)) {
        return parseInt(wayBackArg, 10);
    }
    return 0; // Default value
})();

const delaySetting = (() => {
    const intervalArg = process.argv[3];
    if (intervalArg && !isNaN(intervalArg)) {
        return parseInt(intervalArg, 10);
    }
    return 60; // Default value
})();

// Format the delay for the log
function formatTime(seconds) {
    if (seconds >= 86400) { // 1 day = 86400 seconds
        const days = (seconds / 86400).toFixed(2);
        return `${days} day${days > 1 ? 's' : ''}`;
    } else if (seconds >= 3600) { // 1 hour = 3600 seconds
        const hours = (seconds / 3600).toFixed(2);
        return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (seconds >= 60) { // 1 minute = 60 seconds
        const minutes = (seconds / 60).toFixed(2);
        return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
        return `${seconds} second${seconds > 1 ? 's' : ''}`;
    }
}

// Sets delay
async function delay(seconds) {
    const timeMessage = formatTime(seconds);
    logger.silly(`¯\_(ツ)_/¯`)
    logger.silly(`Waiting ${timeMessage}`);
    const ms = seconds * 1000;
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Function to read topics from topics.json and ensure directories are created
const ensureDirectories = () => {
    try {
        // Read and parse topics.json
        const topicsData = JSON.parse(fs.readFileSync(topicsFilePath, "utf-8"));
        const baseTopics = topicsData.topics;

        // Ensure the base directory exists
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir);
            logger.info(`Base directory created: ${baseDir}`);
        }

        // Create _calls and _tickets directories for each base topic
        baseTopics.forEach((baseTopic) => {
            const callsDir = path.join(baseDir, `${baseTopic}_calls`);
            const ticketsDir = path.join(baseDir, `${baseTopic}_tickets`);

            // Create the _calls directory if it doesn't exist
            if (!fs.existsSync(callsDir)) {
                fs.mkdirSync(callsDir);
                logger.info(`Directory created: ${callsDir}`);
            }

            // Create the _tickets directory if it doesn't exist
            if (!fs.existsSync(ticketsDir)) {
                fs.mkdirSync(ticketsDir);
                logger.info(`Directory created: ${ticketsDir}`);
            }
        });
    } catch (error) {
        logger.error("Error creating directories:", error.message);
    }
};

// Menu to clear the app log
async function clearLog() {
    const { clearLog } = await inquirer.prompt([
        {
            type: "confirm",
            name: "clearLog",
            message: "Do you want to clear the log file?",
        },
    ]);

    if (clearLog) {
        try {
            fs.writeFileSync(logFilePath, "");
        } catch (error) {
            logger.error("Failed to clear the log file:", error.message);
        }
    }

    logger.info("Initialising new stream");
}

// Menu for stream or injection
async function streamSelection() {
    try {
        const lockFilePath = path.resolve("./src/config/.lock");
        const isBaselineDisabled = fs.existsSync(lockFilePath);

        const choices = [
            {
                name: 'Baseline Stream',
                value: 'Baseline Stream',
                disabled: isBaselineDisabled ? 'locked' : false,
            },
            {
                name: 'Injection',
                value: 'Injection',
            },
            {
                name: chalk.green('Exit'),
                value: 'Exit',
            },
        ];

        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'stream',
                message: chalk.bold.yellow('Stream type:'),
                choices,
            },
        ]);

        const stream = answers.stream;
        if (stream === 'Exit') {
            console.clear('');
            process.exit(0);
        } else if (stream === 'Baseline Stream') {
            logger.info(`Baseline Stream set`);
            return true;
        } else {
            logger.info('Conversation Injection set');
            return false;
        }

    } catch (error) {
        logger.error(`Error in streamSelection: ${error.message}`);
    }
}

// Menu to select topic for injection
async function topicSelection() {
    try {
        const topicsData = JSON.parse(fs.readFileSync(topicsFilePath, "utf-8"));
        const baseTopics = topicsData.topics;

        const { selectedTopic } = await inquirer.prompt([
            {
                type: 'list',
                name: 'selectedTopic',
                message: chalk.bold.cyan('Select a topic for injection:'),
                choices: baseTopics,
            },
        ]);

        return selectedTopic;
    } catch (error) {
        logger.error(`Error in topicSelection: ${error.message}`);
        throw error;
    }
}

// Ask the user yes or no to continue
async function yesOrNo(question) {
    console.log('');
    try {
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmation',
                message: chalk.bold.yellow(question),
                default: false // Set default value as needed
            }
        ]);

        const confirmation = answers.confirmation;
        if (!confirmation) {
            process.exit(1);
        } else {
            return;
        }
    } catch (error) {
        console.error(chalk.red(`Error in yesOrNo: ${error.message}`));
    }
}

async function startStreamLoop(apiKeyArray) {

    while (true) {
        try {
            // Iterate over each API key object in the array
            for (const { name, key } of apiKeyArray) {
                if (ticketStream) {
                    logger.silly(`********** d[ o_0 ]b  Creating a new ticket for "${name}" d[ o_0 ]b  **********`)
                    // Run the specified code block for the current API key
                    const agentList = await evaluagent.getAgents(key)
                    const ticketList = await getTicketList(ticketStreamDir)
                    if (ticketList.length === 0) {
                        logger.error(`No tickets found in ${ticketStreamDir}`);
                        logger.debug(ticketStreamDir)
                        process.exit(1);
                    }

                    const targetJSON = ticketList[Math.floor(Math.random() * ticketList.length)];
                    logger.info(`Target ticket set as "${targetJSON}"`);
                    const contactTemplate = await createChatTemplate(agentList, targetJSON);
                    await evaluagent.sendContactToEvaluagent(contactTemplate, key, name)
                    await delay(5) // wait 5 seconds before moving to next api call
                }

                if (callStream) {
                    logger.silly(`**********  |[●▪▪●]| Creating a new call for "${name}"  |[●▪▪●]| **********`)
                    // Run the specified code block for the current API key
                    const agentList = await evaluagent.getAgents(key)
                    const ticketList = await getTicketList(ticketStreamDir)
                    if (ticketList.length === 0) {
                        logger.error(`No tickets found in ${ticketStreamDir}`);
                        logger.debug(ticketStreamDir)
                        process.exit(1);
                    }

                    const targetJSON = ticketList[Math.floor(Math.random() * ticketList.length)];
                    logger.info(`Target ticket for audio conversion set as "${targetJSON}"`);
                    const contactTemplate = await createCallTemplate(agentList, targetJSON, key);
                    await evaluagent.sendContactToEvaluagent(contactTemplate, key, name)
                    await delay(5) // wait 5 seconds before moving to next api call
                }
            }
        } catch (error) {
            logger.error(`Error in stream loop: ${error.message}`);
            console.error(error)
        }
        await delay(delaySetting)
    }
}

async function startInjection(apiKeyArray, selectedTopic) {
    const ticketList = await getTicketList(ticketStreamDir)
    if (ticketList.length === 0) {
        logger.error(`No tickets found in ${ticketStreamDir}`);
        process.exit(1);
    }
    let ticketNumber = 0;

    while (true) {
        try {
            // Iterate over each API key object in the array
            for (const { name, key } of apiKeyArray) {
                if (ticketStream) {
                    logger.silly(`**********   Creating a new ticket for "${name}"  **********`)
                    // Run the specified code block for the current API key
                    const agentList = await evaluagent.getAgents(key)
                    const targetJSON = ticketList[ticketNumber];
                    logger.info(`Target ticket set as "${targetJSON}"`);
                    const contactTemplate = await createChatTemplate(agentList, targetJSON);
                    await evaluagent.sendContactToEvaluagent(contactTemplate, key, name)
                    ticketNumber++
                    if (ticketNumber === ticketList.length) {
                        logger.info(`${ticketNumber} contacts processed.  Injection complete.`)
                        return false
                    }
                    await delay(5) // wait 5 seconds before moving to next api call
                }

                if (callStream) {
                    logger.silly(`**********   Creating a new call for "${name}"  **********`)
                    // Run the specified code block for the current API key
                    const agentList = await evaluagent.getAgents(key)
                    const targetJSON = ticketList[ticketNumber];
                    logger.info(`Target ticket for audio conversation set as "${targetJSON}"`);
                    const contactTemplate = await createCallTemplate(agentList, targetJSON, key);
                    await evaluagent.sendContactToEvaluagent(contactTemplate, key, name)
                    ticketNumber++
                    if (ticketNumber === ticketList.length) {
                        logger.info(`${ticketNumber} contacts processed.  Injection complete.`)
                        return false
                    }
                    await delay(5) // wait 5 seconds before moving to next api call                
                }
            }
        } catch (error) {
            logger.error(`Error in stream loop: ${error.message}`);
            console.error(error)
        }
        await delay(delaySetting)
    }
}

async function main() {
    console.clear('');    
    await checkForUpdate()
    await clearLog();
    ensureDirectories();
    loadConfig();
    const stream = await streamSelection();
    const apiKeyArray = await apiKeysMenu();

    if (stream) {
        console.log('');
        ticketStreamDir = path.resolve("data/stream_tickets"); // Updated to use path.resolve
        callStreamDir = path.resolve("data/stream_calls");     // Updated to use path.resolve
        logger.debug(`Resolved ticketStreamDir: ${ticketStreamDir}`);
        logger.debug(`Resolved callStreamDir: ${callStreamDir}`);
        logger.warn(`Stream Tickets: ${ticketStream}`)
        logger.warn(`Stream Calls: ${callStream}`)
        logger.warn(`wayBackMachine set at ${wayBackMachine} days (${getDate(wayBackMachine)})`)
        logger.warn(`Time delay set at ${formatTime(delaySetting)}`)
        logger.info('All set to proceed.')
        console.log('');
        console.log('🍻 evaluagent live - conversation stream 🍻');
        await yesOrNo('Ready to start stream?')
        // start stream loop
        startStreamLoop(apiKeyArray)
    } else { // It's an injection of conversations
        // Prompt user to select a topic
        const selectedTopic = await topicSelection();
        if (selectedTopic === "import") {
            importStream = true
        }
        // Set the directories based on the selected topic
        ticketStreamDir = path.resolve(`data/${selectedTopic}_tickets`); // Updated to use path.resolve
        callStreamDir = path.resolve(`data/${selectedTopic}_calls`);     // Updated to use path.resolve
        logger.info(`Ticket Directory: ${ticketStreamDir}`);
        logger.info(`Calls Directory: ${callStreamDir}`);
        logger.warn(`Stream Tickets: ${ticketStream}`)
        logger.warn(`Stream Calls: ${callStream}`)
        logger.warn(`wayBackMachine set at ${wayBackMachine} days (${getDate(wayBackMachine)})`)
        logger.warn(`Time delay set at ${formatTime(delaySetting)}`)
        logger.info('All set to proceed.')
        console.log('');
        console.log('🍻 evaluagent live - conversation injection 🍻');
        await yesOrNo('Ready to start injection?')
        // We need 5 convo types of each
        startInjection(apiKeyArray, selectedTopic)
    }
}

main();