'use client';

import { Suspense } from 'react';
import View from '@/views/user/ResumeTemplateBuilder';

export default function Page() {
    return (
        <Suspense fallback={null}>
            <View />
        </Suspense>
    );
}
