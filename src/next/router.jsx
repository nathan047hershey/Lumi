'use client';

import { useEffect } from 'react';
import NextLink from 'next/link';
import {
    usePathname,
    useRouter,
    useParams as useNextParams,
    useSearchParams as useNextSearchParams
} from 'next/navigation';

/** Drop-in stand-in for react-router-dom, backed by the Next.js App Router. */

export function useNavigate() {
    const router = useRouter();
    return (to, options) => {
        if (typeof to === 'number') {
            if (to < 0) router.back();
            else router.forward();
            return;
        }
        let url = to;
        if (to && typeof to === 'object') {
            url = `${to.pathname || ''}${to.search || ''}${to.hash || ''}`;
        }
        if (options?.replace) router.replace(url);
        else router.push(url);
    };
}

export function useLocation() {
    const pathname = usePathname() || '/';
    const sp = useNextSearchParams();
    const search = sp?.toString() ? `?${sp.toString()}` : '';
    return { pathname, search, hash: '', state: null, key: pathname };
}

export function useParams() {
    return useNextParams() || {};
}

export function useSearchParams() {
    const sp = useNextSearchParams();
    const router = useRouter();
    const pathname = usePathname() || '/';
    const setSearchParams = (next, options) => {
        const current = new URLSearchParams(sp?.toString() || '');
        const resolved = typeof next === 'function' ? next(current) : next;
        const params = resolved instanceof URLSearchParams
            ? resolved
            : new URLSearchParams(resolved || '');
        const q = params.toString();
        const url = q ? `${pathname}?${q}` : pathname;
        if (options?.replace) router.replace(url);
        else router.push(url);
    };
    return [sp, setSearchParams];
}

export function Link({ to, href, children, ...rest }) {
    return <NextLink href={href || to || '#'} {...rest}>{children}</NextLink>;
}

export function NavLink({ to, children, onClick, className, end, ...rest }) {
    return (
        <NextLink href={to || '#'} onClick={onClick} className={className} {...rest}>
            {children}
        </NextLink>
    );
}

export function Navigate({ to, replace = false }) {
    const router = useRouter();
    useEffect(() => {
        if (!to) return;
        if (replace) router.replace(to);
        else router.push(to);
    }, [router, to, replace]);
    return null;
}

export function Outlet() {
    return null;
}
