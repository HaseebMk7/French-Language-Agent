import React, { useState, useEffect, useRef } from 'react';
import { Chat, Content } from "@google/genai";
import { Message, Role } from './types';
import { createChat, textToSpeech } from './services/geminiService';
import { ChatMessage } from './components/ChatMessage';
import { ChatControls } from './components/ChatInput';

// Add type definitions for SpeechRecognition to fix compilation error.
// The Web Speech API types are not included in standard TypeScript DOM libraries.
interface SpeechRecognitionErrorEvent {
  readonly error: string;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognition {
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  onstart: () => void;
  onend: () => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  stop: () => void;
  start: () => void;
}

// Audio Decoding Helpers
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
        const savedMessages = localStorage.getItem('french-chat-history');
        if (savedMessages) {
            const parsedMessages = JSON.parse(savedMessages);
            if (Array.isArray(parsedMessages) && parsedMessages.length > 0) {
                return parsedMessages;
            }
        }
    } catch (error) {
        console.error("Failed to load messages from localStorage:", error);
    }
    return [
      {
          role: Role.MODEL, 
          french: "Bonjour ! Appuyez sur le micro ou tapez un message pour commencer à pratiquer votre français.",
          english: "Hello! Press the microphone or type a message to start practicing your French."
      }
    ];
  });
  const [textInput, setTextInput] = useState('');
  const [showTranslation, setShowTranslation] = useState<boolean>(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<Chat | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try {
        localStorage.setItem('french-chat-history', JSON.stringify(messages));
    } catch (error) {
        console.error("Failed to save messages to localStorage:", error);
    }
  }, [messages]);

  useEffect(() => {
    // Initialize chat with history from loaded messages
    const history: Content[] = messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.french }]
    }));
    
    // Don't pass history if it's just the initial default message
    const defaultMessageText = "Bonjour ! Appuyez sur le micro ou tapez un message pour commencer à pratiquer votre français.";
    const isOnlyDefaultMessage = messages.length === 1 && messages[0].french === defaultMessageText;
    
    chatRef.current = createChat(isOnlyDefaultMessage ? undefined : history);

    audioContextRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition: SpeechRecognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'fr-FR';
      recognition.interimResults = true;

      recognition.onstart = () => setIsRecording(true);
      recognition.onend = () => setIsRecording(false);
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        setTextInput(interimTranscript);

        if (finalTranscript) {
          setTextInput('');
          handleSendMessage(finalTranscript);
        }
      };
      recognitionRef.current = recognition;
    } else {
      console.warn("Speech Recognition not supported by this browser.");
    }
  }, []);
  
  const handleToggleMic = () => {
    if (!recognitionRef.current) return;
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  const handleSendText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isResponding || isRecording) return;
    handleSendMessage(trimmed);
    setTextInput('');
  };

  const handleSendMessage = async (text: string) => {
    setIsResponding(true);

    const userMessage: Message = { role: Role.USER, french: text };
    setMessages(prev => [...prev, userMessage]);

    try {
      if (!chatRef.current) throw new Error("Chat not initialized");

      const responseStream = await chatRef.current.sendMessageStream({ message: text });
      
      let fullResponseText = "";
      let frenchPart = "";
      let englishPart = "";

      setMessages(prev => [...prev, {role: Role.MODEL, french: '...'}]);

      for await (const chunk of responseStream) {
        fullResponseText += chunk.text;
        
        const frenchMatch = fullResponseText.match(/\[FR\](.*?)(?=\[EN\]|$)/s);
        const englishMatch = fullResponseText.match(/\[EN\](.*?)$/s);
        
        frenchPart = frenchMatch ? frenchMatch[1].trim() : fullResponseText.replace('[FR]','').trim();
        englishPart = englishMatch ? englishMatch[1].trim() : "";
        
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = { role: Role.MODEL, french: frenchPart, english: englishPart };
          return newMessages;
        });
      }

      if (frenchPart) {
        const base64Audio = await textToSpeech(frenchPart);
        if (base64Audio && audioContextRef.current) {
          try {
            const audioData = decode(base64Audio);
            const buffer = await decodeAudioData(audioData, audioContextRef.current, 24000, 1);
            const source = audioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContextRef.current.destination);
            source.start(0);
          } catch(e) {
             console.error("Failed to decode or play audio", e);
          }
        }
      }

    } catch (error) {
      console.error("Error sending message:", error);
      setMessages(prev => [...prev, {
        role: Role.MODEL, 
        french: "Désolé, une erreur est survenue. Veuillez réessayer.",
        english: "Sorry, an error occurred. Please try again."
      }]);
    } finally {
      setIsResponding(false);
    }
  };


  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white font-sans">
      <header className="relative bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 p-4 text-center sticky top-0 z-10">
        <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold">
                <span role="img" aria-label="France flag">🇫🇷</span> Votre Instructeur de Français <span role="img" aria-label="France flag">🇫🇷</span>
            </h1>
            <p className="text-slate-400">avec Professor Haseeb</p>
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 right-4 flex items-center gap-3">
            <span className="text-sm text-slate-300 hidden sm:inline">Show Translation</span>
            <label htmlFor="translation-toggle" className="relative inline-flex items-center cursor-pointer">
                <input 
                    type="checkbox" 
                    id="translation-toggle" 
                    className="sr-only peer"
                    checked={showTranslation}
                    onChange={() => setShowTranslation(prev => !prev)}
                />
                <div className="w-11 h-6 bg-slate-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-blue-500/50 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
        </div>
      </header>
      <main ref={chatContainerRef} className="flex-grow p-4 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {messages.map((msg, index) => (
            <ChatMessage key={index} message={msg} showTranslation={showTranslation} />
          ))}
           {isResponding && messages[messages.length - 1]?.role !== Role.MODEL && (
             <ChatMessage message={{role: Role.MODEL, french: "..."}} showTranslation={false}/>
           )}
        </div>
      </main>
      <footer className="sticky bottom-0">
        <ChatControls 
            onToggleMic={handleToggleMic} 
            isRecording={isRecording}
            isResponding={isResponding}
            onSendText={handleSendText}
            textInput={textInput}
            onTextInputChange={setTextInput}
        />
      </footer>
    </div>
  );
};

export default App;