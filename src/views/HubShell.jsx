import { Outlet } from '@/next/router';

/**
 * Route group wrapper — primary/sub navigation lives in Layout.
 */
export default function HubShell() {
    return <Outlet />;
}
