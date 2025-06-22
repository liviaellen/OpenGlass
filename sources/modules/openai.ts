import axios from "axios";
import * as fs from "fs";
import { keys } from "../keys";

export async function transcribeAudio(audioPath: string) {
    const audioBase64 = fs.readFileSync(audioPath, { encoding: 'base64' });
    try {
        const response = await axios.post("https://api.openai.com/v1/audio/transcriptions", {
            audio: audioBase64,
        }, {
            headers: {
                'Authorization': `Bearer ${keys.openai}`,  // Replace YOUR_API_KEY with your actual OpenAI API key
                'Content-Type': 'application/json'
            },
        });
        return response.data;
    } catch (error) {
        console.error("Error in transcribeAudio:", error);
        return null; // or handle error differently
    }
}

let audioContext: AudioContext;

export async function startAudio() {
    audioContext = new AudioContext();
}

export async function textToSpeech(text: string) {
    try {
        const response = await axios.post("https://api.openai.com/v1/audio/speech", {
            input: text,    // Use 'input' instead of 'text'
            voice: "nova",
            model: "tts-1",
        }, {
            headers: {
                'Authorization': `Bearer ${keys.openai}`,  // Replace YOUR_API_KEY with your actual OpenAI API key
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer'  // This will handle the binary data correctly
        });


        // Decode the audio data asynchronously
        const audioBuffer = await audioContext.decodeAudioData(response.data);

        // Create an audio source
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();  // Play the audio immediately

        return response.data;
    } catch (error) {
        console.error("Error in textToSpeech:", error);
        return null; // or handle error differently
    }
}

// Function to convert image to base64
function imageToBase64(path: string) {
    const image = fs.readFileSync(path, { encoding: 'base64' });
    return `data:image/jpeg;base64,${image}`; // Adjust the MIME type if necessary (e.g., image/png)
}

export async function describeImage(imagePath: string) {
    const imageBase64 = imageToBase64(imagePath);
    try {
        const response = await axios.post("https://api.openai.com/v1/images/descriptions", {
            image: imageBase64,
        }, {
            headers: {
                'Authorization': `Bearer ${keys.openai}`,  // Replace YOUR_API_KEY with your actual OpenAI API key
                'Content-Type': 'application/json'
            },
        });
        return response.data;
    } catch (error) {
        console.error("Error in describeImage:", error);
        return null; // or handle error differently
    }
}

// Convert Uint8Array to base64 string
function uint8ArrayToBase64(bytes: Uint8Array): string {
    const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    return btoa(binaryString);
}

// New function to analyze images using OpenAI's GPT-4 Vision
export async function analyzeImageWithVision(imageData: Uint8Array, prompt: string = "Describe what you see in this image in detail."): Promise<string> {
    try {
        console.log('🔍 OpenAI Vision: Analyzing image of', imageData.length, 'bytes');

        const base64Image = uint8ArrayToBase64(imageData);
        const dataUrl = `data:image/jpeg;base64,${base64Image}`;

        const response = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: prompt
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: dataUrl
                            }
                        }
                    ]
                }
            ],
            max_tokens: 1000
        }, {
            headers: {
                'Authorization': `Bearer ${keys.openai}`,
                'Content-Type': 'application/json'
            },
        });

        console.log('✅ OpenAI Vision: Response received');
        const content = response.data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('No content in OpenAI Vision response');
        }
        return content;
    } catch (error) {
        console.error("❌ Error in analyzeImageWithVision:", error);
        if (axios.isAxiosError(error)) {
            console.error("❌ OpenAI Vision API Error:", error.response?.data);
            if (error.response?.status === 401) {
                throw new Error('Invalid OpenAI API key. Please check your .env file.');
            } else if (error.response?.status === 429) {
                throw new Error('OpenAI rate limit exceeded. Please try again later.');
            } else if (error.response?.status === 402) {
                throw new Error('OpenAI billing issue. Please check your account credits.');
            }
        }
        throw new Error('Failed to analyze image with OpenAI Vision. Please try again.');
    }
}

// New function to answer questions about multiple images using OpenAI's Vision
export async function answerQuestionWithImages(question: string, images: Uint8Array[]): Promise<string> {
    try {
        console.log('🔍 OpenAI Vision: Answering question with', images.length, 'images');

        const imageContents = images.map((imageData, index) => {
            const base64Image = uint8ArrayToBase64(imageData);
            const dataUrl = `data:image/jpeg;base64,${base64Image}`;
            return {
                type: "image_url" as const,
                image_url: {
                    url: dataUrl
                }
            };
        });

        const response = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "You are a helpful AI assistant that can see and analyze images. Answer questions based on what you observe in the provided images. Be concise and specific."
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: question
                        },
                        ...imageContents
                    ]
                }
            ],
            max_tokens: 1000
        }, {
            headers: {
                'Authorization': `Bearer ${keys.openai}`,
                'Content-Type': 'application/json'
            },
        });

        console.log('✅ OpenAI Vision: Response received');
        const content = response.data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('No content in OpenAI Vision response');
        }
        return content;
    } catch (error) {
        console.error("❌ Error in answerQuestionWithImages:", error);
        if (axios.isAxiosError(error)) {
            console.error("❌ OpenAI Vision API Error:", error.response?.data);
            if (error.response?.status === 401) {
                throw new Error('Invalid OpenAI API key. Please check your .env file.');
            } else if (error.response?.status === 429) {
                throw new Error('OpenAI rate limit exceeded. Please try again later.');
            } else if (error.response?.status === 402) {
                throw new Error('OpenAI billing issue. Please check your account credits.');
            }
        }
        throw new Error('Failed to answer question with OpenAI Vision. Please try again.');
    }
}

export async function gptRequest(systemPrompt: string, userPrompt: string) {
    try {
        console.log('🔗 OpenAI: Making request with key:', keys.openai ? 'Present' : 'Missing');
        const response = await axios.post("https://api.openai.com/v1/chat/completions", {
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
        }, {
            headers: {
                'Authorization': `Bearer ${keys.openai}`,
                'Content-Type': 'application/json'
            },
        });

        console.log('✅ OpenAI: Response received:', response.data);
        const content = response.data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('No content in OpenAI response');
        }
        return content;
    } catch (error) {
        console.error("❌ Error in gptRequest:", error);
        if (axios.isAxiosError(error)) {
            console.error("❌ OpenAI API Error:", error.response?.data);
            if (error.response?.status === 401) {
                throw new Error('Invalid OpenAI API key. Please check your .env file.');
            } else if (error.response?.status === 429) {
                throw new Error('OpenAI rate limit exceeded. Please try again later.');
            } else if (error.response?.status === 402) {
                throw new Error('OpenAI billing issue. Please check your account credits.');
            }
        }
        throw new Error('Failed to get response from OpenAI. Please try again.');
    }
}
