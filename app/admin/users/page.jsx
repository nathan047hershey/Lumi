'use client';

import { Suspense } from 'react';
import View from '@/views/admin/UserManagement';

export default function Page() {
    return (
        <Suspense fallback={null}>
            <View />
        </Suspense>
    );
}
