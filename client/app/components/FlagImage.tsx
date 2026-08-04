import React from 'react';

interface FlagImageProps {
    // File name inside /public/flags, e.g. 'kr.svg'.
    file: string;
    // Hover tooltip for sighted users. The image itself is decorative.
    title: string;
    // object-position override for flags whose emblem sits off-centre.
    positionClass?: string;
    className?: string;
}

// A small flag. Decorative by construction: the adjacent text (ship name,
// language name) is the accessible content, so the image is aria-hidden and
// carries an empty alt. object-cover keeps every flag the same height — wide
// flags crop left/right rather than squish.
const FlagImage: React.FC<FlagImageProps> = ({ file, title, positionClass = '', className = '' }) => (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static flag SVG; next/image optimization is unnecessary here
    <img
        src={`/flags/${file}`}
        alt=""
        aria-hidden="true"
        title={title}
        width={16}
        height={12}
        loading="lazy"
        className={`inline-block h-3 w-4 shrink-0 rounded-[1px] object-cover ${positionClass} ring-1 ring-black/25 ${className}`.replace(/\s+/g, ' ').trim()}
    />
);

export default FlagImage;
