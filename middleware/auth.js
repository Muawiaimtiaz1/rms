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

function hasPanelAccess(user, panelId) {
    if (!user) return false;
    if (user.role === 'superadmin') return true;
    let panels = user.allowed_panels || [];
    if (typeof panels === 'string') {
        try { panels = JSON.parse(panels); } catch { panels = []; }
    }
    return ['admin', 'manager'].includes(user.role) || (Array.isArray(panels) && panels.includes(panelId));
}

function requirePanel(panelId) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) return res.status(401).json({ error: 'Unauthorized' });
        if (!hasPanelAccess(req.session.user, panelId)) {
            return res.status(403).json({ error: `You do not have access to the ${panelId} panel.` });
        }
        next();
    };
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin, hasPanelAccess, requirePanel };
