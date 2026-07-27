export interface TierTypeTile {
    x_index: number;
    y_index: number;
    count: number;
}

export interface TierTypeTrendPoint {
    x_index: number;
    avg_tier: number;
    count: number;
}

export interface TierTypePlayerCell {
    ship_type: string;
    ship_tier: number;
    pvp_battles: number;
    wins: number;
    win_ratio: number;
}

export interface TierTypePayload {
    metric: 'tier_type';
    label: string;
    x_label: string;
    y_label: string;
    tracked_population: number;
    x_labels: string[];
    y_values: number[];
    tiles: TierTypeTile[];
    trend: TierTypeTrendPoint[];
    player_cells: TierTypePlayerCell[];
}
