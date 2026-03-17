import React from 'react';
import { render } from '@testing-library/react';
import ClanDetail from '../ClanDetail';

const mockUseClanMembers = jest.fn();

jest.mock('next/dynamic', () => {
    return () => function MockDynamicComponent() {
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
});