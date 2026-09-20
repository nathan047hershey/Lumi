'use client';

import { Suspense } from 'react';
import View from '@/views/manager/Dashboard';

export default function Page() {
    return (
        <Suspense fallback={null}>
            <View />
        </Suspense>
    );
}
