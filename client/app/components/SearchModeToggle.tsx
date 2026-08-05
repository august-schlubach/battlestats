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
            // 41px, 5px wider than the original w-9 (36px). The knob's clan-side
            // offset below moves by the same 5px so the "on" state stays flush
            // right — widening the track alone would strand the knob mid-way.
            className="relative flex w-[41px] flex-shrink-0 cursor-pointer items-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-light)]"
            style={{ height: '28px' }}
        >
            <span
                // Clan offset was 1.15rem (18.4px) against a 36px track; +5px to
                // match the widened track keeps the same right-hand gap.
                className={`inline-block h-4 w-4 transform rounded-full shadow transition-all ${isClan ? "translate-x-[23.4px] bg-emerald-500" : "translate-x-1 bg-[var(--accent-mid)]"}`}
            />
        </button>
    );
};

export default SearchModeToggle;
