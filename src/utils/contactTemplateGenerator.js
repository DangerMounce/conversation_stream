import fs from "fs";
import fsP from "fs/promises"
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from 'uuid';
import chalk from "chalk";
import ffmpeg from 'fluent-ffmpeg';
import logger from "./logger.js";
import { wayBackMachine, callStreamDir, ticketStreamDir } from "../../stream.js";
import { subMinutes, addMinutes, formatISO } from "date-fns"; // To handle date manipulation
import dump from "./dump.js";
import { convertTicketToAudio } from "./ttsGenerator.js";
import { evaluagent } from "./apiUtils.js";
import { deleteGeneratedCalls } from "./loadConfig.js";

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
        handling_time: 120,
        customer_telephone_number: "01753 877212",
        audio_file_path: "",
        metadata: {
            Filename: "",
            Contact: "Call",
            audio_length_seconds: 0
        },
            responses_stored_externally : true
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
                if (deleteGeneratedCalls) {
                deleteAudioFile(audioFilePath)
                }
                // Round down to the nearest second
                resolve(Math.floor(duration));
            } else {
                reject('Unable to retrieve audio duration.');
            }
        });
    });

}

export async function deleteAudioFile(audioFilePath) {
    // Delete the local file after a successful upload
    try {
        await fsP.unlink(audioFilePath);
        logger.info(`Successfully deleted audio file: ${audioFilePath}`);
    } catch (deleteError) {
        logger.warn(`Failed to delete audio file: ${audioFilePath}. Error: ${deleteError.message}`);
    }
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

export async function getCallList(ticketsDir) {
    let jsonFiles = [];

    try {
        if (fs.existsSync(ticketsDir) && fs.lstatSync(ticketsDir).isDirectory()) {
            const filesInTickets = fs.readdirSync(ticketsDir);
            jsonFiles = filesInTickets
                .filter(file => path.extname(file) === '.mp3')
                .map(file => path.join(ticketsDir, file));
        } else {
            logger.error(`Directory not found: ${ticketsDir}`);
        }
    } catch (error) {
        logger.error(`Error reading directory: ${error.message}`);
    }
    logger.info(`Got list of calls`);
    jsonFiles = reformatPaths(jsonFiles, ticketStreamDir);
    return jsonFiles;
}

export async function getTicketList(ticketsDir) {
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
    // Adjust contact date
    const now = new Date();
    const contactDate = subMinutes(now, 60); // Set contact_date to 60 minutes earlier
    let currentTimestamp = contactDate;

    chatTemplate.data.reference = generateUUID();
    chatTemplate.data.agent_id = selectedAgent.agent_id;
    chatTemplate.data.agent_email = selectedAgent.email;
    chatTemplate.data.channel = "Chat";

    chatTemplate.data.contact_date = getDate(wayBackMachine);
    chatTemplate.data.assigned_at = getDate(wayBackMachine);
    chatTemplate.data.solved_at = getDate(wayBackMachine);

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

export async function createCallTemplate(agentList, targetCall, key) {
    const fsPromises = fs.promises;

    // Select an agent randomly from the list
    const selectedAgent = agentList[Math.floor(Math.random() * agentList.length)];

    // Adjust contact date
    const now = new Date();
    const contactDate = subMinutes(now, 60); // Set contact_date to 60 minutes earlier

    let ticketResponses = null;

    // Read the ticket JSON file
    // try {
    //     ticketResponses = await fsPromises.readFile(targetJSON, "utf-8");
    //     chatTemplate.data.responses = JSON.parse(ticketResponses); // Assuming the structure is similar to chatTemplate
    //     logger.info(`Got responses from JSON: ${targetJSON}`);
    // } catch (err) {
    //     logger.error(`An error occurred reading the file: ${targetJSON}: ${err.message}`);
    //     throw err;
    // }

    // Convert the ticket to an audio file
    const audioFilename = targetCall; // Returns the filename of the converted audio
    const audioFilepath = path.resolve(targetCall); // Ensure absolute path
    // Verify the generated audio file exists
    // if (!fs.existsSync(audioFilepath)) {
    //     logger.error(`Generated audio file not found: ${audioFilepath}`);
    //     throw new Error("Audio file error");
    // }

    // Upload the audio file to Evaluagent
    try {
        logger.debug(`Passing through to uploadAudio... ${audioFilepath}`)
        callTemplate.data.audio_file_path = await evaluagent.uploadAudioToEvaluagent(audioFilepath, key);
        logger.info(`Audio file uploaded successfully: ${callTemplate.data.audio_file_path}`);
    } catch (uploadError) {
        logger.error(`Error uploading audio file: ${uploadError.message}`);
        throw uploadError;
    }

    // Populate the call template
    callTemplate.data.reference = generateUUID();
    callTemplate.data.agent_id = selectedAgent.agent_id;
    callTemplate.data.agent_email = selectedAgent.email;
    callTemplate.data.contact_date = getDate(wayBackMachine);
    callTemplate.data.assigned_at = getDate(wayBackMachine);
    callTemplate.data.solved_at = getDate(wayBackMachine);
    callTemplate.data.channel = "Telephony";
    callTemplate.data.metadata.Filename = await fileNameOnly(audioFilename);

    // Calculate and set handling time
    try {
        const handlingTimeInSeconds = await getAudioLength(audioFilepath); // Get duration of the audio file
        callTemplate.data.handling_time = handlingTimeInSeconds;
        callTemplate.data.metadata.audio_length_seconds = handlingTimeInSeconds
        logger.info(`Handling time set to ${handlingTimeInSeconds} seconds.`);
    } catch (audioError) {
        callTemplate.data.handling_time = 156
        throw audioError;
    }

    return callTemplate; // Return the completed call template
}