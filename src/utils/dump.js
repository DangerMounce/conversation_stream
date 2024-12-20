import fs from "fs/promises";
import path from "path";
import logger from "./logger.js";

const dump = async (data) => {
  try {
    // Resolve the path to dump.json in the root directory
    const filePath = path.resolve("./dump.json");

    let fileContent = "";

    try {
      // Read the existing content of dump.json
      fileContent = await fs.readFile(filePath, "utf-8");
    } catch (error) {
      if (error.code === "ENOENT") {
        logger.warn("File not found. Initializing dump.json as an empty array.");
        fileContent = "[]"; // Initialize as an empty JSON array
      } else {
        throw error;
      }
    }

    // Prepare the new data entry as a JSON string
    const newEntry = JSON.stringify(data, null, 2);

    // Remove the closing bracket of the JSON array
    fileContent = fileContent.trim();
    if (fileContent.endsWith("]")) {
      fileContent = fileContent.slice(0, -1); // Remove the last "]"
      if (fileContent.length > 1) {
        fileContent += ","; // Add a comma if there are already entries
      }
    } else {
      fileContent = "["; // Initialize the content as an array if invalid
    }

    // Add the new entry and close the JSON array
    fileContent += `\n  ${newEntry}\n]`;

    // Write the updated content back to dump.json
    await fs.writeFile(filePath, fileContent, "utf-8");

    logger.debug(`Data has been successfully appended to ${filePath}`);
  } catch (error) {
    logger.error(`Failed to append data to dump.json: ${error.message}`);
  }
};

export default dump;