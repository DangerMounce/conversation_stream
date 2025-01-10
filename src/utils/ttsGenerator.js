import gTTS from 'gtts';
import fs from 'fs';
import path from 'path';
import fsP from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import chalk from 'chalk';
import { callStreamDir } from '../../stream.js';
import logger from './logger.js';

// Language/voice configurations
const customerVoice = 'en-uk'; // Customer voice (Australian English)
const agentVoice = 'en-us';    // Agent voice (British English)

let finalAudioFilename;

// Ensure the output directory exists
let outputDir = path.join(process.cwd(), 'audio_processing');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Function to extract messages from the JSON file
async function extractMessagesFromFile(filePath) {
    try {
        const data = await fsP.readFile(filePath, 'utf-8');
        const jsonData = JSON.parse(data);
        return jsonData.map(item => item.message);
    } catch (error) {
        logger.error(`Error reading or parsing file: ${error.message}`);
        throw error;
    }
}

// Function to convert text to speech
async function textToSpeech(text, outputFile, lang = 'en') {
    return new Promise((resolve, reject) => {
        const gtts = new gTTS(text, lang);
        gtts.save(outputFile, err => {
            if (err) {
                logger.error(`Error: ${err.message}`);
                reject(err);
            } else {
                logger.info(`Audio segment saved: ${outputFile}`);
                resolve();
            }
        });
    });
}

// Function to process an array of strings and alternate voices
async function processTextArray(messages) {
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const isCustomer = i % 2 !== 0; 
        const voice = isCustomer ? customerVoice : agentVoice;

        const outputFile = path.join(
            outputDir,
            `message_${i + 1}_${isCustomer ? 'customer' : 'agent'}.mp3`
        );

        logger.info(`Processing message ${i + 1} (${isCustomer ? 'Customer' : 'Agent'})`);
        await textToSpeech(message, outputFile, voice);
    }

    logger.info('All messages processed and audio files generated.')
}

// Function to convert all audio files to stereo and delete originals
async function convertAllToStereo() {
    const audioFiles = fs
        .readdirSync(outputDir)
        .filter(file => file.endsWith('.mp3') && !file.endsWith('_stereo.mp3'));

    if (audioFiles.length === 0) {
        logger.warm('No audio files found in the output directory.');
        return;
    }

    for (const file of audioFiles) {
        const inputFilePath = path.join(outputDir, file);
        const stereoFilePath = path.join(outputDir, file.replace('.mp3', '_stereo.mp3'));

        logger.info(`Converting to stereo: ${inputFilePath}`);

        try {
            await new Promise((resolve, reject) => {
                ffmpeg(inputFilePath)
                    .audioChannels(2)
                    .output(stereoFilePath)
                    .on('end', () => {
                        logger.info(`Stereo file created: ${stereoFilePath}`);
                        resolve();
                    })
                    .on('error', err => {
                        logger.info(`Error converting file to stereo: ${inputFilePath}`);
                        reject(err);
                    })
                    .run();
            });

            await fsP.unlink(inputFilePath);
            logger.info(`Original file deleted: ${inputFilePath}`);
        } catch (error) {
            logger.error(`Failed to process file ${file}: ${error.message}`);
        }
    }

    logger.info('All files converted to stereo and original files deleted.');
}

// Function to remap agent and customer audio channels
async function remapStereoFiles() {
    const stereoFiles = fs
        .readdirSync(outputDir)
        .filter(file => file.endsWith('_stereo.mp3'));

    if (stereoFiles.length === 0) {
        logger.warn('No stereo files found in the output directory.');
        return;
    }

    for (const file of stereoFiles) {
        const inputFilePath = path.join(outputDir, file);
        const remappedFilePath = path.join(outputDir, file.replace('_stereo.mp3', '_remapped.mp3'));

        logger.info(`Remapping channels for: ${inputFilePath}`);

        try {
            const panFilter = file.includes('customer')
                ? 'stereo|c1=FL'
                : 'stereo|c0=FL';

            await new Promise((resolve, reject) => {
                ffmpeg(inputFilePath)
                    .audioFilters(`pan=${panFilter}`)
                    .output(remappedFilePath)
                    .on('end', () => {
                        logger.info(`Remapped file created: ${remappedFilePath}`);
                        resolve();
                    })
                    .on('error', err => {
                        logger.error(`Error remapping file: ${inputFilePath}`);
                        reject(err);
                    })
                    .run();
            });

            await fsP.unlink(inputFilePath);
            logger.info(`Stereo file deleted: ${inputFilePath}`);
        } catch (error) {
            logger.info(`Failed to process file ${file}: ${error.message}`);
        }
    }

    logger.info('All files remapped with agent on left and customer on right.');
}

// Function to concatenate all audio files sequentially
async function concatenateAudioFiles() {
    const audioFiles = fs
        .readdirSync(outputDir)
        .filter((file) => file.endsWith("_remapped.mp3"))
        .sort((a, b) => {
            const getMessageNumber = (file) => {
                const match = file.match(/message_(\d+)_/);
                return match ? parseInt(match[1], 10) : 0;
            };
            return getMessageNumber(a) - getMessageNumber(b);
        });

    if (audioFiles.length === 0) {
        logger.error("No remapped audio files found in the output directory.");
        throw new Error("No remapped audio files to concatenate.");
    }

    if (!fs.existsSync(callStreamDir)) {
        fs.mkdirSync(callStreamDir, { recursive: true });
        logger.info(`Created directory: ${callStreamDir}`);
    }

    const concatListPath = path.join(callStreamDir, "concat_list.txt");
    const tempOutputFilePath = path.join(callStreamDir, "final_output.mp3");
    const finalOutputFilePath = path.join(callStreamDir, `${finalAudioFilename}.mp3`);

    try {
        // Create the concat list file
        const concatFileContent = audioFiles
            .map((file) => `file '${path.join(outputDir, file)}'`)
            .join("\n");
        fs.writeFileSync(concatListPath, concatFileContent);
        logger.info(`Created concat list: ${concatListPath}`);

        // Concatenate audio files
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(concatListPath)
                .inputOptions(["-f", "concat", "-safe", "0"])
                .outputOptions("-c", "copy")
                .output(tempOutputFilePath)
                .on("end", () => {
                    logger.info(`Temporary concatenated audio created: ${tempOutputFilePath}`);
                    resolve();
                })
                .on("error", (err) => {
                    logger.error(`Error during concatenation: ${err.message}`);
                    reject(err);
                })
                .run();
        });

        // Rename the temporary output file to the final output file
        if (fs.existsSync(tempOutputFilePath)) {
            fs.renameSync(tempOutputFilePath, finalOutputFilePath);
            logger.info(`Final output file moved to: ${finalOutputFilePath}`);
        } else {
            logger.error(`Temporary file not found: ${tempOutputFilePath}`);
            throw new Error("Temporary concatenated file missing.");
        }

        // Clean up temporary concat list
        fs.unlinkSync(concatListPath);
        logger.info(`Temporary concat list file deleted: ${concatListPath}`);

        // Clean up remapped audio files
        audioFiles.forEach((file) => {
            const remappedFilePath = path.join(outputDir, file);
            if (fs.existsSync(remappedFilePath)) {
                fs.unlinkSync(remappedFilePath);
                logger.info(`Deleted remapped audio file: ${remappedFilePath}`);
            }
        });
    } catch (error) {
        logger.error(`Error during concatenation process: ${error.message}`);
        throw error;
    }

    // Final check to ensure the output file exists
    if (!fs.existsSync(finalOutputFilePath)) {
        throw new Error(`Final output file not found: ${finalOutputFilePath}`);
    }

    logger.info(`Audio processing completed successfully. Final file: ${finalOutputFilePath}`);
}

// Main function to convert ticket JSON to audio, process files, and concatenate
export async function convertTicketToAudio(ticketFilename) {
    // Resolve output directory to an absolute path
    outputDir = path.resolve(callStreamDir);

    // Ensure the output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        logger.info(`Created directory: ${outputDir}`);
    }

    try {
        logger.warn("Starting audio conversion process.");
        finalAudioFilename = path.basename(ticketFilename, path.extname(ticketFilename));
        logger.debug(`Final audio filename: ${finalAudioFilename}`);
        logger.debug(`Ticket filename: ${ticketFilename}`);

        // Extract messages from the JSON ticket file
        const messages = await extractMessagesFromFile(ticketFilename);

        // Process the messages: Generate audio for each message
        await processTextArray(messages);

        // Convert audio files to stereo format
        await convertAllToStereo();

        // Remap audio channels (agent left, customer right)
        await remapStereoFiles();

        // Concatenate all processed audio files
        await concatenateAudioFiles();
        return `${finalAudioFilename}.mp3`; // Return the final concatenated file name
    } catch (error) {
        logger.error(`Error during conversion: ${error.message}`);
        throw error;
    }
}