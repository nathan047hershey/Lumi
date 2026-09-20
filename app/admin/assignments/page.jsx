'use client';

import { Suspense } from 'react';
import View from '@/views/admin/Assignments';

export default function Page() {
    return (
        <Suspense fallback={null}>
            <View />
        </Suspense>
    );
}
