import React from 'react';
import { render, screen } from '@testing-library/react';
import ClanDetail from '../ClanDetail';

const mockUseClanMembers = jest.fn();

jest.mock('next/dynamic', () => {
    return () => function MockDynamicComponent(props: {
        clanId?: number;
        memberCount?: number;
        members?: unknown[];
        svgWidth?: number;
    }) {
        if (typeof props.memberCount === 'number') {
            return <div data-testid="clan-battle-seasons" />;
        }

        if (Array.isArray(props.members)) {
            return <div data-testid="clan-members" />;
        }

        if (typeof props.svgWidth === 'number') {
            return <div data-testid="clan-svg" />;
        }

        return null;
    };
});

jest.mock('../DeferredSection', () => {
    return function MockDeferredSection({ children }: { children: React.ReactNode }) {
        return <>{children}</>;
    };
});

jest.mock('../useClanMembers', () => ({
    useClanMembers: (...args: unknown[]) => mockUseClanMembers(...args),
}));

describe('ClanDetail clan roster hydration wiring', () => {
    beforeEach(() => {
        mockUseClanMembers.mockReturnValue({ members: [], loading: false, error: '' });
    });

    afterEach(() => {
        mockUseClanMembers.mockClear();
    });

    it('loads clan members through the shared hook using the clan id', () => {
        render(
            <ClanDetail
                clan={{
                    clan_id: 5555,
                    name: 'Fixture Clan',
                    tag: 'FX',
                    members_count: 12,
                }}
                onBack={() => undefined}
                onSelectMember={() => undefined}
            />,
        );

        expect(mockUseClanMembers).toHaveBeenCalledWith(5555);
    });

    it('renders the clan members list before the clan battle seasons section', () => {
        render(
            <ClanDetail
                clan={{
                    clan_id: 5555,
                    name: 'Fixture Clan',
                    tag: 'FX',
                    members_count: 12,
                }}
                onBack={() => undefined}
                onSelectMember={() => undefined}
            />,
        );

        const clanMembers = screen.getByTestId('clan-members');
        const clanBattleSeasons = screen.getByTestId('clan-battle-seasons');

        expect(clanMembers.compareDocumentPosition(clanBattleSeasons) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});