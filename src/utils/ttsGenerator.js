import gTTS from 'gtts';
import fs from 'fs';
import path from 'path';
import fsP from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import { callStreamDir } from '../../stream.js';
import logger from './logger.js';

// Language/voice configurations
const customerVoice = 'en-uk'; // Customer voice (Australian English)
const agentVoice = 'en-us';    // Agent voice (British English)

// Ensure the output directory exists
const outputDir = path.resolve('audio_processing');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    logger.info(`Created directory: ${outputDir}`);
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

    logger.info('All messages processed and audio files generated.');
}

// Function to convert all audio files to stereo and delete originals
async function convertAllToStereo() {
    const audioFiles = fs
        .readdirSync(outputDir)
        .filter(file => file.endsWith('.mp3') && !file.endsWith('_stereo.mp3'));

    if (audioFiles.length === 0) {
        logger.warn('No audio files found in the output directory.');
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
                        logger.error(`Error converting file to stereo: ${inputFilePath}`);
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
            logger.error(`Failed to process file ${file}: ${error.message}`);
        }
    }

    logger.info('All files remapped with agent on left and customer on right.');
}

// Function to concatenate all audio files sequentially
async function concatenateAudioFiles(outputDir, callStreamDir, finalAudioFilename) {
    const audioFiles = fs
        .readdirSync(outputDir)
        .filter(file => file.endsWith('_remapped.mp3'))
        .sort((a, b) => {
            const getMessageNumber = file => {
                const match = file.match(/message_(\d+)_/);
                return match ? parseInt(match[1], 10) : 0;
            };
            return getMessageNumber(a) - getMessageNumber(b);
        });

    if (audioFiles.length === 0) {
        throw new Error('No remapped audio files to concatenate.');
    }

    const concatListPath = path.join(callStreamDir, 'concat_list.txt');
    const tempOutputFilePath = path.join(callStreamDir, 'final_output.mp3');
    const finalOutputFilePath = path.join(callStreamDir, `${finalAudioFilename}.mp3`);

    try {
        const concatFileContent = audioFiles
            .map(file => `file '${path.join(outputDir, file)}'`)
            .join('\n');
        fs.writeFileSync(concatListPath, concatFileContent);

        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(concatListPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions('-c', 'copy')
                .output(tempOutputFilePath)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        fs.renameSync(tempOutputFilePath, finalOutputFilePath);
        fs.unlinkSync(concatListPath);

        audioFiles.forEach(file => fs.unlinkSync(path.join(outputDir, file)));

        logger.info(`Final output file created: ${finalOutputFilePath}`);
    } catch (error) {
        throw new Error(`Error during concatenation: ${error.message}`);
    }
}

// Main function to convert ticket JSON to audio
export async function convertTicketToAudio(ticketFilename) {
    try {
        const finalAudioFilename = path.basename(ticketFilename, path.extname(ticketFilename));
        await processTextArray(await extractMessagesFromFile(ticketFilename));
        await convertAllToStereo();
        await remapStereoFiles();
        await concatenateAudioFiles(outputDir, callStreamDir, finalAudioFilename);
        return path.join(callStreamDir, `${finalAudioFilename}.mp3`);
    } catch (error) {
        throw new Error(`Conversion failed: ${error.message}`);
    }
}
