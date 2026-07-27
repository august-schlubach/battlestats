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
    x_labels: string[];
    y_values: number[];
    player_cells: TierTypePlayerCell[];
}
