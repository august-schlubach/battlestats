import React from 'react';
import PopulationDistributionSVG from './PopulationDistributionSVG';

interface WRDistributionDesign1Props {
    playerWR: number;
    playerSurvivalRate?: number | null;
    svgWidth?: number;
    svgHeight?: number;
}

const WRDistributionDesign1SVG: React.FC<WRDistributionDesign1Props> = ({
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

export default WRDistributionDesign1SVG;