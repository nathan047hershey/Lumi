'use client';

import { Suspense } from 'react';
import View from '@/views/user/ProfileView';

export default function Page() {
    return (
        <Suspense fallback={null}>
            <View />
        </Suspense>
    );
}
