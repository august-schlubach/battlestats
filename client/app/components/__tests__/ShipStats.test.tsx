import React from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import ShipStats from '../ShipStats';
import { fetchSharedJson } from '../../lib/sharedJsonFetch';

jest.mock('../../lib/sharedJsonFetch', () => ({
    fetchSharedJson: jest.fn(),
}));

const mockFetch = fetchSharedJson as jest.MockedFunction<typeof fetchSharedJson>;

const payload = {
    ship_id: 3763141360,
    ship_name: 'Henri IV',
    ship_tier: 10,
    ship_type: 'Cruiser',
    window_days: 30,
    min_account_battles: 200,
    brackets: {
        all: { players: 1174, battles: 3872 },
        top50: { players: 587, battles: 2000 },
        top25: { players: 294, battles: 967 },
    },
    user_battles: 40,
    has_user_data: true,
    clusters: [
        {
            name: 'Outcomes',
            metrics: [
                { key: 'win_rate', label: 'Win rate', unit: '%', better: 'high',
                  user: 72.2, averages: { all: 49.4, top50: 55.1, top25: 58.5 } },
            ],
        },
        {
            name: 'Combat output',
            metrics: [
                { key: 'damage_pb', label: 'Damage', unit: '/battle', better: 'high',
                  user: 157393, averages: { all: 83580, top50: 100000, top25: 119277 } },
            ],
        },
        {
            name: 'Accuracy',
            metrics: [
                { key: 'secondary_hit_rate', label: 'Secondary hit %', unit: '%', better: 'high',
                  user: 9.9, averages: { all: 11.2, top50: 11.0, top25: 11.0 } },
            ],
        },
    ],
};

const renderPanel = () =>
    render(
        <ShipStats playerName="hachiminyan" realm="na" shipId={3763141360} shipName="Henri IV" onClose={jest.fn()} />,
    );

describe('ShipStats', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        // fetchSharedJson resolves to { data }
        mockFetch.mockResolvedValue({ data: payload } as never);
    });

    it('renders the comparison table with Average/Player/Delta columns', async () => {
        renderPanel();
        expect(await screen.findByText('Win rate')).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Average' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Player' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Delta' })).toBeInTheDocument();
        expect(screen.getByText('49.4%')).toBeInTheDocument();
        expect(screen.getByText('72.2%')).toBeInTheDocument();
        expect(screen.getByText('+46%')).toBeInTheDocument();
    });

    it('appends a /battle unit to the metric label and leaves the value cells bare', async () => {
        renderPanel();
        expect(await screen.findByText('Damage/battle')).toBeInTheDocument();
        // Value cells carry no "/battle" suffix.
        expect(screen.getByText('83,580')).toBeInTheDocument();
        expect(screen.getByText('157,393')).toBeInTheDocument();
        expect(screen.queryByText('157,393/battle')).not.toBeInTheDocument();
    });

    it('omits the Outcomes group header but keeps the other clusters', async () => {
        renderPanel();
        await screen.findByText('Win rate');
        expect(screen.queryByText('Outcomes')).not.toBeInTheDocument();
        expect(screen.getByText('Combat output')).toBeInTheDocument();
        // Accuracy is tagged "career" (player side is lifetime, not the 30d window).
        expect(screen.getByText('Accuracy', { exact: false })).toBeInTheDocument();
        expect(screen.getByText('· career')).toBeInTheDocument();
    });

    it('emphasizes the better reading per row, not the column', async () => {
        renderPanel();
        await screen.findByText('Win rate');
        // Win rate: player (72.2%) beats average (49.4%) → player emphasized.
        const winRow = screen.getByText('Win rate').closest('tr') as HTMLElement;
        expect(within(winRow).getByText('72.2%')).toHaveClass('font-semibold');
        expect(within(winRow).getByText('49.4%')).not.toHaveClass('font-semibold');
        // Secondary hit: player (9.9%) trails average (11.2%) → average emphasized.
        const secRow = screen.getByText('Secondary hit %').closest('tr') as HTMLElement;
        expect(within(secRow).getByText('11.2%')).toHaveClass('font-semibold');
        expect(within(secRow).getByText('9.9%')).not.toHaveClass('font-semibold');
    });

    it('switches the average column when the skill bracket changes', async () => {
        renderPanel();
        await screen.findByText('Win rate');
        expect(screen.getByText('49.4%')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Top 50%' }));
        await waitFor(() => expect(screen.getByText('55.1%')).toBeInTheDocument());
        expect(screen.queryByText('49.4%')).not.toBeInTheDocument();
    });

    // ── warming (population not yet computed) ────────────────────────────────
    // A pending payload carries NO clusters. Checked in the wrong order this
    // reads as "empty" and the panel confidently reports there is no data for a
    // ship that simply has not warmed yet. See ShipCombatPayload.pending.
    describe('while the population is warming', () => {
        const pendingPayload = {
            ...payload,
            brackets: {
                all: { players: 0, battles: 0 },
                top50: { players: 0, battles: 0 },
                top25: { players: 0, battles: 0 },
            },
            user_battles: 0,
            has_user_data: false,
            clusters: [],
            pending: true,
        };

        it('shows the warming notice, not the "not enough data" empty state', async () => {
            mockFetch.mockResolvedValue({ data: pendingPayload } as never);
            renderPanel();
            expect(
                await screen.findByText(/Building this ship.s population comparison/i),
            ).toBeInTheDocument();
            expect(
                screen.queryByText(/Not enough recent server data/i),
            ).not.toBeInTheDocument();
        });

        it('keeps the ship name visible so the header is not a bare id', async () => {
            mockFetch.mockResolvedValue({ data: pendingPayload } as never);
            renderPanel();
            await screen.findByText(/Building this ship.s population comparison/i);
            expect(screen.getByText('Henri IV')).toBeInTheDocument();
        });

        it('polls and renders the table once the warm lands', async () => {
            mockFetch
                .mockResolvedValueOnce({ data: pendingPayload } as never)
                .mockResolvedValue({ data: payload } as never);
            jest.useFakeTimers();
            try {
                renderPanel();
                // First response is pending → warming, no table yet.
                await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
                expect(screen.queryByText('Win rate')).not.toBeInTheDocument();
                jest.advanceTimersByTime(3000);
                await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
            } finally {
                jest.useRealTimers();
            }
            expect(await screen.findByText('Win rate')).toBeInTheDocument();
        });

        it('never renders the empty state after the poll budget is exhausted', async () => {
            // The warm runs on the `background` queue, which can be minutes deep;
            // timing out is expected, not exceptional. A still-pending payload
            // must NOT fall through to "not enough data" — that is the same lie
            // the pending branch exists to prevent, just deferred.
            mockFetch.mockResolvedValue({ data: pendingPayload } as never);
            jest.useFakeTimers();
            try {
                renderPanel();
                // 1 opening fetch + MAX_POLLS (20) polls.
                for (let i = 0; i < 21; i += 1) {
                    await waitFor(() =>
                        expect(mockFetch).toHaveBeenCalledTimes(i + 1));
                    jest.advanceTimersByTime(3000);
                }
            } finally {
                jest.useRealTimers();
            }
            await waitFor(() =>
                expect(screen.getByText(/Still building this ship.s comparison/i))
                    .toBeInTheDocument());
            expect(
                screen.queryByText(/Not enough recent server data/i),
            ).not.toBeInTheDocument();
            // And it stops polling rather than hammering forever.
            const settled = mockFetch.mock.calls.length;
            jest.useFakeTimers();
            jest.advanceTimersByTime(30000);
            jest.useRealTimers();
            expect(mockFetch).toHaveBeenCalledTimes(settled);
        });

        it('bypasses the settled cache when polling so the warm is observable', async () => {
            mockFetch
                .mockResolvedValueOnce({ data: pendingPayload } as never)
                .mockResolvedValue({ data: payload } as never);
            jest.useFakeTimers();
            try {
                renderPanel();
                await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
                jest.advanceTimersByTime(3000);
                await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
            } finally {
                jest.useRealTimers();
            }
            // Opening fetch keeps the panel TTL; the poll must use ttlMs 0, or it
            // would keep re-reading the cached pending stub forever.
            expect(mockFetch.mock.calls[0][1]).toEqual(
                expect.objectContaining({ ttlMs: expect.any(Number) }));
            expect((mockFetch.mock.calls[0][1] as { ttlMs: number }).ttlMs)
                .toBeGreaterThan(0);
            expect((mockFetch.mock.calls[1][1] as { ttlMs: number }).ttlMs).toBe(0);
        });
    });
});
