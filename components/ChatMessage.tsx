
import React from 'react';
import { Message, Role } from '../types';

interface ChatMessageProps {
  message: Message;
  showTranslation: boolean;
}

const UserIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-8 w-8 text-white bg-blue-500 rounded-full p-1"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

const ModelIcon: React.FC = () => (
    <div className="h-8 w-8 text-white bg-indigo-500 rounded-full p-1 flex items-center justify-center font-bold text-sm">
        PH
    </div>
);


export const ChatMessage: React.FC<ChatMessageProps> = ({ message, showTranslation }) => {
  const isUser = message.role === Role.USER;

  return (
    <div
      className={`flex items-start gap-4 my-4 ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {!isUser && <ModelIcon />}
      <div
        className={`max-w-md lg:max-w-2xl rounded-2xl p-4 text-white ${
          isUser
            ? 'bg-blue-600 rounded-br-none'
            : 'bg-slate-700 rounded-bl-none'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.french}</p>
        {message.english && showTranslation && (
            <>
                <hr className="my-2 border-slate-600/50" />
                <p className="whitespace-pre-wrap text-sm text-slate-300">{message.english}</p>
            </>
        )}
      </div>
       {isUser && <UserIcon />}
    </div>
  );
};