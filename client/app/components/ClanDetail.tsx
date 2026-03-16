import React from 'react';
import dynamic from 'next/dynamic';
import DeferredSection from './DeferredSection';
import { resilientDynamicImport } from './resilientDynamicImport';
import { useClanMembers } from './useClanMembers';

interface ClanDetailProps {
    clan: {
        clan_id: number;
        name: string;
        tag: string;
        members_count: number;
    };
    onBack: () => void;
    onSelectMember: (memberName: string) => void;
}

const LoadingPanel: React.FC<{ label: string; minHeight?: number }> = ({ label, minHeight = 220 }) => (
    <div
        className="flex animate-pulse items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-sm text-gray-500"
        style={{ minHeight }}
    >
        {label}
    </div>
);

const ClanSVG = dynamic(() => resilientDynamicImport(() => import('./ClanSVG'), 'ClanDetail-ClanSVG'), {
    ssr: false,
    loading: () => <LoadingPanel label="Loading clan chart..." minHeight={440} />,
});

const ClanBattleSeasons = dynamic(() => resilientDynamicImport(() => import('./ClanBattleSeasons'), 'ClanDetail-ClanBattleSeasons'), {
    ssr: false,
    loading: () => <LoadingPanel label="Loading clan battle seasons..." minHeight={240} />,
});

const ClanMembers = dynamic(() => resilientDynamicImport(() => import('./ClanMembers'), 'ClanDetail-ClanMembers'), {
    ssr: false,
    loading: () => <LoadingPanel label="Loading clan members..." minHeight={96} />,
});

const ClanDetail: React.FC<ClanDetailProps> = ({ clan, onBack, onSelectMember }) => {
    const { members, loading: membersLoading, error: membersError } = useClanMembers(clan.clan_id);

    return (
        <div className="bg-white p-6">
            <div className="mb-3 pb-3">
                <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
                    [{clan.tag}] {clan.name}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                    {clan.members_count} members
                </p>
            </div>

            <div className="mt-4">
                <ClanSVG clanId={clan.clan_id} onSelectMember={onSelectMember} svgWidth={900} svgHeight={440} membersData={members} />
            </div>

            <DeferredSection
                className="mt-8"
                minHeight={240}
                placeholder={<LoadingPanel label="Preparing clan battle seasons..." minHeight={240} />}
            >
                <div>
                    <ClanBattleSeasons clanId={clan.clan_id} memberCount={clan.members_count} />
                </div>
            </DeferredSection>

            <DeferredSection
                className="mt-6 border-t border-gray-100 pt-4"
                minHeight={96}
                placeholder={<LoadingPanel label="Preparing clan members..." minHeight={96} />}
            >
                <div>
                    <ClanMembers members={members} loading={membersLoading} error={membersError} onSelectMember={onSelectMember} />
                </div>
            </DeferredSection>

            <button
                onClick={onBack}
                className="mt-5 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
                Back
            </button>
        </div>
    );
};

export default ClanDetail;
