// PWAInstallPopup.tsx
import React, { useState, useEffect } from 'react';

interface PWAInstallPopupProps {
  onClose: () => void;
}

const PWAInstallPopup: React.FC<PWAInstallPopupProps> = ({ onClose }) => {

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="bg-white p-4 rounded shadow-lg">
        <h1 className="text-lg font-semibold mb-2">Install Our PWA</h1>
        <p className="mb-4">Click "Install" to add this app to your home screen and enjoy a full-screen experience!</p>
        <button className="bg-gray-200 px-4 py-2 rounded" onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default PWAInstallPopup;
