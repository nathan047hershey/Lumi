'use client';

import { RoleLayout } from '@/next/guards';

export default function Layout({ children }) {
    return <RoleLayout managerOnly>{children}</RoleLayout>;
}
