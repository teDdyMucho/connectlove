import React from 'react';

interface PopupProps {
  message: string;
  buttonText: string;
  onButtonClick: () => void;
  isOpen: boolean;
}

const Popup: React.FC<PopupProps> = ({ message, buttonText, onButtonClick, isOpen }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4 animate-fade-in">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">{message}</h3>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onButtonClick(); }}
            className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary-dark transition-colors"
          >
            {buttonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Popup;
