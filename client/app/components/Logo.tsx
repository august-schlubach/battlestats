"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";

const Logo: React.FC = () => {
    const router = useRouter();

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        router.push("/");
        window.dispatchEvent(new CustomEvent("resetApp"));
    };

    return (
        <Link
            href="/"
            onClick={handleClick}
            className="text-xl font-bold tracking-tight text-[#084594] transition-colors hover:text-[#2171b5]"
        >
            WoWs Battlestats
        </Link>
    );
};

export default Logo;
