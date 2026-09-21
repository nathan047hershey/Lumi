/**
 * Web Fill — autofill on ATS pages without the Chrome extension (bookmarklet loader).
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { getOne } = require('../config/database');
const { requireAuth, verifyJwtToken, extractBearerToken } = require('../middleware/auth');
const { RESUMES_DIR } = require('../config/paths');
const { readManifestVersion, buildExtensionZipBuffer } = require('../services/extensionPackService');

const router = express.Router();
const EXT_CONTENT = path.join(__dirname, '..', '..', 'extension', 'content');

/** ATS pages (Greenhouse, etc.) fetch payload cross-origin — allow any origin for web-fill API. */
router.use((req, res, next) => {
    if (!req.path.startsWith('/web-fill')) return next();
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

function getAccessibleProfile(profileId, req) {
    const id = parseInt(profileId, 10);
    if (!Number.isInteger(id) || id <= 0) return null;
    const isAdmin = req.user?.role === 'admin' || req.user?.is_admin;
    if (isAdmin) {
        return getOne(`SELECT * FROM candidate_profiles WHERE id = ?`, [id]);
    }
    return getOne(
        `SELECT p.* FROM candidate_profiles p
         JOIN user_profile_assignments ua ON ua.profile_id = p.id AND ua.user_id = ?
         WHERE p.id = ?`,
        [req.user.id, id]
    );
}

function getAccessibleApplication(applicationId, req) {
    const id = parseInt(applicationId, 10);
    if (!Number.isInteger(id) || id <= 0) return null;
    const isAdmin = req.user?.role === 'admin' || req.user?.is_admin;
    if (isAdmin) {
        return getOne(`SELECT * FROM job_applications WHERE id = ?`, [id]);
    }
    return getOne(
        `SELECT a.* FROM job_applications a
         JOIN user_profile_assignments ua ON ua.profile_id = a.profile_id AND ua.user_id = ?
         WHERE a.id = ?`,
        [req.user.id, id]
    );
}

/** Accept Bearer header or ?token= for bookmarklet script tags. */
function webFillAuth(req, res, next) {
    const raw = extractBearerToken(req) || String(req.query.token || '').trim();
    if (!raw) {
        return res.status(401).type('text/plain').send('Missing token — log into Lumi and regenerate Web Fill bookmarklet.');
    }
    try {
        req.user = verifyJwtToken(raw);
        next();
    } catch {
        return res.status(401).type('text/plain').send('Session expired — log into Lumi and regenerate Web Fill bookmarklet.');
    }
}

router.get('/extension/info', requireAuth, (_req, res) => {
    res.json({
        version: readManifestVersion(),
        install: 'unpacked',
        note: 'Download ZIP, extract, chrome://extensions → Developer mode → Load unpacked'
    });
});

router.get('/extension/download', requireAuth, (_req, res) => {
    try {
        const buf = buildExtensionZipBuffer();
        const ver = readManifestVersion();
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="lumi-extension-v${ver}.zip"`);
        res.send(buf);
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to build extension package' });
    }
});

/** Public — fill engine scripts (no secrets). */
router.get('/web-fill/static/:file', (req, res) => {
    const safe = path.basename(req.params.file || '');
    const allowed = new Set(['controlMatch.js', 'fillShared.js', 'fill.js', 'bidderFill.js']);
    if (!allowed.has(safe)) {
        return res.status(404).type('text/plain').send('Not found');
    }
    const fp = path.join(EXT_CONTENT, safe);
    if (!fs.existsSync(fp)) {
        return res.status(404).type('text/plain').send('Not found');
    }
    res.type('application/javascript');
    res.sendFile(fp);
});

router.get('/web-fill/payload', webFillAuth, (req, res) => {
    try {
        const profileId = parseInt(req.query.profile_id, 10);
        const applicationId = parseInt(req.query.application_id, 10);
        const profile = getAccessibleProfile(profileId, req);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });

        let app = null;
        if (Number.isInteger(applicationId) && applicationId > 0) {
            app = getAccessibleApplication(applicationId, req);
        }

        const packet = require('../services/bidderPacketService');
        const answers = app
            ? packet.loadAnswersForApplication(applicationId)
            : [];

        const resumeFilename = app?.resume_filename || '';
        let resumeDataUrl = '';
        if (resumeFilename) {
            const fp = path.join(RESUMES_DIR, path.basename(resumeFilename));
            if (fs.existsSync(fp)) {
                const b64 = fs.readFileSync(fp).toString('base64');
                const ext = path.extname(resumeFilename).toLowerCase();
                const mime = ext === '.pdf' ? 'application/pdf'
                    : ext === '.doc' ? 'application/msword'
                        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                resumeDataUrl = `data:${mime};base64,${b64}`;
            }
        }

        res.json({
            profile: {
                id: profile.id,
                first_name: profile.first_name,
                last_name: profile.last_name,
                email: profile.email,
                phone: profile.phone,
                city: profile.city,
                state: profile.state,
                country: profile.country,
                linkedin_url: profile.linkedin_url,
                github_url: profile.github_url,
                website_url: profile.website_url,
                work_authorization: profile.work_authorization,
                requires_sponsorship: profile.requires_sponsorship,
                salary_range: profile.salary_range,
                willing_to_relocate: profile.willing_to_relocate,
                earliest_start_date: profile.earliest_start_date,
                notice_period: profile.notice_period,
                gender: profile.gender,
                veteran_status: profile.veteran_status,
                disability_status: profile.disability_status,
                race_ethnicity: 'Black or African American',
                school: profile.school,
                degree: profile.degree,
                discipline: profile.discipline,
                years_of_experience: profile.years_of_experience
            },
            answers,
            jobDescription: app?.job_description || '',
            companyName: app?.company_name || '',
            jobRole: app?.job_role || '',
            applicationId: app?.id || null,
            resume: resumeFilename
                ? { filename: resumeFilename, dataUrl: resumeDataUrl }
                : null
        });
    } catch (err) {
        res.status(500).json({ error: err.message || 'Failed to build fill payload' });
    }
});

router.get('/web-fill/bookmarklet', requireAuth, (req, res) => {
    const profileId = parseInt(req.query.profile_id, 10);
    const applicationId = parseInt(req.query.application_id, 10);
    if (!Number.isInteger(profileId) || profileId <= 0) {
        return res.status(400).json({ error: 'profile_id is required' });
    }
    const profile = getAccessibleProfile(profileId, req);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || `localhost:${process.env.PORT || 9017}`;
    const apiBase = `${proto}://${host}/user`;

    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
        || req.query.token
        || '';

    const qs = new URLSearchParams({
        token,
        profile_id: String(profileId),
        ...(Number.isInteger(applicationId) && applicationId > 0
            ? { application_id: String(applicationId) }
            : {})
    });

    const loaderUrl = `${apiBase}/web-fill/loader.js?${qs.toString()}`;
    const bookmarklet = `javascript:${encodeURIComponent(`(function(){if(document.getElementById('lumi-web-fill-loader'))return;var s=document.createElement('script');s.id='lumi-web-fill-loader';s.src=${JSON.stringify(loaderUrl)}+'&t='+Date.now();s.onerror=function(){alert('Lumi Web Fill failed — log in again and copy a fresh bookmarklet from Autofill Settings.');};document.documentElement.appendChild(s);})();`)}`;

    res.json({
        bookmarklet,
        loader_url: loaderUrl,
        profile_id: profileId,
        application_id: applicationId || null,
        expires_note: 'Bookmarklet uses your current login session. Regenerate after logout or token expiry.'
    });
});

router.get('/web-fill/loader.js', webFillAuth, (req, res) => {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || `localhost:${process.env.PORT || 9017}`;
    const apiBase = `${proto}://${host}/user`;
    const token = encodeURIComponent(req.query.token || '');
    const profileId = encodeURIComponent(req.query.profile_id || '');
    const applicationId = encodeURIComponent(req.query.application_id || '');

    const js = `(function(){
  if (window.__LUMI_WEB_FILL_RUNNING__) return;
  window.__LUMI_WEB_FILL_RUNNING__ = true;
  var API = ${JSON.stringify(apiBase)};
  var TOKEN = decodeURIComponent(${JSON.stringify(token)});
  var PROFILE_ID = decodeURIComponent(${JSON.stringify(profileId)});
  var APPLICATION_ID = decodeURIComponent(${JSON.stringify(applicationId)});

  function toast(msg, kind) {
    var el = document.getElementById('lumi-web-fill-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lumi-web-fill-toast';
      el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:12px 18px;border-radius:12px;font:600 13px system-ui,sans-serif;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.35);max-width:90vw;text-align:center;';
      document.documentElement.appendChild(el);
    }
    el.style.background = kind === 'error' ? '#b91c1c' : kind === 'ok' ? '#059669' : '#2563eb';
    el.textContent = msg;
    setTimeout(function(){ try{ el.remove(); }catch(_){} }, 6000);
  }

  window.__chromeListeners = [];
  window.chrome = {
    runtime: {
      id: 'lumi-web-fill',
      lastError: null,
      onMessage: { addListener: function(fn){ window.__chromeListeners.push(fn); } },
      sendMessage: function(msg, cb) {
        if (msg && msg.type === 'ENSURE_US_DIAL_CODE') {
          if (typeof cb === 'function') cb({ ok: true });
          return;
        }
        if (typeof cb === 'function') cb({ ok: false, error: 'web_fill_no_background' });
      }
    }
  };

  function dispatch(msg) {
    return new Promise(function(resolve) {
      var done = false;
      function respond(p){ if (!done){ done = true; resolve(p || {}); } }
      var list = window.__chromeListeners || [];
      for (var i = 0; i < list.length; i++) {
        try {
          if (list[i](msg, {}, respond) === true) return;
        } catch (e) { respond({ ok: false, error: String(e && e.message || e) }); return; }
      }
      setTimeout(function(){ if (!done) respond({ ok: false, error: 'no_listener' }); }, 150);
    });
  }

  function loadScript(src) {
    return new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function(){ reject(new Error('load failed: ' + src)); };
      document.documentElement.appendChild(s);
    });
  }

  toast('Lumi Web Fill loading…');

  fetch(API + '/web-fill/payload?token=' + encodeURIComponent(TOKEN)
    + '&profile_id=' + encodeURIComponent(PROFILE_ID)
    + (APPLICATION_ID ? '&application_id=' + encodeURIComponent(APPLICATION_ID) : ''))
    .then(function(r){ if (!r.ok) throw new Error('payload ' + r.status); return r.json(); })
    .then(function(payload) {
      return loadScript(API + '/web-fill/static/controlMatch.js?t=' + Date.now())
        .then(function(){ return loadScript(API + '/web-fill/static/fillShared.js?t=' + Date.now()); })
        .then(function(){ return loadScript(API + '/web-fill/static/fill.js?t=' + Date.now()); })
        .then(function(){ return payload; });
    })
    .then(function(payload) {
      toast('Scanning form…');
      return dispatch({ type: 'COLLECT_FORM' }).then(function(collect) {
        if (!collect || !collect.ok) throw new Error((collect && collect.error) || 'Could not read form');
        toast('Filling…');
        var fillPayload = {
          profile: payload.profile,
          answers: payload.answers || [],
          jobDescription: payload.jobDescription || '',
          companyName: payload.companyName || '',
          jobRole: payload.jobRole || '',
          resume: payload.resume || undefined,
          filename: payload.resume && payload.resume.filename,
          autoSubmit: false
        };
        return dispatch({ type: 'FILL_FORM', payload: fillPayload }).then(function(fill) {
          var n = (fill && fill.filled) || (fill && fill.data && fill.data.filled) || 0;
          toast('Filled ' + n + ' field(s). Review before submit.', 'ok');
          window.__LUMI_WEB_FILL_RUNNING__ = false;
        });
      });
    })
    .catch(function(err) {
      toast(err && err.message ? err.message : 'Web Fill failed', 'error');
      window.__LUMI_WEB_FILL_RUNNING__ = false;
    });
})();`;

    res.type('application/javascript').send(js);
});

module.exports = router;
