import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from '@/next/router';
import { adminAPI } from '@/api';
import AutoBidderDialog from '@/components/job-links/AutoBidderDialog';
import { parseBidLinkIds, readLumiBidLinks, rememberLumiBidLinks, slimBidLink } from '@/lib/lumiBidPageLinks';

export default function LumiBidPage() {
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const isAdmin = location.pathname.startsWith('/admin');
    const idsKey = searchParams?.get('ids') || '';
    const [links, setLinks] = useState(() => readLumiBidLinks(parseBidLinkIds(idsKey)));

    useEffect(() => {
        const ids = parseBidLinkIds(idsKey);
        const cached = readLumiBidLinks(ids);
        if (!ids.length) {
            setLinks(cached);
            return undefined;
        }
        if (cached.length) setLinks(cached);
        let cancelled = false;
        (async () => {
            const loaded = [];
            for (const id of ids) {
                try {
                    const { data } = await adminAPI.getJobLink(id);
                    const row = data?.data?.id ? data.data : (data?.job_link || data?.jobLink || data);
                    const slim = slimBidLink(row);
                    if (slim) loaded.push(slim);
                } catch { /* keep the stored row */ }
            }
            if (cancelled || !loaded.length) return;
            setLinks(loaded);
            rememberLumiBidLinks(loaded);
        })();
        return () => { cancelled = true; };
    }, [idsKey]);

    return (
        <AutoBidderDialog
            pageMode
            open
            onOpenChange={() => {}}
            isAdmin={isAdmin}
            selectedLinks={links}
        />
    );
}
