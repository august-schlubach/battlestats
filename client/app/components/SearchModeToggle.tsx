"use client";

import React from "react";
import { useT } from "../context/LocaleContext";

interface SearchModeToggleProps {
    mode: "player" | "clan";
    onToggle: () => void;
}

const SearchModeToggle: React.FC<SearchModeToggleProps> = ({ mode, onToggle }) => {
    const t = useT();
    const isClan = mode === "clan";
    const tooltip = isClan ? t("nav.searchClan") : t("nav.searchPlayer");

    return (
        <button
            type="button"
            role="switch"
            aria-checked={isClan}
            aria-label={tooltip}
            title={tooltip}
            onClick={onToggle}
            className="relative flex w-9 flex-shrink-0 cursor-pointer items-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-light)]"
            style={{ height: '28px' }}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full shadow transition-all ${isClan ? "translate-x-[1.15rem] bg-emerald-500" : "translate-x-1 bg-[var(--accent-mid)]"}`}
            />
        </button>
    );
};

export default SearchModeToggle;
