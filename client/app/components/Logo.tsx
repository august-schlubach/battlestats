"use client";

import React from "react";

const Logo: React.FC = () => {
    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("resetApp"));
    };

    return (
        <a
            href="/"
            onClick={handleClick}
            className="text-xl font-bold tracking-tight text-[#084594] hover:text-[#2171b5] transition-colors"
        >
            WoWs Battlestats
        </a>
    );
};

export default Logo;
