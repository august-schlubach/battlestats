"use client";

import React from 'react';
import PlayerSearch from './components/PlayerSearch';

const Page: React.FC = () => {
  return (
    <div className="w-full bg-white">
      <div className="mx-auto w-full max-w-5xl text-black">
        <PlayerSearch />
      </div>
    </div>
  );
};

export default Page;
