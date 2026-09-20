'use client';

import { Suspense } from 'react';
import View from '@/views/admin/Dashboard';

export default function Page() {
    return (
        <Suspense fallback={null}>
            <View />
        </Suspense>
    );
}
