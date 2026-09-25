import '../src/index.css';
import Providers from '../src/next/Providers';

export const metadata = {
    title: 'Lumi',
    description: 'Lumi — talent operations for profiles, applications, and tailored resumes',
    icons: {
        icon: '/brand/icon.svg',
        apple: '/brand/icon.svg'
    }
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link
                    href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
