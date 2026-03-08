import React from 'react';
import ClanSVG from './ClanSVG';
import ClanMembers from './ClanMembers';

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

const ClanDetail: React.FC<ClanDetailProps> = ({ clan, onBack, onSelectMember }) => {
    return (
        <div className="bg-white p-6">
            <div className="mb-3 border-b border-gray-100 pb-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Clan</p>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
                    [{clan.tag}] {clan.name}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                    {clan.members_count} members
                </p>
            </div>

            <div className="mt-4">
                <ClanSVG clanId={clan.clan_id} onSelectMember={onSelectMember} svgWidth={900} svgHeight={400} />
            </div>

            <div className="mt-4 border-t border-gray-100 pt-4">
                <ClanMembers clanId={clan.clan_id} onSelectMember={onSelectMember} />
            </div>

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
