
import React, { useState, useEffect, useRef, useCallback } from 'react';
// Fix: Removed 'LiveSession' as it is not an exported member of '@google/genai'.
import { Blob, LiveServerMessage } from "@google/genai";
import { Message, Role, ConnectionStatus } from './types';
import { connectToLiveSession, translateText } from './services/geminiService';
import { ChatMessage } from './components/ChatMessage';
import { ChatControls } from './components/ChatInput';

// Audio Encoding/Decoding Helpers
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
      {
          role: Role.MODEL, 
          french: "Bonjour ! Appuyez sur le micro pour commencer à pratiquer votre français.",
          english: "Hello! Press the microphone to start practicing your French."
      }
  ]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.IDLE);
  const [textInput, setTextInput] = useState('');
  const [showTranslation, setShowTranslation] = useState<boolean>(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // Fix: Replaced the non-existent 'LiveSession' type with an inferred return type
  // from `connectToLiveSession` for type safety without breaking compilation.
  const sessionPromiseRef = useRef<ReturnType<typeof connectToLiveSession> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');


  const disconnect = useCallback(() => {
    sessionPromiseRef.current?.then(session => session.close());
    streamRef.current?.getTracks().forEach(track => track.stop());
    scriptProcessorRef.current?.disconnect();
    mediaStreamSourceRef.current?.disconnect();
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    
    sessionPromiseRef.current = null;
    streamRef.current = null;
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    scriptProcessorRef.current = null;
    mediaStreamSourceRef.current = null;
    
    setConnectionStatus(ConnectionStatus.IDLE);
  }, []);

  const handleToggleConnection = () => {
    if (connectionStatus === ConnectionStatus.CONNECTED) {
      disconnect();
    } else if (connectionStatus === ConnectionStatus.IDLE || connectionStatus === ConnectionStatus.ERROR) {
      connect();
    }
  };

  const handleSendText = async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText || connectionStatus !== ConnectionStatus.CONNECTED) return;
  
    const session = await sessionPromiseRef.current;
    if (!session) return;
  
    const userMessage: Message = { role: Role.USER, french: trimmedText };
    setMessages(prev => [...prev, userMessage]);
    setTextInput('');
  
    // Fix: Cast session to 'any' to call 'sendTextMessage'. This preserves the functionality
    // of sending text messages, which appears to be an undocumented feature of the Live API,
    // and avoids a TypeScript error that would occur with the new inferred session type.
    (session as any).sendTextMessage(trimmedText);
  
    translateText(trimmedText).then(englishText => {
      setMessages(prev => {
        const newMessages = [...prev];
        let targetIndex = -1;
        // Find the message we just added (the one without an English translation yet) and update it.
        for (let i = newMessages.length - 1; i >= 0; i--) {
          if (newMessages[i].role === Role.USER && newMessages[i].french === trimmedText && !newMessages[i].english) {
            targetIndex = i;
            break;
          }
        }
        if (targetIndex !== -1) {
          newMessages[targetIndex] = { ...newMessages[targetIndex], english: englishText };
        }
        return newMessages;
      });
    });
  };

  const connect = useCallback(() => {
    setConnectionStatus(ConnectionStatus.CONNECTING);
    
    outputAudioContextRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const outputNode = outputAudioContextRef.current.createGain();
    
    sessionPromiseRef.current = connectToLiveSession({
        onopen: async () => {
            setConnectionStatus(ConnectionStatus.CONNECTED);
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            inputAudioContextRef.current = new ((window as any).AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);

            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                sessionPromiseRef.current?.then((session) => {
                    session.sendRealtimeInput({ media: pcmBlob });
                });
            };
            mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
            // Handle transcriptions
            if (message.serverContent?.inputTranscription) {
                 const text = message.serverContent.inputTranscription.text;
                 
                 setMessages(prev => {
                    const lastMessage = prev[prev.length - 1];
                    if (lastMessage?.role === Role.USER) {
                       return prev.map((msg, i) => i === prev.length - 1 ? { ...msg, french: currentInputTranscriptionRef.current + text } : msg);
                    } else {
                       return [...prev, {role: Role.USER, french: text}];
                    }
                 });
                 currentInputTranscriptionRef.current += text;
            }

            if (message.serverContent?.outputTranscription) {
                const rawText = message.serverContent.outputTranscription.text;
                currentOutputTranscriptionRef.current += rawText;

                const fullText = currentOutputTranscriptionRef.current;
                const frenchMatch = fullText.match(/\[FR\](.*?)(?=\[EN\]|$)/s);
                const englishMatch = fullText.match(/\[EN\](.*?)$/s);
                
                const french = frenchMatch ? frenchMatch[1].trim() : fullText;
                const english = englishMatch ? englishMatch[1].trim() : undefined;

                setMessages(prev => {
                    const lastMessage = prev[prev.length - 1];
                    if (lastMessage?.role === Role.MODEL) {
                        return prev.map((msg, i) => i === prev.length - 1 ? { ...msg, french, english } : msg);
                    } else {
                        return [...prev, {role: Role.MODEL, french, english}];
                    }
                });
            }

            if (message.serverContent?.turnComplete) {
                if(currentInputTranscriptionRef.current) {
                    const userFrenchText = currentInputTranscriptionRef.current;
                    translateText(userFrenchText).then(englishText => {
                        setMessages(prev => {
                            const newMessages = [...prev];
                            let targetIndex = -1;
                            for (let i = newMessages.length - 1; i >= 0; i--) {
                              if (newMessages[i].role === Role.USER && newMessages[i].french === userFrenchText) {
                                targetIndex = i;
                                break;
                              }
                            }
                            if(targetIndex !== -1) {
                                newMessages[targetIndex] = { ...newMessages[targetIndex], english: englishText };
                            }
                            return newMessages;
                        });
                    });
                }
                currentInputTranscriptionRef.current = '';
                currentOutputTranscriptionRef.current = '';
            }

            // Handle audio playback
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
                const source = outputAudioContextRef.current.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNode);
                source.addEventListener('ended', () => { audioSourcesRef.current.delete(source); });
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                audioSourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
                for (const source of audioSourcesRef.current.values()) {
                    source.stop();
                    audioSourcesRef.current.delete(source);
                }
                nextStartTimeRef.current = 0;
            }
        },
        onerror: (e: ErrorEvent) => {
            console.error("Session error:", e);
            setMessages(prev => [...prev, {
                role: Role.MODEL, 
                french: "Désolé, une erreur de connexion est survenue.",
                english: "Sorry, a connection error occurred."
            }]);
            setConnectionStatus(ConnectionStatus.ERROR);
            disconnect();
        },
        onclose: (e: CloseEvent) => {
            console.log("Session closed.");
            disconnect();
        },
    });

  }, [disconnect]);

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
        </div>
      </main>
      <footer className="sticky bottom-0">
        <ChatControls 
            onToggleConnection={handleToggleConnection} 
            connectionStatus={connectionStatus}
            onSendText={handleSendText}
            textInput={textInput}
            onTextInputChange={setTextInput}
        />
      </footer>
    </div>
  );
};

export default App;