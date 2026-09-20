'use client';

import { Suspense } from 'react';
import View from '@/views/caller/CallerProfile';

export default function Page() {
    return (
        <Suspense fallback={null}>
            <View />
        </Suspense>
    );
}
