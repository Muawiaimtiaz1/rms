/**
 * RMS UNIFIED SMART PRINT AGENT
 * Run this on the computer connected to your printers.
 * Usage: node print-agent.js
 * Requires: npm install axios
 */

const axios = require('axios');
const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// --- CONFIGURATION ---
const CONFIG = {
    SHOP_ID: Number(process.env.SHOP_ID || 1),                         // Change to your Shop ID if different
    SERVER_URL: process.env.SERVER_URL || 'http://localhost:4000',      // Change to your hosted URL (e.g. https://your-server.com)
    POLL_INTERVAL_MS: Number(process.env.POLL_INTERVAL_MS || 3000),     // Check for new orders every 3 seconds
    BROWSER_PATH: process.env.PRINT_BROWSER_PATH || '',                // Optional explicit Chrome/Edge/Chromium path
    SUMATRA_PATH: process.env.SUMATRA_PATH || '',                      // Optional explicit SumatraPDF.exe path (Windows only)
    PRINT_TIMEOUT_MS: Number(process.env.PRINT_TIMEOUT_MS || 30000),
};

let isPolling = false;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJobs() {
    if (isPolling) return;
    isPolling = true;

    try {
        console.log(`[${new Date().toLocaleTimeString()}] Polling for jobs...`);
        const res = await axios.get(`${CONFIG.SERVER_URL}/api/print-jobs/poll`, {
            params: { shop_id: CONFIG.SHOP_ID }
        });

        const jobs = Array.isArray(res.data) ? res.data : [];
        if (jobs.length > 0) {
            console.log(`Claimed ${jobs.length} print job${jobs.length === 1 ? '' : 's'}.`);
            for (const job of jobs) {
                await processJob(job);
            }
        }
    } catch (err) {
        console.error("Polling Error:", err.message);
    } finally {
        isPolling = false;
    }
}

async function processJob(job) {
    let content;
    try {
        content = JSON.parse(job.content_json);
    } catch (error) {
        console.error(`Job #${job.id} has invalid print content: ${error.message}`);
        await confirmJob(job.id);
        return;
    }
    
    // The station_name now holds the ACTUAL system printer name (e.g. "EPSON-TM88")
    // as defined in your Settings > Printers & Routing dashboard.
    const printerName = job.station_name;

    if (!printerName || printerName === 'null') {
        console.warn(`[SKIP] Job #${job.id} has no valid printer assigned.`);
        await confirmJob(job.id);
        return;
    }

    const itemCount = Array.isArray(content.items) ? content.items.length : 0;
    const routeLabel = content.route_label || content.printer_label;
    const targetLabel = routeLabel && routeLabel !== printerName
        ? `${routeLabel} -> ${printerName}`
        : printerName;
    console.log(`Printing Job #${job.id} to printer: ${targetLabel}${itemCount ? ` (${itemCount} item lines)` : ''}`);

    if (content.print_url || content.type === 'PRINT_URL') {
        try {
            await printUrlJob(job, content, printerName);
            console.log(`Print signal sent to ${printerName}.`);
            await confirmJob(job.id);
        } catch (error) {
            console.error(`URL Print Failed: ${error.message}`);
            console.info(`Check browser path, server URL, and printer "${printerName}".`);
            await failJob(job.id, error.message);
        }
        return;
    }

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

        if (isWindows) {
            // Note: Thermal printers work best with raw text.
            // If this opens notepad, consider installing a raw-print CLI tool.
            await execFileAsync('notepad', ['/p', tempFile], { timeout: CONFIG.PRINT_TIMEOUT_MS });
        } else {
            // Linux/Mac (CUPS)
            await execFileAsync('lp', ['-d', printerName, tempFile], { timeout: CONFIG.PRINT_TIMEOUT_MS });
        }

        console.log(`Print signal sent to ${printerName}.`);
        await confirmJob(job.id);
    } catch (error) {
        console.error(`Print Failed on OS level: ${error.message}`);
        console.info(`Check if printer "${printerName}" is installed and online.`);
        await failJob(job.id, error.message);
    } finally {
        setTimeout(() => { if(fs.existsSync(tempFile)) fs.unlinkSync(tempFile); }, 1000);
    }
}

function resolvePrintUrl(printUrl) {
    if (!printUrl) throw new Error("Missing print_url in job content.");
    if (/^https?:\/\//i.test(printUrl)) return printUrl;
    return new URL(printUrl, CONFIG.SERVER_URL).toString();
}

function commandExists(command) {
    try {
        const lookup = process.platform === 'win32' ? 'where' : 'which';
        const output = execFileSync(lookup, [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return output.split(/\r?\n/).find(Boolean);
    } catch (e) {
        return null;
    }
}

function findBrowserExecutable() {
    if (CONFIG.BROWSER_PATH && fs.existsSync(CONFIG.BROWSER_PATH)) return CONFIG.BROWSER_PATH;

    if (process.platform === 'win32') {
        const candidates = [
            process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
            process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
            process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
            process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ].filter(Boolean);
        return candidates.find((candidate) => fs.existsSync(candidate)) || commandExists('chrome') || commandExists('msedge');
    }

    if (process.platform === 'darwin') {
        const candidates = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ];
        return candidates.find((candidate) => fs.existsSync(candidate)) || commandExists('google-chrome') || commandExists('chromium');
    }

    return commandExists('google-chrome-stable')
        || commandExists('google-chrome')
        || commandExists('chromium-browser')
        || commandExists('chromium')
        || commandExists('microsoft-edge');
}

async function renderUrlToPdf(url, outputPdf) {
    const browser = findBrowserExecutable();
    if (!browser) {
        throw new Error("Chrome, Edge, or Chromium was not found. Set PRINT_BROWSER_PATH to your browser executable.");
    }

    await execFileAsync(browser, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        `--print-to-pdf=${outputPdf}`,
        url,
    ], { timeout: CONFIG.PRINT_TIMEOUT_MS });

    const stat = fs.existsSync(outputPdf) ? fs.statSync(outputPdf) : null;
    if (!stat || stat.size === 0) throw new Error("Browser did not create a printable PDF.");
}

async function sendPdfToPrinter(pdfPath, printerName) {
    if (process.platform === 'win32') {
        let sumatra = null;
        
        // 1. Check config and common user-added env variables
        const possibleEnvVars = [
            CONFIG.SUMATRA_PATH,
            process.env.SumatraPDF,
            process.env.SUMATRAPDF
        ].filter(Boolean).map(p => p.replace(/(^"|"$)/g, ''));

        for (const p of possibleEnvVars) {
            if (fs.existsSync(p)) {
                if (fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'SumatraPDF.exe'))) {
                    sumatra = path.join(p, 'SumatraPDF.exe'); break;
                } else if (fs.statSync(p).isFile()) {
                    sumatra = p; break;
                }
            } else if (fs.existsSync(p + '.exe')) {
                sumatra = p + '.exe'; break;
            }
        }

        // 2. Check if it's in the deep system PATH
        if (!sumatra) {
            sumatra = commandExists('SumatraPDF.exe') || commandExists('SumatraPDF');
        }
        
        // 3. Fallback to check default Windows installation directories
        if (!sumatra) {
            const defaultPaths = [
                process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'SumatraPDF', 'SumatraPDF.exe'),
                process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'SumatraPDF', 'SumatraPDF.exe'),
                process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'SumatraPDF', 'SumatraPDF.exe')
            ].filter(Boolean);
            sumatra = defaultPaths.find(p => fs.existsSync(p));
        }

        if (!sumatra) {
            throw new Error("Windows URL printing needs SumatraPDF in PATH for printer selection, or set SUMATRA_PATH config.");
        }
        await execFileAsync(sumatra, ['-print-settings', 'noscale', '-print-to', printerName, '-silent', pdfPath], { timeout: CONFIG.PRINT_TIMEOUT_MS });
        return;
    }

    await execFileAsync('lp', ['-d', printerName, pdfPath], { timeout: CONFIG.PRINT_TIMEOUT_MS });
}

async function printUrlJob(job, content, printerName) {
    const url = resolvePrintUrl(content.print_url);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `rms-print-${job.id}-`));
    const pdfPath = path.join(tempDir, `job_${job.id}.pdf`);

    try {
        await renderUrlToPdf(url, pdfPath);
        await sendPdfToPrinter(pdfPath, printerName);
    } finally {
        setTimeout(() => {
            try {
                if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
                if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
            } catch (e) {}
        }, 1000);
    }
}

async function postJobStatus(id, path, body, label, attempts = 5) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await axios.post(`${CONFIG.SERVER_URL}/api/print-jobs/${id}/${path}`, body);
            return true;
        } catch (err) {
            console.error(`${label} failed on attempt ${attempt}/${attempts}:`, err.message);
            if (attempt < attempts) await sleep(Math.min(1000 * attempt, 5000));
        }
    }
    return false;
}

function confirmJob(id) {
    return postJobStatus(id, 'confirm', {}, 'Confirming job on server');
}

function failJob(id, reason) {
    return postJobStatus(id, 'fail', { reason }, 'Releasing job for retry on server');
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
