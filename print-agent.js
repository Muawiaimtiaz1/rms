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
// --- CONFIGURATION ---
const CONFIG = {
    SHOP_ID: 1,                          // Change to your Shop ID if different
    SERVER_URL: 'http://localhost:4000', // Change to your hosted URL (e.g. https://your-server.com)
    POLL_INTERVAL_MS: 3000,              // Check for new orders every 3 seconds
};

let SHOP_SETTINGS = null;

async function pollJobs() {
    try {
        console.log(`[${new Date().toLocaleTimeString()}] Polling for jobs...`);
        const res = await axios.get(`${CONFIG.SERVER_URL}/api/print-jobs/poll`, {
            params: { shop_id: CONFIG.SHOP_ID }
        });

        // Handle both formats: old (Array) and new (Object with jobs and shop_settings)
        let jobs = [];
        if (Array.isArray(res.data)) {
            jobs = res.data;
        } else if (res.data && res.data.jobs) {
            jobs = res.data.jobs;
            SHOP_SETTINGS = res.data.shop_settings; // Update local settings cache
        }

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
    let content;
    try {
        content = JSON.parse(job.content_json);
    } catch (e) {
        console.error("JSON Parse Error for Job #", job.id);
        await confirmJob(job.id);
        return;
    }
    
    const printerName = job.station_name;
    if (!printerName || printerName === 'null') {
        console.warn(`[SKIP] Job #${job.id} has no valid printer assigned.`);
        await confirmJob(job.id);
        return;
    }

    console.log(`Printing Job #${job.id} (Type: ${content.job_type || 'KOT'}) to printer: ${printerName}`);

    let text = "";
    if (content.job_type === 'bill') {
        text = generateBillText(content);
    } else {
        text = generateKOTText(content);
    }

    // Identify OS
    const isWindows = process.platform === "win32";
    const tempFile = path.join(__dirname, `job_${job.id}.txt`);
    
    try {
        fs.writeFileSync(tempFile, text);

        let printCmd = "";
        if (isWindows) {
            printCmd = `notepad /p "${tempFile}"`; 
        } else {
            printCmd = `lp -d "${printerName}" "${tempFile}"`;
        }

        exec(printCmd, async (error) => {
            if (error) {
                console.error(`Print Failed on OS level: ${error.message}`);
            } else {
                console.log(`Print signal sent to ${printerName}.`);
                await confirmJob(job.id);
                setTimeout(() => { if(fs.existsSync(tempFile)) fs.unlinkSync(tempFile); }, 1000);
            }
        });
    } catch (fsError) {
        console.error("File System Error:", fsError.message);
    }
}

function generateKOTText(content) {
    let text = `--------------------------------\n`;
    text += `    KITCHEN ORDER #${content.sale_id}\n`;
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
    text += `--------------------------------\n\n\n\n\x1Bm`; 
    return text;
}

function generateBillText(content) {
    const s = SHOP_SETTINGS || {};
    const width = 32; // Normal 80mm printer width approx 32-42 chars

    const center = (str) => {
        const space = Math.max(0, Math.floor((width - str.length) / 2));
        return " ".repeat(space) + str;
    };

    const divider = () => "-".repeat(width) + "\n";
    const doubleDivider = () => "=".repeat(width) + "\n";

    let t = "";
    
    // Header
    if (s.use_text_on_receipt !== false) {
        t += center(s.receipt_header_text || s.name || "RMS SHOP") + "\n";
        if (s.receipt_extended_name) t += center(s.receipt_extended_name) + "\n";
    }
    
    t += center("SALES RECEIPT") + "\n";
    
    if (s.receipt_phone) t += center("Phone: " + s.receipt_phone) + "\n";
    if (s.receipt_address) t += center(s.receipt_address) + "\n";
    
    t += divider();
    
    // Info Section
    t += `Bill #: ${content.sale_id}\n`;
    t += `Date  : ${new Date(content.created_at).toLocaleString()}\n`;
    if (content.table_number) t += `Table : ${content.table_number}\n`;
    if (content.token_number) t += `Token : ${content.token_number}\n`;
    t += `Client: ${content.customer_name || 'Walk-in'}\n`;
    
    t += divider();
    
    // Items Header
    t += `QTY  ITEM              TOTAL\n`;
    t += divider();

    // Items
    content.items.forEach(item => {
        const namePart = item.name.substring(0, 18).padEnd(18);
        const qtyPart = String(item.quantity).padEnd(4);
        const totalPart = String(item.total).padStart(8);
        t += `${qtyPart} ${namePart} ${totalPart}\n`;
        
        if (item.variants && item.variants.length) {
            t += `     (${item.variants.map(v => v.name || v).join(', ')})\n`;
        }
    });

    t += divider();

    // Totals
    const labelW = 20;
    const valW = 12;
    
    t += "Subtotal:".padEnd(labelW) + String(content.subtotal).padStart(valW) + "\n";
    if (content.discount > 0) {
        t += "Discount:".padEnd(labelW) + ("-" + content.discount).padStart(valW) + "\n";
    }
    if (content.tax_percentage > 0) {
        const taxAmt = (content.subtotal - content.discount) * (content.tax_percentage / 100);
        t += `Tax (${content.tax_percentage}%):`.padEnd(labelW) + String(taxAmt.toFixed(2)).padStart(valW) + "\n";
    }
    
    t += doubleDivider();
    t += "GRAND TOTAL:".padEnd(labelW) + ("Rs. " + content.total).padStart(valW) + "\n";
    t += doubleDivider();

    // Payment
    t += "Method:".padEnd(labelW) + String(content.payment_method || 'Cash').padStart(valW) + "\n";
    t += "Received:".padEnd(labelW) + String(content.amount_received || 0).padStart(valW) + "\n";
    t += "Balance:".padEnd(labelW) + String(content.change || 0).padStart(valW) + "\n";
    
    t += divider();
    
    // Footer
    if (s.receipt_policies) {
        t += s.receipt_policies + "\n";
    }
    
    t += "\n";
    t += center("Thank you for your visit!") + "\n";
    t += center("Powered by RMS Unified") + "\n";
    
    t += "\n\n\n\n\x1Bm"; // Feed and Cut
    return t;
}

function confirmJob(id) {
    return axios.post(`${CONFIG.SERVER_URL}/api/print-jobs/${id}/confirm`)
        .catch(err => console.error("Confirming Job Failed on Server:", err.message));
}

console.log("==========================================");
console.log("   RMS UNIFIED SMART PRINT AGENT 2.0     ");
console.log("==========================================");
console.log(`Shop ID: ${CONFIG.SHOP_ID}`);
console.log(`Monitoring: ${CONFIG.SERVER_URL}`);
console.log("Status: Active & Syncing Settings...");
console.log("------------------------------------------");
console.log("Press Ctrl+C to stop.");

setInterval(pollJobs, CONFIG.POLL_INTERVAL_MS);
pollJobs();
