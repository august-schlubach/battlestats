"use client";

import React from 'react';
import PlayerSearch from './components/PlayerSearch';

const Page: React.FC = () => {

  const containerStyle: React.CSSProperties = {
    maxWidth: '600px',
    margin: '0 auto',
    textAlign: 'center',
    color: 'black',
  };

  const pageStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: 'white',
  };

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <PlayerSearch />
      </div>
    </div>
  );
};

export default Page;
