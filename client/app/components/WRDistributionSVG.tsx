import React from 'react';
import PopulationDistributionSVG from './PopulationDistributionSVG';

interface WRDistributionProps {
    playerWR: number;
    playerSurvivalRate?: number | null;
    svgWidth?: number;
    svgHeight?: number;
}
const WRDistributionSVG: React.FC<WRDistributionProps> = ({
    playerWR,
    playerSurvivalRate = null,
    svgWidth = 600,
    svgHeight = 184,
}) => {
    return (
        <PopulationDistributionSVG
            primaryMetric="win_rate"
            primaryValue={playerWR}
            overlayMetric="survival_rate"
            overlayValue={playerSurvivalRate}
            svgWidth={svgWidth}
            svgHeight={svgHeight}
        />
    );
};

export default WRDistributionSVG;
