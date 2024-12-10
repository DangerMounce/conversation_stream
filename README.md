# evaluAgent live Stream and Injection Management Tool

**Author**: Chris Mounce
**Current Version:** v1.1.4

## Overview

This project provides a tool for managing conversation streams in evaluagent contracts. It supports automated live streams and injection of chat and telephony conversations. The tool interacts with EvaluAgent's API to upload and process conversation data, including tickets and call streams.

## Features

- **Stream and Injection Management**: Automates the creation and injection of tickets and call streams.
- **Template Generation**: Generates templates for chat and call data.
- **Audio Processing**: Converts tickets to audio and manages audio files (text-to-speech, stereo conversion, remapping).
- **Directory and Topic Management**: Handles directory creation and topic organization.
- **Logging and Config Management**: Comprehensive logging with Winston and dynamic configuration loading.
- **API Key Management**: CLI interface for managing API keys.

---

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/DangerMounce/conversation_stream.git
   cd conversation_stream
   ```

2. **Install dependencies**:
   ```bash
   npm install axios chalk winston inquirer gtts fluent-ffmpeg uuid date-fns
   ```

3. **Set up configuration**:
   - Place a `config.json` file under the `src/config/` directory. Example:
     ```json
     {
       "ticketStream": true,
       "callStream": true,
       "deleteGeneratedCalls": false
     }
     ```
   - Add `keyFile.json` under `src/config/` for API keys:
     ```json
     {
       "keys": [
         { "name": "Key1", "key": "your_api_key1" },
         { "name": "Key2", "key": "your_api_key2" }
       ]
     }
     ```
   - Add `topics.json` for conversation topics:
     ```json
     {
       "topics": ["Topic1", "Topic2"]
     }
     ```

4. **Run the tool**:
   ```bash
   node stream
   ```
   **Using wayBackMachine and setting time delay**

   wayBackMachine allows for contacts to be sent to evaluagent with a contact date earlier than the current date.  The time delay can also be set for the delay in between conversations being sent in the stream.
   ```bash
   node stream [wayBackMachine] [timeInterval]
   ```
   Example
   ```bash
   node stream -7 10
   ```
   The wayBackMachine is set for 7 days period to now and with a 10 second delay in between contacts being sent.

---

## Usage

### CLI Options

- **Stream**: Automates live conversation streaming.
- **Injection**: Injects predefined conversations based on topics.
- **API Key Management**: Manage API keys through the CLI.

### Commands

- **Start Streaming**:
  Select "Baseline Stream" to initiate live streaming of tickets and calls.

- **Injection**:
  Use the "Injection" option to upload predefined conversations under a specific topic.
  The injection will upload each conversation in the topic folder and then stop.

- **Manage Topics**:
  Use the `topicBuilder.js` CLI to list, add, or remove topics.

- **API Keys**:
  Manage API keys using the `cli.js` interface.

---

## File Structure

- **`stream.js`**: Main entry point for the application.
- **`cli.js`**: API key management.
- **`apiUtils.js`**: API interactions (e.g., fetching agents, uploading audio).
- **`contactTemplateGenerator.js`**: Generates conversation templates.
- **`ttsGenerator.js`**: Converts text to audio and processes audio files.
- **`dump.js`**: Logs processed data for debugging or auditing.
- **`loadConfig.js`**: Configuration loader for runtime settings.
- **`topicBuilder.js`**: Manages topics and directories.
- **`logger.js`**: Custom logger using Winston.
- **`config` directory**: Contains configuration files.
- **`data` directory**: Stores tickets and call streams.

---

## Dependencies

- **Node.js** (>= 14.x)
- Packages:
  - `axios`
  - `chalk`
  - `winston`
  - `ffmpeg`
  - `gtts`
  - `inquirer`
  - `uuid`

---

## Contribution

1. Fork the repository.
2. Create a feature branch (`feature/your-feature`).
3. Commit changes and push to the branch.
4. Create a Pull Request.

---

## License

[MIT License](LICENSE)

--- 

Feel free to modify this template to suit your project's requirements.
