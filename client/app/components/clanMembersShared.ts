import type { RankedLeagueName } from './rankedLeague';

export type ActivityBucketKey = 'active_7d' | 'active_30d' | 'cooling_90d' | 'dormant_180d' | 'inactive_180d_plus' | 'unknown';

export interface ClanMemberData {
    name: string;
    is_hidden: boolean;
    pvp_ratio: number | null;
    days_since_last_battle: number | null;
    is_leader: boolean;
    is_pve_player: boolean;
    is_sleepy_player: boolean;
    is_ranked_player: boolean;
    is_clan_battle_player: boolean;
    clan_battle_win_rate: number | null;
    clan_battle_hydration_pending: boolean;
    highest_ranked_league: RankedLeagueName | null;
    ranked_hydration_pending: boolean;
    ranked_updated_at: string | null;
    activity_bucket: ActivityBucketKey;
}