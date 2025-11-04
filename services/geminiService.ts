import { GoogleGenAI, Modality } from "@google/genai";

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

export const connectToLiveSession = (callbacks: {
  onopen: () => void;
  onmessage: (message: any) => void;
  onerror: (e: any) => void;
  onclose: (e: any) => void;
}) => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const sessionPromise = ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {
        speechRecognitionConfig: {
          hints: [
            // Greetings and Politeness
            "Bonjour", "Salut", "Bonsoir", "Au revoir", "Merci", "De rien", "S'il vous plaît",
            // Basic Questions
            "Comment ça va ?", "Comment t'appelles-tu ?", "Quel âge as-tu ?", "Où habites-tu ?", "Qu'est-ce que c'est ?",
            // Common Phrases
            "Je suis", "J'ai", "J'aime", "Je n'aime pas", "Je voudrais", "Je ne comprends pas", "Pouvez-vous répéter ?",
            // Numbers (examples)
            "un", "deux", "trois", "dix", "vingt",
            // Days of the week
            "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
            // Instructor's name
            "Professor Haseeb",
            // Common conversation topics for beginners
            "la météo", "la nourriture", "les passe-temps", "la famille", "le travail"
          ]
        }
      },
      outputAudioTranscription: {},
       speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
    },
  });

  return sessionPromise;
};

export const translateText = async (textToTranslate: string, targetLanguage: string = "English"): Promise<string> => {
  if (!process.env.API_KEY) {
    console.error("API_KEY environment variable not set for translation");
    return ""; // Return empty string on error
  }
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Translate the following text to ${targetLanguage}: "${textToTranslate}"`,
      config: {
        temperature: 0.2,
      }
    });
    return response.text.trim();
  } catch (error) {
    console.error("Translation failed:", error);
    return `Translation failed for: "${textToTranslate}"`;
  }
};