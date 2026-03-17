from __future__ import annotations

from typing import Optional


ACHIEVEMENT_CATALOG: dict[str, dict[str, object]] = {
    "PCH001_DoubleKill": {
        "code": "PCH001_DoubleKill",
        "slug": "double-strike",
        "label": "Double Strike",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "WG code name DoubleKill maps to the public-facing Double Strike label.",
    },
    "PCH003_MainCaliber": {
        "code": "PCH003_MainCaliber",
        "slug": "main-caliber",
        "label": "Main Caliber",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "",
    },
    "PCH004_Dreadnought": {
        "code": "PCH004_Dreadnought",
        "slug": "dreadnought",
        "label": "Dreadnought",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "",
    },
    "PCH005_Support": {
        "code": "PCH005_Support",
        "slug": "support",
        "label": "Support",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "",
    },
    "PCH006_Withering": {
        "code": "PCH006_Withering",
        "slug": "witherer",
        "label": "Witherer",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "WG code name Withering maps to the public-facing Witherer label.",
    },
    "PCH011_InstantKill": {
        "code": "PCH011_InstantKill",
        "slug": "devastating-strike",
        "label": "Devastating Strike",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "WG code name InstantKill maps to the public-facing Devastating Strike label.",
    },
    "PCH012_Arsonist": {
        "code": "PCH012_Arsonist",
        "slug": "arsonist",
        "label": "Arsonist",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "",
    },
    "PCH013_Liquidator": {
        "code": "PCH013_Liquidator",
        "slug": "liquidator",
        "label": "Liquidator",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "",
    },
    "PCH014_Headbutt": {
        "code": "PCH014_Headbutt",
        "slug": "die-hard",
        "label": "Die-Hard",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "WG code name Headbutt maps to the public-facing Die-Hard label.",
    },
    "PCH016_FirstBlood": {
        "code": "PCH016_FirstBlood",
        "slug": "first-blood",
        "label": "First Blood",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "",
    },
    "PCH017_Fireproof": {
        "code": "PCH017_Fireproof",
        "slug": "fireproof",
        "label": "Fireproof",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "",
    },
    "PCH018_Unsinkable": {
        "code": "PCH018_Unsinkable",
        "slug": "unsinkable",
        "label": "Unsinkable",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "",
    },
    "PCH019_Detonated": {
        "code": "PCH019_Detonated",
        "slug": "detonation",
        "label": "Detonation",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "WG code name Detonated maps to the public-facing Detonation label.",
    },
    "PCH020_ATBACaliber": {
        "code": "PCH020_ATBACaliber",
        "slug": "secondary-battery-expert",
        "label": "Secondary Battery Expert",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "WG code name ATBACaliber maps to the public-facing Secondary Battery Expert label.",
    },
    "PCH023_Warrior": {
        "code": "PCH023_Warrior",
        "slug": "kraken-unleashed",
        "label": "Kraken Unleashed",
        "category": "combat",
        "kind": "combat",
        "enabled_for_player_surface": True,
        "notes": "Battlestats intentionally maps Warrior to Kraken Unleashed for the player-surface combat award lane.",
    },
    "PCH070_Campaign1Completed": {
        "code": "PCH070_Campaign1Completed",
        "slug": "campaign-1-completed",
        "label": "Campaign 1 Completed",
        "category": "campaign",
        "kind": "campaign",
        "enabled_for_player_surface": False,
        "notes": "Stored raw only.",
    },
    "PCH087_FillAlbum": {
        "code": "PCH087_FillAlbum",
        "slug": "fill-album",
        "label": "Fill Album",
        "category": "album",
        "kind": "album",
        "enabled_for_player_surface": False,
        "notes": "Stored raw only.",
    },
    "PCH097_PVE_HON_WIN_ALL_DONE": {
        "code": "PCH097_PVE_HON_WIN_ALL_DONE",
        "slug": "honorable-service-pve-complete",
        "label": "Honorable Service PvE Complete",
        "category": "pve",
        "kind": "pve",
        "enabled_for_player_surface": False,
        "notes": "Stored raw only.",
    },
}

PLAYER_SURFACE_ACHIEVEMENT_CODES = frozenset(
    code
    for code, entry in ACHIEVEMENT_CATALOG.items()
    if entry.get("enabled_for_player_surface")
)


def get_achievement_catalog_entry(code: str) -> Optional[dict[str, object]]:
    return ACHIEVEMENT_CATALOG.get(code)


def get_player_surface_achievement_catalog() -> dict[str, dict[str, object]]:
    return {
        code: ACHIEVEMENT_CATALOG[code]
        for code in PLAYER_SURFACE_ACHIEVEMENT_CODES
    }
