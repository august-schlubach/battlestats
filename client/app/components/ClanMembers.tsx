import React, { useEffect, useState } from 'react';

interface ClanMembersProps {
    clanId: number;
    onSelectMember: (memberName: string) => void;
}

const ClanMembers: React.FC<ClanMembersProps> = ({ clanId, onSelectMember }) => {
    const [members, setMembers] = useState<{ name: string; is_hidden: boolean }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMembers = async () => {
            setLoading(true);
            try {
                const response = await fetch(`http://localhost:8888/api/fetch/clan_members/${clanId}/`);
                const data = await response.json();
                setMembers(data);
            } catch (error) {
                console.error('Error fetching clan members:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchMembers();
    }, [clanId]);

    return (
        <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">Clan Members</h3>
            {loading && <p className="text-sm text-gray-500">Syncing clan members...</p>}
            {!loading && members.length === 0 && <p className="text-sm text-gray-500">No clan members found.</p>}
            {!loading && members.length > 0 && (
                <p className="mt-2 text-sm leading-7 text-gray-700">
                    {members.map((member, index) => (
                        <React.Fragment key={member.name}>
                            {member.is_hidden ? (
                                <span
                                    className="font-medium text-gray-500"
                                    title="Player profile is hidden"
                                >
                                    {member.name}
                                </span>
                            ) : (
                                <button
                                    onClick={() => onSelectMember(member.name)}
                                    className="font-medium text-gray-900 underline-offset-2 hover:underline"
                                    aria-label={`Show player ${member.name}`}
                                >
                                    {member.name}
                                </button>
                            )}
                            {index < members.length - 1 && <span className="mx-2 text-gray-400">•</span>}
                        </React.Fragment>
                    ))}
                </p>
            )}
        </div>
    );
};

export default ClanMembers;
