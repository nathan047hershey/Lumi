/**
 * Per-ATS field synonym packs — map common labels → profile kinds.
 * Used by classifyPersonal / personalValue callers via atsSynonymKind().
 */
(function lumiAtsPacks(global) {
    const PACKS = {
        greenhouse: {
            'first name': 'first_name',
            'last name': 'last_name',
            'preferred name': 'first_name',
            email: 'email',
            phone: 'phone',
            'mobile phone': 'phone',
            'linkedIn profile': 'linkedin',
            linkedin: 'linkedin',
            website: 'github',
            'personal website': 'github',
            'github url': 'github',
            school: 'school',
            university: 'school',
            degree: 'degree',
            discipline: 'discipline',
            'field of study': 'discipline',
            'start date': 'edu_start',
            'end date': 'edu_end',
            location: 'city',
            city: 'city',
            'current location': 'city',
            'work authorization': 'work_authorization',
            'authorized to work': 'work_authorization',
            sponsorship: 'requires_sponsorship',
            'require sponsorship': 'requires_sponsorship'
        },
        lever: {
            'full name': 'full_name',
            name: 'full_name',
            email: 'email',
            phone: 'phone',
            'current company': 'current_company',
            'current location': 'city',
            linkedin: 'linkedin',
            'github / portfolio': 'github',
            portfolio: 'github',
            'additional information': 'question'
        },
        ashby: {
            'first name': 'first_name',
            'last name': 'last_name',
            email: 'email',
            'phone number': 'phone',
            'linkedin url': 'linkedin',
            'github url': 'github',
            'website url': 'github',
            location: 'city',
            'are you authorized': 'work_authorization',
            sponsorship: 'requires_sponsorship'
        },
        workday: {
            'legal name': 'full_name',
            'first name': 'first_name',
            'last name': 'last_name',
            'email address': 'email',
            'phone device type': 'phone_type',
            'phone number': 'phone',
            'country phone code': 'phone_dial',
            address: 'address',
            city: 'city',
            state: 'state',
            'postal code': 'zip',
            country: 'country',
            'how did you hear': 'source'
        }
    };

    function detectAtsHost(url) {
        const u = String(url || (typeof location !== 'undefined' ? location.href : '')).toLowerCase();
        if (/greenhouse|grnhse|boards\.greenhouse/.test(u)) return 'greenhouse';
        if (/lever\.co|jobs\.lever/.test(u)) return 'lever';
        if (/ashbyhq|ashby\.com/.test(u)) return 'ashby';
        if (/myworkdayjobs|workday/.test(u)) return 'workday';
        return 'generic';
    }

    function atsSynonymKind(label, ats) {
        const lab = String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (!lab) return '';
        const id = String(ats || detectAtsHost()).toLowerCase();
        const pack = PACKS[id] || {};
        if (pack[lab]) return pack[lab];
        for (const [key, kind] of Object.entries(pack)) {
            if (lab.includes(key) || key.includes(lab)) return kind;
        }
        // Cross-pack fallback for common contact labels
        for (const p of Object.values(PACKS)) {
            if (p[lab]) return p[lab];
        }
        return '';
    }

    const api = { PACKS, detectAtsHost, atsSynonymKind };
    if (typeof globalThis !== 'undefined') globalThis.LumiAtsPacks = api;
    if (typeof window !== 'undefined') window.LumiAtsPacks = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
