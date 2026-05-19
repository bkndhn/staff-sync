# Staff Sync - Local eSSL Bridge Agent

Since web browsers cannot directly connect to hardware on a local network, this small Node.js service acts as a bridge. It runs on a local computer connected to the same network as your eSSL / ZKTeco biometric devices. 

It automatically reaches out to the devices, downloads the attendance punch logs, and pushes them securely to the cloud Staff Sync application.

## Prerequisites
1. Ensure Node.js (v18+) is installed on this computer.
2. The computer running this agent must be on the same WiFi/LAN as your eSSL device.

## Setup Instructions

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Open the `.env` file and fill in your Supabase connection details (You can find these in your Supabase project dashboard under Settings -> API).

3. Install dependencies:
   ```bash
   npm install
   ```

4. Start the Agent:
   ```bash
   npm start
   ```

The agent will now check your cloud database every 30 seconds. If you have configured an eSSL device IP in the "Settings" page of your web app, the agent will connect to it, fetch the punches, and sync them to your dashboard!

> **Note**: For this to work, ensure that each Staff Member in your Staff Sync application has their `Device ID` field populated with their corresponding Employee ID from the eSSL machine.
