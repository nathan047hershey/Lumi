import { redirect } from 'next/navigation';

export default function Page({ params }) {
    redirect('/admin/performance/courses/' + params.id);
}
