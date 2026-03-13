function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const role = req.session.user.role;
    if (role !== 'admin' && role !== 'superadmin') {
        return res.status(403).json({ error: 'Forbidden: Admins only' });
    }
    next();
}

function requireSuperAdmin(req, res, next) {
    if (!req.session || !req.session.user || req.session.user.role !== 'superadmin') {
        return res.status(403).json({ error: 'Forbidden: Superadmins only' });
    }
    next();
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin };
