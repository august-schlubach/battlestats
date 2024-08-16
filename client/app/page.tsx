
"use client";

import React from 'react';
import PlayerSearch from './components/PlayerSearch';

const Page: React.FC = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="w-800 text-center text-black">
        <PlayerSearch />
      </div>
    </div>
  );
};

export default Page;