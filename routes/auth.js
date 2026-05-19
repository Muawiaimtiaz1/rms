const express = require('express');
const bcrypt = require('bcryptjs');
const { getSqlite, getPostgres, usePostgres } = require('../db/runtime');
const { requireSuperAdmin } = require('../middleware/auth');
const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
        let user;
        if (usePostgres()) {
            const { rows } = await getPostgres().query('SELECT * FROM users WHERE username = $1', [username]);
            user = rows[0];
        } else {
            user = getSqlite().prepare('SELECT * FROM users WHERE username = ?').get(username);
        }

        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const valid = bcrypt.compareSync(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        if (user.status === 'blocked') {
            return res.status(403).json({ error: 'Your account has been blocked. Please contact your administrator.' });
        }

        // ─── SaaS Restrictions ──────────────────────────────────────────
        if (user.role !== 'superadmin') {
            let shop;
            if (usePostgres()) {
                const { rows } = await getPostgres().query('SELECT status FROM shops WHERE id = $1', [user.shop_id]);
                shop = rows[0];
            } else {
                shop = getSqlite().prepare('SELECT status FROM shops WHERE id = ?').get(user.shop_id);
            }

            if (!shop) return res.status(403).json({ error: 'Shop not found' });
            if (shop.status === 'blocked') return res.status(403).json({ error: 'Shop access is blocked by administrator' });

            // Check Subscription
            const now = new Date().toISOString().split('T')[0];
            let sub;
            if (usePostgres()) {
                const { rows } = await getPostgres().query(
                    'SELECT end_date FROM subscriptions WHERE shop_id = $1 AND end_date >= $2 ORDER BY end_date DESC LIMIT 1',
                    [user.shop_id, now]
                );
                sub = rows[0];
            } else {
                sub = getSqlite().prepare(`
                    SELECT end_date FROM subscriptions 
                    WHERE shop_id = ? AND end_date >= ?
                    ORDER BY end_date DESC LIMIT 1
                `).get(user.shop_id, now);
            }

            if (!sub) return res.status(403).json({ error: 'No active subscription. Please contact administrator.' });
        }

        req.session.user = {
            id: user.id,
            name: user.name,
            username: user.username,
            role: user.role,
            shop_id: user.shop_id,
        };
        res.json({ ok: true, user: req.session.user });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ error: err.message });
    }
});

// Helper to get fresh user permissions
async function getFreshUser(userId) {
    let user;
    if (usePostgres()) {
        const { rows } = await getPostgres().query('SELECT * FROM users WHERE id = $1', [userId]);
        user = rows[0];
    } else {
        user = getSqlite().prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }
    
    if (!user) return null;

    let allowedPanels = user.allowed_panels ? JSON.parse(user.allowed_panels) : [];
    let shopName = 'Master Control';
    let shopType = 'other';

    if (user.role !== 'superadmin') {
        let shop;
        if (usePostgres()) {
            const { rows } = await getPostgres().query('SELECT allowed_panels, name, shop_type FROM shops WHERE id = $1', [user.shop_id]);
            shop = rows[0];
        } else {
            shop = getSqlite().prepare('SELECT allowed_panels, name, shop_type FROM shops WHERE id = ?').get(user.shop_id);
        }
        
        if (!shop) return null;
        shopName = shop.name;
        shopType = shop.shop_type || 'retail';

        const shopPanels = shop.allowed_panels ? JSON.parse(shop.allowed_panels) : [];
        if (user.role === 'admin') {
            allowedPanels = shopPanels;
        } else {
            allowedPanels = allowedPanels.filter(p => shopPanels.includes(p));
        }
    }

    return {
        ...user,
        shop_name: shopName,
        shop_type: shopType,
        allowed_panels: allowedPanels
    };
}

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
    
    const freshUser = await getFreshUser(req.session.user.id);
    if (!freshUser) return res.status(401).json({ error: 'User no longer exists' });

    // Update session with fresh data
    req.session.user.allowed_panels = freshUser.allowed_panels;
    req.session.user.shop_name = freshUser.shop_name;
    req.session.user.shop_type = freshUser.shop_type;
    req.session.user.name = freshUser.name;
    req.session.user.role = freshUser.role;

    let total_users = 0;
    let total_brands = 0;

    try {
        const shopId = req.session.user.shop_id;
        const isPostgres = usePostgres();
        
        const userQ = shopId 
            ? `SELECT COUNT(*)::int as c FROM users WHERE shop_id = ${isPostgres?'$1':'?'}`
            : `SELECT COUNT(*)::int as c FROM users`;
        const brandQ = shopId 
            ? `SELECT COUNT(*)::int as c FROM brands WHERE shop_id = ${isPostgres?'$1':'?'}`
            : `SELECT COUNT(*)::int as c FROM brands`;

        if (isPostgres) {
            const pg = getPostgres();
            const uRes = await pg.query(userQ, shopId ? [shopId] : []);
            total_users = uRes.rows[0].c;
            const bRes = await pg.query(brandQ, shopId ? [shopId] : []);
            total_brands = bRes.rows[0].c;
        } else {
            const sqlite = getSqlite();
            total_users = sqlite.prepare(userQ.replace('::int', '').replace(/\$\d+/g, '?')).get(...(shopId ? [shopId] : [])).c;
            total_brands = sqlite.prepare(brandQ.replace('::int', '').replace(/\$\d+/g, '?')).get(...(shopId ? [shopId] : [])).c;
        }
    } catch(e) { console.error('Error fetching counts', e); }

    res.json({ user: req.session.user, total_users, total_brands });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', requireSuperAdmin, async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    try {
        let user;
        if (usePostgres()) {
            const { rows } = await getPostgres().query('SELECT id FROM users WHERE username = $1', [username]);
            user = rows[0];
        } else {
            user = getSqlite().prepare('SELECT id FROM users WHERE username = ?').get(username);
        }

        if (!user) return res.status(404).json({ error: 'User not found' });

        const tempPassword = 'Reset@' + Math.random().toString(36).slice(2, 8).toUpperCase();
        const hash = bcrypt.hashSync(tempPassword, 10);

        if (usePostgres()) {
            await getPostgres().query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
        } else {
            getSqlite().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
        }

        res.json({ ok: true, tempPassword, message: 'Password reset. Share the temp password with the user.' });
    } catch (err) {
        console.error("Forgot password error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
