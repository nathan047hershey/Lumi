import { redirect } from 'next/navigation';

export default function Page({ params }) {
    redirect('/admin/pipeline/links/' + params.id);
}
