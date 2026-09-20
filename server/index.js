// Load environment variables from .env (must be first)
const path = require('path');
require('dotenv').config();
// Optional local overrides (gitignored). Use for API keys you don't want
// to paste through the Admin Settings UI — e.g. MiniMax Key 2.
require('dotenv').config({
    path: path.join(__dirname, 'local.env'),
    override: true
});

const express = require('express');
const cors = require('cors');
const fs = require('fs');
// path already required above
const { isAllowedCorsOrigin, listLanIPv4 } = require('./utils/networkHosts');
const { requireResumeAuth } = require('./middleware/auth');

const { initDatabase } = require('./config/database');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');
const callerRoutes = require('./routes/caller');
const managerRoutes = require('./routes/manager');
const { router: jobLinksRouter, adminWriteRouter: jobLinksAdminRouter } = require('./routes/jobLinks');
const { initProvider, shutdownProvider } = require('./services/jobLinkScraper');
const jobDetailFetchService = require('./services/jobDetailFetchService');
const { startCron: startAutoApplyCron, stopCron: stopAutoApplyCron, startWorker: startAutoApplyWorker, stopWorker: stopAutoApplyWorker, closeQueue: closeAutoApplyQueue } = require('./services/jobMatchService');

const app = express();
const PORT = process.env.PORT || 9017;
const isVercel = Boolean(process.env.VERCEL);

// Next mounts this app under /api/*. Strip that prefix so existing routes stay /auth, /user, …
app.use((req, _res, next) => {
    const strip = (value) => (typeof value === 'string' && value.startsWith('/api/')
        ? (value.slice(4) || '/')
        : value);
    req.url = strip(req.url);
    if (req.originalUrl) req.originalUrl = strip(req.originalUrl);
    next();
});

// Middleware
app.use(cors({
    // Vite client + Chrome extension + other PCs on the LAN (192.168.x.x, etc.).
    origin(origin, callback) {
        callback(null, isAllowedCorsOrigin(origin));
    },
    credentials: true
}));
app.use(express.json({
    // DOCX templates are uploaded as base64 inside JSON, which inflates
    // the wire payload by ~33%. We cap uploads at 25 MB on the wire so a
    // 10 MB raw DOCX (the client-side cap) still fits, with headroom for
    // the JSON envelope (filename, name, description, etc.).
    limit: '25mb'
}));
// Mailgun / form-style inbound parse for /api/hooks/inbound-mail
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Static files for resumes (<repo>/database/resumes by default)
const { RESUMES_DIR, DATA_ROOT } = require('./config/paths');
app.use('/resumes', requireResumeAuth, express.static(RESUMES_DIR, { fallthrough: false }));
console.log('[boot] serving resumes from', RESUMES_DIR, '(auth required · DATA_ROOT', DATA_ROOT + ')');

// Health check must be registered before jobLinksRouter (mounted at `/`
// with a global requireAuth middleware that would otherwise block it).
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

require('./routes/extensionUpdate').registerExtensionUpdateRoutes(app);

// Public mail-forward webhook (token-secured) — MUST be before jobLinksRouter
// which mounts at `/` with global requireAuth and would 401 unauthenticated POSTs.
app.use('/api/hooks', require('./routes/inboundMail'));
app.use('/hooks', require('./routes/inboundMail'));

// Optional: serve built client (single process for remote laptops — no Vite).
const clientDist = path.join(__dirname, '..', 'client', 'dist');
const serveClient = process.env.LUMI_SERVE_CLIENT === '1'
    || String(process.env.LUMI_SERVE_CLIENT || '').toLowerCase() === 'true';
const VITE_PORT = String(process.env.VITE_PORT || '5173');

function viteDevOrigin(req) {
    const hostHeader = String(req.headers.host || '127.0.0.1').split(',')[0].trim();
    let hostname = '127.0.0.1';
    if (hostHeader.startsWith('[')) {
        const end = hostHeader.indexOf(']');
        hostname = end > 0 ? hostHeader.slice(1, end) : hostname;
    } else {
        hostname = hostHeader.split(':')[0] || hostname;
    }
    const host = hostname.includes(':') ? `[${hostname}]` : hostname;
    return `http://${host}:${VITE_PORT}`;
}

function isViteModulePath(p) {
    return p.startsWith('/src')
        || p.startsWith('/@')
        || p.startsWith('/node_modules')
        || p.startsWith('/brand')
        || p.startsWith('/assets');
}

function isApiOnlyPath(p) {
    return p === '/health'
        || p.startsWith('/resumes')
        || p.startsWith('/hooks')
        || p.startsWith('/api')
        || p.startsWith('/auth')
        || p.startsWith('/extension');
}

if (serveClient && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // Browser document navigations (Accept: text/html) must get the SPA even when
    // the path overlaps API mounts like /admin/settings — otherwise Express returns 401 JSON.
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        if (isApiOnlyPath(req.path) || req.path.startsWith('/resumes/')) return next();
        const accept = String(req.headers.accept || '');
        if (!accept.includes('text/html')) return next();
        const leaf = req.path.split('/').pop() || '';
        if (leaf.includes('.')) return next();
        return res.sendFile(path.join(clientDist, 'index.html'));
    });
    console.log('[boot] serving client from', clientDist, '(LUMI_SERVE_CLIENT=1)');
}

// API Routes
app.use('/auth', authRoutes);
app.use('/admin', jobLinksAdminRouter);
app.use('/admin', adminRoutes);
// Job Links — list / create / update / delete are available to any
// authenticated user (the directory is the team's shared view). The
// scrape endpoint alone is admin-only because it makes outbound
// requests to LinkedIn from the server's IP — we don't want a regular
// user to be able to burst many fetches at once.
//
// Mounting:
//   - `jobLinksRouter` paths are `/job-links`, `/job-links/:id`, etc.
//     Gate to `/job-links*` only — mounting at `/` made requireAuth
//     run on every request (including GET `/` for the SPA).
//   - `jobLinksAdminRouter` (the scrape endpoint) is mounted at
//     `/admin` BEFORE `adminRoutes` so its own `requireAdmin`
//     intercepts the request before the admin router's middleware
//     chain runs.
app.use((req, res, next) => {
    if (!req.path.startsWith('/job-links')) return next();
    return jobLinksRouter(req, res, next);
});
app.use('/user',    require('./routes/webFill'));
app.use('/user',    userRoutes);
app.use('/caller',  callerRoutes);
app.use('/manager', managerRoutes);

if (!serveClient || !fs.existsSync(clientDist)) {
    // API-only mode: browsers still hitting :9017 (cached SPA or old bookmark)
    // get HTML 404 for /src/*.jsx — Chrome then reports the MIME module error.
    app.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        if (isApiOnlyPath(req.path)) return next();
        const accept = String(req.headers.accept || '');
        const wantsHtml = accept.includes('text/html') || req.path === '/';
        if (!wantsHtml && !isViteModulePath(req.path)) return next();
        const dest = `${viteDevOrigin(req)}${req.originalUrl || req.url}`;
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.redirect(302, dest);
    });
    console.log(`[boot] API only — browser requests redirect to Vite :${VITE_PORT}`);
}

// Error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function startServer() {
    try {
        await initDatabase();
        console.log('Database initialized successfully');

        try {
            require('./services/bidderBrainService').ensureFieldAttemptTable();
            require('./services/bidderBrainService').ensureFillLessonTable();
            console.log('[boot] bidder-engine-v1 field-attempt table ready');
        } catch (err) {
            console.warn('[boot] bidder brain table skipped:', err.message);
        }

        // Apply MINIMAX_KEY_SLOT from local.env when DB has no slot yet.
        try {
            const settingsService = require('./services/settingsService');
            // When MINIMAX_PREFER_ENV=1, local.env MINIMAX_KEY_SLOT is the boot default.
            const preferEnv = String(process.env.MINIMAX_PREFER_ENV || '').trim() === '1'
                || String(process.env.MINIMAX_PREFER_ENV || '').trim().toLowerCase() === 'true';
            const synced = settingsService.syncMinimaxSlotFromEnv({ force: preferEnv });
            const mm = settingsService.getMinimaxKeysStatus(synced);
            console.log(
                `[boot] MiniMax Key ${mm.active_slot} active` +
                (mm.key_2?.is_set ? ` · Key 2 set (${mm.key_2.masked})` : ' · Key 2 not set') +
                (mm.keys_from_env ? ' · keys from local.env' : '')
            );
            try {
                const gq = settingsService.getGroqKeysStatus();
                const answers = settingsService.getAnswersProviderConfig();
                console.log(
                    `[boot] Answers engine: ${answers.provider} (${answers.model})` +
                    (gq.count ? ` · ${gq.count} Groq key(s)` : ' · no Groq keys yet')
                );
            } catch (ansErr) {
                console.warn('[boot] Answers provider:', ansErr.message);
            }
        } catch (err) {
            console.warn('[boot] MiniMax settings sync skipped:', err.message);
        }

        const server = app.listen(PORT, '0.0.0.0', () => {
            const lan = listLanIPv4();
            console.log(`
╔════════════════════════════════════════════════╗
║  Job Application Management Platform - Server  ║
╠════════════════════════════════════════════════╣
║  Local:   http://localhost:${PORT}                  ║
${lan.length ? lan.map((ip) => `║  Network: http://${ip}:${PORT}               ║`).join('\n') : '║  Network: (no LAN IPv4 detected)               ║'}
╚════════════════════════════════════════════════╝
      `);
            if (lan.length) {
                console.log('[boot] Other computers on your network can use:');
                for (const ip of lan) {
                    console.log(`         http://${ip}:${PORT}/health  (API)`);
                    if (serveClient && fs.existsSync(clientDist)) {
                        console.log(`         http://${ip}:${PORT}       (app + API)`);
                        console.log(`         http://${ip}:${VITE_PORT}       (app + API, frontend port)`);
                    } else {
                        console.log(`         http://${ip}:${VITE_PORT}         (client dev — run Vite on server PC)`);
                    }
                }
            }
        });

        // Increase server timeout to 3 minutes for long-running AI requests
        server.timeout = 180000; // 3 minutes
        server.keepAliveTimeout = 185000; // Slightly longer than timeout
        server.headersTimeout = 190000; // Slightly longer than keepAliveTimeout
        require('./services/extensionLiveSocket').attachExtensionLiveSocket(server);
        console.log('[boot] extension live socket ws://0.0.0.0:' + PORT + '/extension/live');

        // Also bind :5173 when serving the built UI so other laptops can keep
        // using the frontend URL without running a second Vite process (OOM).
        const frontendPort = Number(VITE_PORT);
        const alsoServeFrontendPort = serveClient
            && fs.existsSync(clientDist)
            && Number.isFinite(frontendPort)
            && frontendPort > 0
            && frontendPort !== Number(PORT)
            && String(process.env.LUMI_BIND_FRONTEND_PORT || '1') !== '0';
        if (alsoServeFrontendPort) {
            const feServer = app.listen(frontendPort, '0.0.0.0', () => {
                console.log(`[boot] also listening on :${frontendPort} (same app + API for remote laptops)`);
            });
            feServer.timeout = 180000;
            feServer.keepAliveTimeout = 185000;
            feServer.headersTimeout = 190000;
            require('./services/extensionLiveSocket').attachExtensionLiveSocket(feServer);
            feServer.on('error', (err) => {
                console.warn(`[boot] could not bind :${frontendPort}:`, err.message);
            });
        }

        // Initialise the LinkedIn / ATS scraper provider. No cron
        // here — fetching is driven by the RabbitMQ worker started
        // below. initProvider() also runs the one-time recovery
        // pass that flips any rows stuck in 'fetching' back to
        // 'pending' and re-enqueues them so a fresh boot never
        // silently drops work.
        initProvider().catch((err) => {
            console.error('[boot] failed to initialise scraper provider:', err.message);
        });

        // Boot the job-detail fetch worker (RabbitMQ consumer,
        // prefetch=1). Every POST /job-links (and the recovery
        // pass above) drops a message on the `job_detail_fetch`
        // queue; this worker pulls them one at a time and invokes
        // scrapeJobLinkById() in services/jobLinkScraper.js.
        try {
            await jobDetailFetchService.startWorker();
        } catch (err) {
            console.error('[boot] failed to start job-detail fetch worker:', err.message);
            // Still run the retry scheduler so pending/failed rows get
            // inline-scraped even when RabbitMQ is down at boot.
            try {
                jobDetailFetchService.startRetryScheduler();
            } catch (_) { /* ignore */ }
        }

        // Boot the auto-apply cron (5min default). Pulls freshly
        // fetched job_links, scores candidate profiles, and
        // enqueues (profile, job_link) pairs onto the
        // RabbitMQ-backed resume_generation queue. The actual
        // generation runs in the worker started below. See
        // services/jobMatchService.js for the matching heuristic
        // and services/resumeQueueService.js for the broker.
        startAutoApplyCron();

        // Boot the resume-generation worker (RabbitMQ consumer,
        // prefetch=1). Processes one message at a time so the AI
        // provider can't be stampeded. Failures are surfaced on
        // the job_applications row and the message is nacked
        // without requeue (poison-message protection).
        try {
            await startAutoApplyWorker();
        } catch (err) {
            console.error('[boot] failed to start resume-generation worker:', err.message);
        }

        // Outlook inbox sync (Greenhouse email security codes) — polls
        // connected accounts on an interval so OTPs arrive without watching mail.
        try {
            require('./services/outlookMailService').startOutlookMailService();
        } catch (err) {
            console.warn('[boot] Outlook mail service skipped:', err.message);
        }
        try {
            require('./services/gmailImapService').startGmailImapService();
        } catch (err) {
            console.warn('[boot] Gmail IMAP (free) service skipped:', err.message);
        }

        // Graceful shutdown — make sure the in-flight scrape gets a
        // chance to finish before the process exits. PM2 sends
        // SIGINT on reload, so this catches both `pm2 restart` and
        // `Ctrl+C` during local dev.
        const shutdown = async () => {
            console.log('Shutting down — stopping workers...');
            try { require('./services/outlookMailService').stopOutlookMailService(); } catch (_) { /* ignore */ }
            try { require('./services/gmailImapService').stopGmailImapService(); } catch (_) { /* ignore */ }
            try { await shutdownProvider(); } catch (_) { /* ignore */ }
            try { await jobDetailFetchService.closeQueue(); } catch (_) { /* ignore */ }
            try { await stopAutoApplyCron(); } catch (_) { /* ignore */ }
            try { await stopAutoApplyWorker(); } catch (_) { /* ignore */ }
            try { await closeAutoApplyQueue(); } catch (_) { /* ignore */ }
            server.close(() => process.exit(0));
            setTimeout(() => process.exit(0), 5000).unref();
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

async function ensureReady() {
    if (ensureReady._done) return;
    await initDatabase();
    ensureReady._done = true;
}

if (!isVercel && require.main === module) {
    startServer();
}

module.exports = { app, startServer, ensureReady, PORT };
