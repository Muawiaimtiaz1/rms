const express = require('express');
const db = require('../db/db');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const router = express.Router();

// ─── Rate Limiters ───────────────────────────────────────────────────────────

// General read limiter: 30 requests per minute per IP
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,       // 1 minute
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please slow down.' },
    keyGenerator: (req) => ipKeyGenerator(req)
});

// Strict submission limiter: 5 ticket creations per user per 5 minutes
// Keyed by user ID from session (not IP, to handle proxies)
const submissionLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,   // 5 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'You are submitting tickets too quickly. Please wait a few minutes.' },
    keyGenerator: (req) => {
        const user = req.session && req.session.user;
        return user ? `user_${user.id}` : ipKeyGenerator(req);
    },
    // Skip superadmins — they're trusted
    skip: (req) => {
        const user = req.session && req.session.user;
        return user && user.role === 'superadmin';
    }
});

// Comment rate limiter: 10 comments per user per minute
const commentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'You are commenting too quickly. Please wait a moment.' },
    keyGenerator: (req) => {
        const user = req.session && req.session.user;
        return user ? `user_${user.id}` : ipKeyGenerator(req);
    },
    skip: (req) => {
        const user = req.session && req.session.user;
        return user && user.role === 'superadmin';
    }
});

// ─── Constants ───────────────────────────────────────────────────────────────
const VALID_TYPES = ['bug', 'feature', 'help'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'];

// Allowed file extensions and MIME types for attachments
const ALLOWED_MIME_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
];

// ─── Multer Config ─────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        // Sanitize original extension only — never trust original filename
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `ticket-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: images, PDF, Word, and plain text.'), false);
        }
    }
});

// ─── Helper: assert user owns the shop ───────────────────────────────────────
function assertShopOwnership(ticket, user, res) {
    if (user.role !== 'superadmin' && ticket.shop_id !== user.shop_id) {
        res.status(403).json({ error: 'You do not have access to this ticket.' });
        return false;
    }
    return true;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/support/tickets
 * Superadmin sees all tickets; shop users see only tickets for their shop.
 */
router.get('/tickets', requireAuth, generalLimiter, (req, res) => {
    try {
        const user = req.session.user;
        let tickets;

        if (user.role === 'superadmin') {
            tickets = db.prepare(`
                SELECT t.*, s.name as shop_name, u.name as author_name
                FROM support_tickets t
                JOIN shops s ON t.shop_id = s.id
                JOIN users u ON t.user_id = u.id
                ORDER BY t.created_at DESC
            `).all();
        } else {
            // Guard: require a valid shop_id on the session
            if (!user.shop_id) {
                return res.status(403).json({ error: 'No shop associated with your account.' });
            }
            tickets = db.prepare(`
                SELECT t.*, u.name as author_name
                FROM support_tickets t
                JOIN users u ON t.user_id = u.id
                WHERE t.shop_id = ?
                ORDER BY t.created_at DESC
            `).all(user.shop_id);
        }
        res.json(tickets);
    } catch (e) {
        console.error('Fetch tickets error:', e);
        res.status(500).json({ error: 'Database error fetching tickets' });
    }
});

/**
 * GET /api/support/tickets/:id
 * Returns a single ticket with its comments.
 * Shop users can only view tickets from their own shop.
 */
router.get('/tickets/:id', requireAuth, generalLimiter, (req, res) => {
    try {
        const ticketId = parseInt(req.params.id, 10);
        if (isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket ID' });

        const user = req.session.user;

        const ticket = db.prepare(`
            SELECT t.*, s.name as shop_name, u.name as author_name
            FROM support_tickets t
            JOIN shops s ON t.shop_id = s.id
            JOIN users u ON t.user_id = u.id
            WHERE t.id = ?
        `).get(ticketId);

        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
        if (!assertShopOwnership(ticket, user, res)) return;

        const comments = db.prepare(`
            SELECT c.*, u.name as author_name, u.role as author_role
            FROM ticket_comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.ticket_id = ?
            ORDER BY c.created_at ASC
        `).all(ticketId);

        res.json({ ticket, comments });
    } catch (e) {
        console.error('Fetch single ticket error:', e);
        res.status(500).json({ error: 'Database error fetching ticket details' });
    }
});

/**
 * POST /api/support/tickets
 * Create a new support ticket (with optional file attachment).
 * Only authenticated shop owners/admins can submit. Superadmins cannot.
 */
router.post(
    '/tickets',
    requireAuth,
    submissionLimiter,
    (req, res, next) => {
        // Run multer, but catch file-filter errors gracefully
        upload.single('attachment')(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ error: `File upload error: ${err.message}` });
            } else if (err) {
                return res.status(400).json({ error: err.message });
            }
            next();
        });
    },
    (req, res) => {
        const user = req.session.user;

        // Authorization: only shop staff can create tickets
        if (user.role === 'superadmin') {
            return res.status(403).json({ error: 'Superadmins cannot create shop support requests.' });
        }
        if (!user.shop_id) {
            return res.status(403).json({ error: 'No shop associated with your account.' });
        }

        const { type, priority, subject, description } = req.body;

        // Validate required fields
        if (!type || !priority || !subject || !description) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }

        // Whitelist type and priority to prevent injection via enum columns
        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` });
        }
        if (!VALID_PRIORITIES.includes(priority)) {
            return res.status(400).json({ error: `Invalid priority. Must be one of: ${VALID_PRIORITIES.join(', ')}` });
        }

        // Trim and length-check text inputs
        const cleanSubject = subject.trim().slice(0, 200);
        const cleanDescription = description.trim().slice(0, 5000);
        if (cleanSubject.length < 5) {
            return res.status(400).json({ error: 'Subject must be at least 5 characters.' });
        }
        if (cleanDescription.length < 10) {
            return res.status(400).json({ error: 'Description must be at least 10 characters.' });
        }

        const attachment_url = req.file ? `/uploads/${req.file.filename}` : null;

        const result = db.prepare(`
            INSERT INTO support_tickets (shop_id, user_id, type, priority, subject, description, attachment_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(user.shop_id, user.id, type, priority, cleanSubject, cleanDescription, attachment_url);

        res.json({ ok: true, ticket_id: result.lastInsertRowid });
    }
);

/**
 * PATCH /api/support/tickets/:id/status
 * Update a ticket's status. Only superadmins may do this.
 */
router.patch('/tickets/:id/status', requireAuth, generalLimiter, (req, res) => {
    try {
        const ticketId = parseInt(req.params.id, 10);
        if (isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket ID' });

        const { status } = req.body;
        const user = req.session.user;

        if (user.role !== 'superadmin') {
            return res.status(403).json({ error: 'Only master owners can update ticket status.' });
        }
        if (!VALID_STATUSES.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
        }

        const result = db.prepare(`
            UPDATE support_tickets
            SET status = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(status, ticketId);

        if (result.changes === 0) return res.status(404).json({ error: 'Ticket not found' });
        res.json({ ok: true });
    } catch (e) {
        console.error('Update ticket status error:', e);
        res.status(500).json({ error: 'Database error updating ticket status' });
    }
});

/**
 * POST /api/support/tickets/:id/comments
 * Add a comment/reply to a ticket.
 * Shop users can only comment on their own shop's tickets.
 * Closed tickets cannot receive new comments from shop users.
 */
router.post('/tickets/:id/comments', requireAuth, commentLimiter, (req, res) => {
    try {
        const ticketId = parseInt(req.params.id, 10);
        if (isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket ID' });

        const { comment } = req.body;
        const user = req.session.user;

        if (!comment || !comment.trim()) {
            return res.status(400).json({ error: 'Comment text is required.' });
        }
        const cleanComment = comment.trim().slice(0, 3000);

        // Verify ticket exists
        const ticket = db.prepare('SELECT shop_id, status FROM support_tickets WHERE id = ?').get(ticketId);
        if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

        // Authorization: shop users can only comment on their own tickets
        if (!assertShopOwnership(ticket, user, res)) return;

        // Block comments on closed tickets (except superadmin can reopen via status)
        if (ticket.status === 'closed' && user.role !== 'superadmin') {
            return res.status(400).json({ error: 'This ticket is closed and cannot receive new comments.' });
        }

        const result = db.prepare(`
            INSERT INTO ticket_comments (ticket_id, user_id, comment)
            VALUES (?, ?, ?)
        `).run(ticketId, user.id, cleanComment);

        // Bump the ticket's updated_at so it surfaces in lists
        db.prepare("UPDATE support_tickets SET updated_at = datetime('now') WHERE id = ?").run(ticketId);

        res.json({ ok: true, comment_id: result.lastInsertRowid });
    } catch (e) {
        console.error('Create comment error:', e);
        res.status(500).json({ error: 'Database error posting comment' });
    }
});

module.exports = router;
