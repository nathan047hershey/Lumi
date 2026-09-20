'use client';

import { Suspense } from 'react';
import View from '@/views/admin/JobLinks';

export default function Page() {
    return (
        <Suspense fallback={null}>
            <View embedded />
        </Suspense>
    );
}
