// Script for api related functions
import axios from "axios";
import chalk from "chalk";
import path from "path";
import fs from 'fs';
import fsP from 'fs/promises'
import FormData from "form-data";
import logger from "./logger.js";
import { getDate } from "./contactTemplateGenerator.js";
import { checkQualityOfStream } from "./exportLogUpdate.js"
import { getUser } from "../../stream.js";
import dump from "./dump.js";
import { database } from "./dbRecording.js";

let agentRoleId
let agentList
// Make API call to evaluagent
async function fetchApi(endpoint, apiKey) {
    const apiUrl = "https://api.evaluagent.com/v1";
    const url = `${apiUrl}${endpoint}`;
    try {
        const response = await axios.get(url, {
            headers: { Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}` },
        });
        return response.data.data;
    } catch (error) {
        logger.error(`Error fetching ${endpoint}`)
        logger.error(error.message)
        throw error;
    }
}

// Get agent list from api
async function getAgents(apiKey) {
    try {
        const roleResponse = await fetchApi("/org/roles", apiKey);
        if (!roleResponse || roleResponse.length === 0) {
            logger.error("Roles data is empty or unavailable")
            throw new Error("Unable to fetch agents");
        }
        const agentRole = roleResponse.find((role) => role.attributes.name === "agent");
        if (!agentRole) {
            logger.error("Agent role not found in roles data.")
            throw new Error("Unable to fetch agents");
        }
        agentRoleId = agentRole.id;
        logger.http(`agentRoleId is ${agentRoleId}`)
        const users = await fetchApi("/org/users", apiKey);
        if (!users || users.length === 0) {
            logger.error("Users data is empty or unavailable")
            throw new Error("Unable to fetch agents");
        }
        agentList = users
            .filter((user) =>
                user.relationships.roles.data.some(
                    (role) => role.id === agentRoleId && user.attributes.active
                )
            )
            .map((agent) => ({
                name: agent.attributes.fullname,
                email: agent.attributes.email,
                agent_id: agent.id,
            }));

        // Filter out agents without an email
        agentList = agentList.filter((agent) => agent.email);
        logger.http(`Found ${agentList.length} agents`)
        return agentList;
    } catch (error) {
        logger.error(`Error in getAgents`)
        logger.error(error.message)
        throw error;
    }
}

// Send the contact record to evaluagent
async function sendContactToEvaluagent(contactTemplate, apiKey, name) {
    const targetedJSON = contactTemplate.data.metadata.Filename;
    const agentEmail = contactTemplate.data.agent_email;
    const referenceLogFile = path.join(process.cwd(), 'export_log.csv'); // Path for the reference log file

    logger.info(`Target file is ${targetedJSON}. Assigned agent is ${agentEmail}`);

    // try {
        const apiUrl = "https://api.evaluagent.com/v1";
        const endpoint = `${apiUrl}/quality/imported-contacts`;
        logger.info('Sending contact to evaluagent');
        logger.debug(`Skipping sending to evaluagent`)
        await updateReferenceLog(contactTemplate.data.reference, targetedJSON, name);

    //     const response = await fetch(endpoint, {
    //         method: "POST",
    //         headers: {
    //             "Content-Type": "application/json",
    //             Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`
    //         },
    //         body: JSON.stringify(contactTemplate)
    //     });

    //     // Check if the response is successful
    //     if (!response.ok) {
    //         const errorDetails = await response.json();
    //         logger.error(`Error in sendContactsToEvaluagent: ${response.status} - ${response.statusText}`);
    //         logger.http(`Response: ${JSON.stringify(errorDetails)}`);
    //         return;
    //     }

    //     const result = await response.json();

    //     // Process the response and log contact reference
    //     if (result.message) {
    //         logger.http(`${contactTemplate.data.reference} - ${result.message}`);
    //         await updateReferenceLog(contactTemplate.data.reference, targetedJSON, name);
    //     } else if (result.errors) {
    //         logger.error(`${contactTemplate.data.reference} - ${result.errors}`);
    //     }
    // } catch (error) {
    //     logger.error(`Error in sendContactsToEvaluagent: ${error.message}`);
    // }
}

// Helper function to update the contact reference log
async function updateReferenceLog(reference, filename, name) {
    const currentUser = getUser()
    const payload = {
        "timestamp": getDate(),
        "user_name": currentUser,
        "contract_name": name,
        "filename": filename,
        "contact_reference": reference,
        "outcome": null
    }
    
    try {
        logger.debug('Skipping sending data to db')
        // await database.sendData(payload)
    } catch (error) {
        logger.warn(`Error updating export log: ${error.message}`);
    }
    // Optionally call a quality check function
    await checkQualityOfStream(); 

}

async function uploadAudioToEvaluagent(audioFile, apiKey) {
    const apiUrl = "https://api.evaluagent.com/v1";
    const url = `${apiUrl}/quality/imported-contacts/upload-audio`;


    if (!audioFile || typeof audioFile !== "string") {
        logger.error("Audio file path is invalid or undefined");
        throw new Error("Audio file path must be a valid string");
    }

    // Normalize and validate path
    const normalizedPath = path.resolve(audioFile);

    if (!fs.existsSync(normalizedPath)) {
        logger.error(`Audio file does not exist: ${normalizedPath}`);
        throw new Error("Audio file not found.");
    }

    const headers = {
        Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`,
    };

    try {

        const fileStream = fs.createReadStream(normalizedPath);
        if (!fileStream) {
            throw new Error(`File stream is undefined for path: ${normalizedPath}`);
        }


        const formData = new FormData();
        formData.append("audio_file", fileStream);



        // Send POST request
        const response = await axios.post(url, formData, {
            headers: {
                ...formData.getHeaders(), // Use headers generated by FormData
                ...headers,
            },
        });

        if (!response.data || !response.data.path) {
            logger.error("No path received in the response from Evaluagent.");
            throw new Error("Upload failed. No path returned.");
        }

        logger.info(`path_to_audio: ${response.data.path}`);

        return response.data.path;
    } catch (error) {
        logger.error(`There was a problem with the audio upload for file: ${normalizedPath}`);
        logger.error(chalk.red(error.message));
        throw error; // Re-throw for upstream handling
    }
}


export const evaluagent = {
    getAgents,
    sendContactToEvaluagent,
    uploadAudioToEvaluagent
}