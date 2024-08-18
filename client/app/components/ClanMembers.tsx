import React, { useEffect, useState } from 'react';

interface ClanMembersProps {
    clanId: number;
    onSelectMember: (memberName: string) => void;
}

const ClanMembers: React.FC<ClanMembersProps> = ({ clanId, onSelectMember }) => {
    const [members, setMembers] = useState<{ name: string }[]>([]);

    useEffect(() => {
        const fetchMembers = async () => {
            try {
                const response = await fetch(`http://localhost:8888/api/fetch/clan_members/${clanId}/`);
                const data = await response.json();
                setMembers(data);
            } catch (error) {
                console.error('Error fetching clan members:', error);
            }
        };

        fetchMembers();
    }, [clanId]);

    return (
        <div>
            <h1>Clan Members</h1>
            <ul className="text-sm">
                {members.map((member, index) => (
                    <li key={index}>
                        <button
                            onClick={() => onSelectMember(member.name)}
                            className="text-blue-500 underline">
                            {member.name}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ClanMembers;
