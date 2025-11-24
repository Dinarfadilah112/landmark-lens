import { Injectable } from '@angular/core';
// FIX: Corrected the import path for GoogleGenAI from '@google/ai' to '@google/genai'.
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

export interface LandmarkInfo {
  name: string;
  history: string;
  sources: { title: string; uri: string }[];
}

export interface DirectionsInfo {
  directions: string;
  mapUrl: string;
}

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error('API_KEY environment variable not set');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  async getLandmarkInfo(imageBase64: string, mimeType: string, lang: 'en' | 'id'): Promise<LandmarkInfo> {
    try {
      const imagePart = {
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      };
      
      const prompt = lang === 'id'
        ? `Identifikasi nama landmark dalam gambar ini dan berikan ringkasan sejarahnya. Format respons Anda secara tepat sebagai berikut, tanpa teks tambahan:
NAME: [Nama landmark yang diidentifikasi]
HISTORY: [Ringkasan sejarah landmark]`
        : `Identify the name of the landmark in this image and provide a historical summary. Format your response exactly as follows, with no additional text:
NAME: [The identified name of the landmark]
HISTORY: [A historical summary of the landmark]`;

      const textPart = { text: prompt };

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const responseText = response.text;
      
      const nameMatch = responseText.match(/^NAME:\s*(.*)$/m);
      const historyMatch = responseText.match(/^HISTORY:\s*(.*)$/ms);

      if (!nameMatch || !historyMatch) {
        throw new Error('Could not parse the landmark information from the response.');
      }

      const name = nameMatch[1].trim();
      const history = historyMatch[1].trim();

      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = groundingChunks
        .map((chunk: any) => chunk.web)
        .filter((web: any) => web && web.uri && web.title)
        .reduce((acc: any[], current: any) => {
            if (!acc.find(item => item.uri === current.uri)) {
                acc.push(current);
            }
            return acc;
        }, []);

      return { name, history, sources };

    } catch (error) {
      console.error('Error getting landmark info:', error);
      throw new Error('Failed to get information for the landmark in the image.');
    }
  }

  async getDirections(
    destination: string,
    origin: string,
    lang: 'en' | 'id'
  ): Promise<DirectionsInfo> {
    try {
      const prompt =
        lang === 'id'
          ? `Berikan petunjuk arah mengemudi yang detail, belokan demi belokan dari ${origin} ke ${destination}. Di akhir, berikan URL Google Maps untuk rute tersebut. Format respons Anda secara tepat sebagai berikut:
DIRECTIONS:
[Daftar arah bernomor]

MAP_URL: [URL Google Maps]`
          : `Provide detailed, turn-by-turn driving directions from ${origin} to ${destination}. At the end, provide a Google Maps URL for the route. Format your response exactly as follows:
DIRECTIONS:
[Numbered list of directions]

MAP_URL: [The Google Maps URL]`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const responseText = response.text;
      
      const directionsMatch = responseText.match(/^DIRECTIONS:\s*(.*)$/ms);
      const mapUrlMatch = responseText.match(/^MAP_URL:\s*(.*)$/m);

      if (!directionsMatch || !mapUrlMatch) {
        throw new Error('Could not parse the directions from the response.');
      }
      
      return {
        directions: directionsMatch[1].trim(),
        mapUrl: mapUrlMatch[1].trim()
      };

    } catch (error) {
      console.error('Error fetching directions:', error);
      throw new Error('Failed to generate directions.');
    }
  }
}
