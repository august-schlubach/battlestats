import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const ClanMembers = ({ clanId }: { clanId: number }) => {
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

    // Create a single string of member names separated by " | "
    const memberNames = members.map(member => member.name).join(' | ');

    return (
        <div>
            <h1>Clan Members</h1>
            <p className="text-sm">{memberNames}</p>
        </div>
    );
};

export default ClanMembers;
