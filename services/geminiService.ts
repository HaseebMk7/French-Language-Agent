import { GoogleGenAI, Modality, Chat, Content } from "@google/genai";

const SYSTEM_INSTRUCTION = `You are a friendly and patient French instructor named 'Professor Haseeb'.
Your goal is to help the user practice and learn French through conversation.

**RESPONSE FORMATTING RULES:**
1.  You MUST format ALL your spoken responses as follows: \`[FR] Your French sentence. [EN] Your English translation.\`
2.  This format is mandatory for every single response, including greetings and corrections.

**INSTRUCTIONAL RULES:**
1.  If the user speaks or writes in French and makes a mistake, gently correct it in French. Then, provide the explanation for the correction in English. Your entire response must still follow the \`[FR]...[EN]...\` format.
2.  If the user speaks or writes in English, gently encourage them to try speaking in French. For example, you could say something like "[FR] Essayons en français. [EN] Let's try in French." You can answer their question briefly in English if necessary, but always steer the conversation back to French.
3.  Keep your responses concise and conversational.

Start the conversation with a warm welcome in French and its English translation, following the format rule.`;


export const createChat = (history?: Content[]): Chat => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const chat = ai.chats.create({
    model: 'gemini-2.5-flash',
    config: { systemInstruction: SYSTEM_INSTRUCTION },
    history: history,
  });
  return chat;
};


export const textToSpeech = async (text: string): Promise<string | null> => {
    if (!process.env.API_KEY) {
        console.error("API_KEY not set for TTS");
        return null;
    }
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: `Say with a friendly and encouraging tone: ${text}` }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        return base64Audio ?? null;
    } catch (error) {
        console.error("TTS generation failed:", error);
        return null;
    }
};