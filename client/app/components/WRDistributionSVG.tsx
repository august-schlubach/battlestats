import React from 'react';
import WRDistributionDesign1SVG from './WRDistributionDesign1SVG';
import WRDistributionDesign2SVG from './WRDistributionDesign2SVG';

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
    svgHeight = 248,
}) => {
    return (
        <WRDistributionDesign2SVG
            playerWR={playerWR}
            playerSurvivalRate={playerSurvivalRate}
            svgWidth={svgWidth}
            svgHeight={svgHeight}
        />
    );
};

export { WRDistributionDesign1SVG, WRDistributionDesign2SVG };
export default WRDistributionSVG;
