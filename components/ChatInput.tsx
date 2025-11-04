import React from 'react';
import { ConnectionStatus } from '../types';

interface ChatControlsProps {
  onToggleConnection: () => void;
  connectionStatus: ConnectionStatus;
  onSendText: (text: string) => void;
  textInput: string;
  onTextInputChange: (text: string) => void;
}

const MicIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/>
    </svg>
);

const StopIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M6 6h12v12H6z"/>
    </svg>
);

const SendIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
    </svg>
);


export const ChatControls: React.FC<ChatControlsProps> = ({ 
    onToggleConnection, 
    connectionStatus,
    onSendText,
    textInput,
    onTextInputChange
}) => {
    
    const getButtonContent = () => {
        switch (connectionStatus) {
            case ConnectionStatus.CONNECTING:
                return <div className="w-8 h-8 border-4 border-white/50 border-t-white rounded-full animate-spin"></div>;
            case ConnectionStatus.CONNECTED:
                return <StopIcon className="w-8 h-8 text-white"/>;
            case ConnectionStatus.IDLE:
            case ConnectionStatus.ERROR:
            default:
                return <MicIcon className="w-8 h-8 text-white"/>;
        }
    }

    const getMicButtonClass = () => {
        switch (connectionStatus) {
            case ConnectionStatus.CONNECTED:
                return 'bg-red-600 hover:bg-red-500 animate-pulse';
            case ConnectionStatus.CONNECTING:
                 return 'bg-slate-600 cursor-not-allowed';
            case ConnectionStatus.ERROR:
                return 'bg-red-800 hover:bg-red-700';
            default:
                return 'bg-blue-600 hover:bg-blue-500';
        }
    }

    const handleTextSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSendText(textInput);
    }

  return (
    <div className="bg-slate-800 p-4 border-t border-slate-700">
      <div className="max-w-4xl mx-auto flex justify-center items-center gap-4">
        <form onSubmit={handleTextSubmit} className="flex-grow flex items-center gap-2">
            <input 
                type="text"
                value={textInput}
                onChange={(e) => onTextInputChange(e.target.value)}
                placeholder={connectionStatus === ConnectionStatus.CONNECTED ? "Type your message in French..." : "Press the mic to start..."}
                disabled={connectionStatus !== ConnectionStatus.CONNECTED}
                className="w-full bg-slate-700 rounded-full px-5 py-3 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none transition disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
                type="submit"
                disabled={connectionStatus !== ConnectionStatus.CONNECTED || !textInput.trim()}
                className="p-3 rounded-full bg-blue-600 hover:bg-blue-500 transition-all duration-300 shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-500/50 disabled:bg-slate-600 disabled:cursor-not-allowed"
                aria-label="Send message"
            >
                <SendIcon className="w-6 h-6 text-white"/>
            </button>
        </form>
        <button
          onClick={onToggleConnection}
          disabled={connectionStatus === ConnectionStatus.CONNECTING}
          className={`flex-shrink-0 w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-500/50 ${getMicButtonClass()}`}
          aria-label={connectionStatus === ConnectionStatus.CONNECTED ? 'Stop session' : 'Start session'}
        >
          {getButtonContent()}
        </button>
      </div>
    </div>
  );
};