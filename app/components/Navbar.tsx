"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
    const pathname = usePathname();

    const linkClass = (href: string) =>
        `hover:underline ${
        pathname === href ? "font-semibold text-black" : "text-gray-600"
        }`;

    return (
        <nav className="flex gap-6 text-sm">
        <div className="flex gap-3">
            <span className="text-gray-400">Owner:</span>
            <Link href="/owner/create" className={linkClass("/owner/create")}>
            Create Event
            </Link>
            <Link href="/owner/certificates" className={linkClass("/owner/certificates")}>
            Certificates
            </Link>
        </div>
        <div className="flex gap-3">
            <span className="text-gray-400">Organizer:</span>
            <Link href="/organizer" className={linkClass("/organizer")}>
            Requests
            </Link>
        </div>
        </nav>
    );
}
