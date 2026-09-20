import { redirect } from 'next/navigation';

export default function Page({ params }) {
    redirect('/user/pipeline/links/' + params.id);
}
