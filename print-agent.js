/**
 * RMS UNIFIED SMART PRINT AGENT
 * Run this on the computer connected to your printers.
 * Usage: node print-agent.js
 * Requires: npm install axios
 */

const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION ---
const CONFIG = {
    SHOP_ID: 1,                          // Change to your Shop ID if different
    SERVER_URL: 'http://localhost:4000', // Change to your hosted URL (e.g. https://your-server.com)
    POLL_INTERVAL_MS: 3000,              // Check for new orders every 3 seconds
};

async function pollJobs() {
    try {
        console.log(`[${new Date().toLocaleTimeString()}] Polling for jobs...`);
        const res = await axios.get(`${CONFIG.SERVER_URL}/api/print-jobs/poll`, {
            params: { shop_id: CONFIG.SHOP_ID }
        });

        const jobs = res.data;
        if (jobs.length > 0) {
            console.log(`Found ${jobs.length} pending jobs.`);
            for (const job of jobs) {
                await processJob(job);
            }
        }
    } catch (err) {
        console.error("Polling Error:", err.message);
    }
}

async function processJob(job) {
    const content = JSON.parse(job.content_json);
    
    // The station_name now holds the ACTUAL system printer name (e.g. "EPSON-TM88")
    // as defined in your Settings > Printers & Routing dashboard.
    const printerName = job.station_name;

    if (!printerName || printerName === 'null') {
        console.warn(`[SKIP] Job #${job.id} has no valid printer assigned.`);
        await confirmJob(job.id);
        return;
    }

    console.log(`Printing Job #${job.id} to printer: ${printerName}`);

    // Generate a simple text format for thermal printers (80mm)
    let text = `--------------------------------\n`;
    text += `    ORDER #${content.sale_id}\n`;
    text += `    TYPE: ${content.order_type.toUpperCase()}\n`;
    if (content.table_number) text += `    TABLE: ${content.table_number}\n`;
    if (content.token_number) text += `    TOKEN: ${content.token_number}\n`;
    text += `--------------------------------\n`;
    text += `TIME: ${new Date(content.created_at).toLocaleString()}\n\n`;

    content.items.forEach(item => {
        text += `[ ] ${item.quantity} x ${item.name}\n`;
        if (item.variants && item.variants.length) {
            text += `    - ${item.variants.map(v => v.name || v).join(', ')}\n`;
        }
        if (item.special_instructions) {
            text += `    NOTE: ${item.special_instructions}\n`;
        }
        text += `\n`;
    });
    text += `--------------------------------\n\n\n\n\x1Bm`; // Feed 4 lines and Cut

    // Identify OS
    const isWindows = process.platform === "win32";
    const tempFile = path.join(__dirname, `job_${job.id}.txt`);
    
    try {
        fs.writeFileSync(tempFile, text);

        let printCmd = "";
        if (isWindows) {
            // Using a generic Windows command. 
            // Note: Thermal printers work best with raw text. 
            // If this opens notepad, consider installing 'RawPrint' CLI tool.
            printCmd = `notepad /p "${tempFile}"`; 
        } else {
            // Linux/Mac (CUPS)
            printCmd = `lp -d "${printerName}" "${tempFile}"`;
        }

        exec(printCmd, async (error) => {
            if (error) {
                console.error(`Print Failed on OS level: ${error.message}`);
                console.info(`Check if printer "${printerName}" is installed and online.`);
            } else {
                console.log(`Print signal sent to ${printerName}.`);
                await confirmJob(job.id);
                // Clean up
                setTimeout(() => { if(fs.existsSync(tempFile)) fs.unlinkSync(tempFile); }, 1000);
            }
        });
    } catch (fsError) {
        console.error("File System Error:", fsError.message);
    }
}

function confirmJob(id) {
    return axios.post(`${CONFIG.SERVER_URL}/api/print-jobs/${id}/confirm`)
        .catch(err => console.error("Confirming Job Failed on Server:", err.message));
}

console.log("==========================================");
console.log("   RMS SMART PRINT AGENT IS RUNNING      ");
console.log("==========================================");
console.log(`Shop ID: ${CONFIG.SHOP_ID}`);
console.log(`Monitoring: ${CONFIG.SERVER_URL}`);
console.log("Status: Active & Waiting for Orders...");
console.log("------------------------------------------");
console.log("Press Ctrl+C to stop.");

setInterval(pollJobs, CONFIG.POLL_INTERVAL_MS);
pollJobs();
