"use client";

import React from "react";

const Logo: React.FC = () => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("resetApp"));
  };

  return (
    <a
      href="/"
      onClick={handleClick}
      className="text-xl font-bold tracking-tight text-gray-900 hover:text-gray-600 transition-colors"
    >
      Battlestats
    </a>
  );
};

export default Logo;
