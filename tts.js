import { getTicketList } from "./src/utils/contactTemplateGenerator.js";
import { convertTicketToAudio } from "./src/utils/ttsGenerator.js";

async function main() {
    try {
        const ticketList = await getTicketList('./data/test_convos_tickets');
        if (!ticketList || ticketList.length === 0) {
            console.error('No tickets found in the directory.');
            return;
        }

        console.log('Ticket List:', ticketList);

        for (let i = 0; i < ticketList.length; i++) {
            const targetJSON = ticketList[i];

            if (!targetJSON || typeof targetJSON !== 'string') {
                console.warn(`Skipping invalid targetJSON: ${targetJSON}`);
                continue;
            }

            console.log('Processing Target JSON:', targetJSON);

            try {
                const audioFilename = await convertTicketToAudio(targetJSON);
                console.log('Generated Audio Filename:', audioFilename);
            } catch (error) {
                console.error(`Failed to process ${targetJSON}: ${error.message}`);
                process.exit(1)
            }
        }
    } catch (error) {
        console.error('Error in main:', error.message);
        process.exit(1);
    }
}

main();
