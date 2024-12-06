import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from 'uuid';
import chalk from "chalk";
import ffmpeg from 'fluent-ffmpeg';
import logger from "./logger.js";
import { wayBackMachine, callStreamDir, ticketStreamDir } from "../../stream.js";
import { subMinutes, addMinutes, formatISO } from "date-fns"; // To handle date manipulation
import dump from "./dump.js";

export let chatTemplate = {
    data: {
        reference: "",
        agent_id: "",
        agent_email: "",
        contact_date: "",
        channel: "",
        assigned_at: "",
        solved_at: "",
        external_url: "https://www.evaluagent.com/platform/product-tours/",
        responses_stored_externally: "true",
        responses: [],
        metadata: {
            Filename: "",
            Status: "",
            AgentResponses: "",
            Contact: "Ticket"
        }
    }
};

export let callTemplate = {
    data: {
        reference: "",
        agent_id: "",
        agent_email: "",
        contact_date: "",
        channel: "Telephony",
        assigned_at: "",
        solved_at: "",
        external_url: "https://www.evaluagent.com/platform/product-tours/",
        responses_stored_externally: "true",
        handling_time: 120,
        customer_telephone_number: "01753 877212",
        audio_file_path: "",
        metadata: {
            Filename: "",
            Contact: "Call"
        }
    }
};

export async function getAudioLength(audioFilePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(audioFilePath, (err, metadata) => {
            if (err) {
                reject(`Error getting audio file length: ${err.message}`);
                return;
            }

            const duration = metadata.format.duration; // Duration in seconds
            if (duration) {
                resolve(duration);
            } else {
                reject('Unable to retrieve audio duration.');
            }
        });
    });
}

function generateUUID() {
    return uuidv4();
}

export function getDate(daysOffset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    return date.toISOString().split('.')[0] + "Z";
}

async function fileNameOnly(filename) {
    let base = filename.split('/').pop().split('.')[0]; // Fixed split logic
    return base;
}

export async function getTicketList() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const ticketsDir = path.join(__dirname, ticketStreamDir);
    let jsonFiles = [];

    try {
        if (fs.existsSync(ticketsDir) && fs.lstatSync(ticketsDir).isDirectory()) {
            const filesInTickets = fs.readdirSync(ticketsDir);
            jsonFiles = filesInTickets
                .filter(file => path.extname(file) === '.json')
                .map(file => path.join(ticketsDir, file));
        } else {
            logger.error(`Directory not found: ${ticketsDir}`);
        }
    } catch (error) {
        logger.error(`Error reading directory: ${error.message}`);
    }
    logger.info(`Got list of tickets`);
    jsonFiles = reformatPaths(jsonFiles, ticketStreamDir);
    return jsonFiles;
}

function reformatPaths(pathsArray, fullPath) {
    return pathsArray.map(p => {
        const index = p.indexOf(fullPath);
        return index !== -1 ? p.substring(index) : p;
    });
}


export async function createChatTemplate(agentList, targetJSON) {
    const fsPromises = fs.promises;
    const selectedAgent = agentList[Math.floor(Math.random() * agentList.length)];

    let ticketResponses = null;

    try {
        ticketResponses = await fsPromises.readFile(targetJSON, "utf-8");
        chatTemplate.data.responses = JSON.parse(ticketResponses);
        logger.info(`Got responses from JSON`);
    } catch (err) {
        logger.error(`An error occurred reading the file: ${targetJSON}: ${err.message}`);
        throw err;
    }

    const now = new Date();
    const contactDate = subMinutes(now, 60); // 60 minutes earlier
    let currentTimestamp = contactDate;

    chatTemplate.data.reference = generateUUID();
    chatTemplate.data.agent_id = selectedAgent.agent_id;
    chatTemplate.data.agent_email = selectedAgent.email;
    chatTemplate.data.channel = "Chat";

    chatTemplate.data.contact_date = formatISO(contactDate);
    chatTemplate.data.assigned_at = formatISO(contactDate);
    chatTemplate.data.solved_at = formatISO(contactDate);

    // Adjust each message's timestamp
    chatTemplate.data.responses.forEach((response, index) => {
        currentTimestamp = addMinutes(currentTimestamp, index === 0 ? 0 : 3); // Increment by 3 minutes
        response.message_created_at = formatISO(currentTimestamp);

        if (!response.speaker_is_customer) {
            response.speaker_email = chatTemplate.data.agent_email;
        }
    });

    chatTemplate.data.metadata.Filename = await fileNameOnly(targetJSON);
    chatTemplate.data.metadata.AgentResponses = chatTemplate.data.responses.filter(
        (response) => !response.speaker_is_customer
    ).length;

    return chatTemplate;
}

export async function createCallTemplate(agentList) {
    const fsPromises = fs.promises;
    const selectedAgent = agentList[Math.floor(Math.random() * agentList.length)];

    // Select a ticket to convert to audio
    const ticketList = await getTicketList();
    if (ticketList.length === 0) {
        logger.error(`No tickets found in ${ticketStreamDir}`);
        throw new Error(`No tickets found`);
    }
    const targetJSON = ticketList[Math.floor(Math.random() * ticketList.length)];
    logger.info(`Target ticket set as "${targetJSON}"`);

    // Convert the ticket to audio
    const audioFilename = await convertTicketToAudio(targetJSON); // Returns the filename of the converted audio
    const audioFilepath = `${callStreamDir}/${audioFilename}`;

    // Verify the file exists before processing
    if (!fs.existsSync(audioFilepath)) {
        logger.info(`Generated audio file not found - ${audioFilepath}`);
        throw new Error("Audio file error");
    }

    // Upload the audio to evaluagent
    callTemplate.data.audio_file_path = await evaluagent.uploadAudioToEvaluagent(audioFilepath);

    // Create template
    callTemplate.data.reference = generateUUID();
    callTemplate.data.agent_id = selectedAgent.agent_id;
    callTemplate.data.agent_email = selectedAgent.email;

    // Adjust contact_date and timestamps
    const now = new Date();
    const contactDate = subMinutes(now, 60); // Set contact_date to 60 minutes earlier
    callTemplate.data.contact_date = formatISO(contactDate);
    callTemplate.data.assigned_at = formatISO(contactDate);
    callTemplate.data.solved_at = formatISO(contactDate);

    callTemplate.data.channel = "Telephony";
    callTemplate.data.metadata.Filename = await fileNameOnly(audioFilename);

    // Calculate handling time (in seconds)
    const handlingTimeInSeconds = await getAudioLength(audioFilepath); // Returns handling time in seconds
    callTemplate.data.handling_time = handlingTimeInSeconds;

    // Generate simulated responses based on handling time
    const responseCount = Math.floor(handlingTimeInSeconds / 30); // Assume one response every 30 seconds
    let currentTimestamp = contactDate;
    callTemplate.data.responses = Array.from({ length: responseCount }, (_, index) => {
        currentTimestamp = addSeconds(currentTimestamp, 30); // Increment by 30 seconds per response
        return {
            response_id: (index + 1).toString(),
            speaker_email: index % 2 === 0 ? selectedAgent.email : "customer@unknown.com", // Alternate speakers
            message: index % 2 === 0 ? "Agent's response text." : "Customer's response text.",
            speaker_is_customer: index % 2 !== 0, // Alternate speaker flag
            channel: "Telephony",
            message_created_at: formatISO(currentTimestamp),
        };
    });

    logger.info(`Handling time: ${handlingTimeInSeconds} seconds. Generated ${responseCount} responses.`);

    return callTemplate;
}