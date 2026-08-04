import React from 'react';
import { render } from '@testing-library/react';
import FlagImage from '../FlagImage';
import NationFlag from '../NationFlag';

describe('FlagImage', () => {
    it('renders a decorative img from /flags', () => {
        const { container } = render(<FlagImage file="kr.svg" title="Korea" />);
        const img = container.querySelector('img')!;
        expect(img).toHaveAttribute('src', '/flags/kr.svg');
        expect(img).toHaveAttribute('aria-hidden', 'true');
        expect(img).toHaveAttribute('title', 'Korea');
        expect(img.getAttribute('alt')).toBe('');
    });

    it('applies a position class when given', () => {
        const { container } = render(
            <FlagImage file="ussr.webp" title="USSR" positionClass="object-left-top" />,
        );
        expect(container.querySelector('img')!.className).toContain('object-left-top');
    });
});

describe('NationFlag after the extraction', () => {
    it('still renders a known nation', () => {
        const { container } = render(<NationFlag nation="japan" />);
        expect(container.querySelector('img')).toHaveAttribute('src', '/flags/japan.svg');
    });

    it('still renders nothing for an unknown nation', () => {
        const { container } = render(<NationFlag nation="atlantis" />);
        expect(container.querySelector('img')).toBeNull();
    });

    it('still anchors the USSR flag to its canton', () => {
        const { container } = render(<NationFlag nation="ussr" />);
        expect(container.querySelector('img')!.className).toContain('object-left-top');
    });
});
