import React from 'react';
import PopulationDistributionSVG from './PopulationDistributionSVG';

interface BattlesDistributionSVGProps {
    playerBattles: number;
    svgWidth?: number;
    svgHeight?: number;
}

const BattlesDistributionSVG: React.FC<BattlesDistributionSVGProps> = ({
    playerBattles,
    svgWidth = 600,
    svgHeight = 184,
}) => {
    return (
        <PopulationDistributionSVG
            primaryMetric="battles_played"
            primaryValue={playerBattles}
            svgWidth={svgWidth}
            svgHeight={svgHeight}
        />
    );
};

export default BattlesDistributionSVG;