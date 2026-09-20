'use client';

import { Suspense } from 'react';
import View from '@/views/user/Applications';

export default function Page() {
    return (
        <Suspense fallback={null}>
            <View embedded />
        </Suspense>
    );
}
