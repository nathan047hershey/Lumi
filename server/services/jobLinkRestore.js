'use strict';

const VALID_TECHSTACKS = ['python', 'java', 'dotnet', 'golang', 'nodejs', 'frontend'];

function pickRowsToRestore(rows, existing) {
    const ids = new Set((existing && existing.ids) || []);
    const urls = new Set((existing && existing.urls) || []);
    const out = [];
    const list = Array.isArray(rows) ? rows : [];
    for (const row of list) {
        if (!row || typeof row !== 'object') continue;
        const apply = String(row.job_apply_url || '').trim();
        const id = parseInt(row.id, 10);
        const techstack = String(row.techstack || '').trim();
        if (!apply || !Number.isInteger(id) || id <= 0) continue;
        if (!VALID_TECHSTACKS.includes(techstack)) continue;
        if (ids.has(id) || urls.has(apply)) continue;
        out.push({
            id,
            techstack,
            job_apply_url: apply,
            source_url: row.source_url ? String(row.source_url).trim() : null,
            job_description: row.job_description ? String(row.job_description) : null,
            company_name: row.company_name ? String(row.company_name) : null,
            position_title: row.position_title ? String(row.position_title) : null,
            location: row.location ? String(row.location) : null,
            fetch_status: ['pending', 'fetching', 'success', 'failed'].includes(row.fetch_status)
                ? row.fetch_status
                : (row.job_description ? 'success' : 'pending'),
            created_at: row.created_at ? String(row.created_at) : null,
            is_available: row.is_available === 0 || row.is_available === false ? 0 : 1
        });
        ids.add(id);
        urls.add(apply);
        if (out.length >= 50) break;
    }
    return out;
}

function restoreRememberedJobLinks(rows, userId) {
    const { getOne, runQuery } = require('../config/database');
    const existingIds = [];
    const existingUrls = [];
    const chosen = pickRowsToRestore(rows, { ids: [], urls: [] });
    const toInsert = [];
    for (const row of chosen) {
        const byId = getOne('SELECT id FROM job_links WHERE id = ?', [row.id]);
        if (byId) {
            existingIds.push(row.id);
            continue;
        }
        const byUrl = getOne('SELECT id FROM job_links WHERE job_apply_url = ?', [row.job_apply_url]);
        if (byUrl) {
            existingUrls.push(row.job_apply_url);
            continue;
        }
        toInsert.push(row);
    }
    let restored = 0;
    for (const row of toInsert) {
        runQuery(
            `INSERT INTO job_links (
                id, techstack, source_url, job_apply_url, job_description,
                company_name, position_title, location, is_available, fetch_status,
                created_by, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), datetime('now'))`,
            [
                row.id,
                row.techstack,
                row.source_url,
                row.job_apply_url,
                row.job_description,
                row.company_name,
                row.position_title,
                row.location,
                row.is_available,
                row.fetch_status,
                userId || null,
                row.created_at
            ]
        );
        restored += 1;
    }
    return { restored, skipped: existingIds.length + existingUrls.length };
}

module.exports = { pickRowsToRestore, restoreRememberedJobLinks };
