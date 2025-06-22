import * as React from 'react';
import { AsyncLock } from "../utils/lock";
import { answerQuestionWithImages } from "../modules/openai";
import { startAudio } from '../modules/openai';
import { ollamaInference } from "../modules/ollama";
import { groqRequest } from "../modules/groq-llama3";
import { keys } from "../keys";

export type AIModel = 'openai-vision' | 'ollama-moondream' | 'groq-llama';

type AgentState = {
    lastDescription?: string;
    answer?: string;
    loading: boolean;
    error?: string;
    selectedModel: AIModel;
}

export class Agent {
    #lock = new AsyncLock();
    #photos: Uint8Array[] = [];
    #state: AgentState = { loading: false, selectedModel: 'openai-vision' };
    #stateCopy: AgentState = { loading: false, selectedModel: 'openai-vision' };
    #stateListeners: (() => void)[] = [];

    async addPhoto(photos: Uint8Array[]) {
        await this.#lock.inLock(async () => {
            console.log('🤖 Agent: Processing', photos.length, 'new photos');
            // Append photos directly without processing descriptions
            for (let p of photos) {
                console.log('🤖 Agent: Adding photo', p.length, 'bytes');
                this.#photos.push(p);
            }

            // Update UI to show we have new photos
            this.#state.lastDescription = `Received ${photos.length} new photo(s)`;
            console.log('🤖 Agent: Updated photo count to', this.#photos.length);
            this.#notify();
        });
    }

    setModel(model: AIModel) {
        this.#state.selectedModel = model;
        console.log('🤖 Agent: Switched to model:', model);
        this.#notify();
    }

    getSelectedModel(): AIModel {
        return this.#state.selectedModel;
    }

    // Check if API keys are configured for the selected model
    checkModelConfiguration(): { configured: boolean; errorMessage?: string } {
        switch (this.#state.selectedModel) {
            case 'openai-vision':
                if (!keys.openai || keys.openai.trim() === '') {
                    return {
                        configured: false,
                        errorMessage: 'OpenAI API key not configured. Please add EXPO_PUBLIC_OPENAI_API_KEY to your .env file.'
                    };
                }
                break;
            case 'ollama-moondream':
                // Ollama runs locally, so we just check if it's available
                return {
                    configured: true,
                    errorMessage: undefined
                };
            case 'groq-llama':
                if (!keys.groq || keys.groq.trim() === '') {
                    return {
                        configured: false,
                        errorMessage: 'Groq API key not configured. Please add EXPO_PUBLIC_GROQ_API_KEY to your .env file.'
                    };
                }
                break;
        }
        return { configured: true };
    }

    async answer(question: string) {
        console.log('🤖 Agent: User asked:', question, 'using model:', this.#state.selectedModel);

        // Check configuration first
        const config = this.checkModelConfiguration();
        if (!config.configured) {
            this.#state.error = config.errorMessage;
            this.#state.answer = undefined;
            this.#notify();
            return;
        }

        try {
            startAudio()
        } catch(error) {
            console.log("Failed to start audio")
        }
        if (this.#state.loading) {
            console.log('🤖 Agent: Already loading, ignoring request');
            return;
        }
        this.#state.loading = true;
        this.#state.error = undefined;
        console.log('🤖 Agent: Starting to process question...');
        this.#notify();

        await this.#lock.inLock(async () => {
            try {
                console.log('🤖 Agent: Have', this.#photos.length, 'photos to analyze');

                if (this.#photos.length === 0) {
                    this.#state.answer = "I don't see any photos yet. Please take some photos first and then ask your question.";
                    this.#state.error = undefined;
                } else {
                    let answer: string;

                    switch (this.#state.selectedModel) {
                        case 'openai-vision':
                            // Use OpenAI Vision to analyze images directly
                            console.log('🤖 Agent: Using OpenAI Vision');
                            answer = await answerQuestionWithImages(question, this.#photos);
                            break;

                        case 'ollama-moondream':
                            // Use Ollama for image analysis
                            console.log('🤖 Agent: Using Ollama Moondream');
                            try {
                                // First, test if Ollama is accessible
                                await ollamaInference({
                                    model: 'moondream:1.8b-v2-fp16',
                                    messages: [{
                                        role: 'user',
                                        content: 'Hello'
                                    }]
                                });

                                const ollamaPromises = this.#photos.map(async (photo, index) => {
                                    try {
                                        const description = await ollamaInference({
                                            model: 'moondream:1.8b-v2-fp16',
                                            messages: [{
                                                role: 'system',
                                                content: 'You are a very advanced model and your task is to describe the image as precisely as possible. Transcribe any text you see.'
                                            }, {
                                                role: 'user',
                                                content: 'Describe the scene',
                                                images: [photo],
                                            }]
                                        });
                                        return `Image ${index + 1}: ${description}`;
                                    } catch (error) {
                                        console.error('❌ Ollama error for image', index, ':', error);
                                        return `Image ${index + 1}: Could not analyze`;
                                    }
                                });

                                const descriptions = await Promise.all(ollamaPromises);
                                const combinedDescriptions = descriptions.join('\n\n');

                                answer = await ollamaInference({
                                    model: 'moondream:1.8b-v2-fp16',
                                    messages: [{
                                        role: 'system',
                                        content: `You are a smart AI that needs to read through descriptions of images and answer user's questions. DO NOT mention the images, scenes or descriptions in your answer, just answer the question. DO NOT try to generalize or provide possible scenarios. ONLY use the information in the description of the images to answer the question. BE concise and specific.`
                                    }, {
                                        role: 'user',
                                        content: `Images:\n${combinedDescriptions}\n\nQuestion: ${question}`
                                    }]
                                });
                            } catch (error) {
                                console.error('❌ Ollama connection error:', error);
                                if (error instanceof Error) {
                                    if (error.message.includes('fetch') || error.message.includes('network')) {
                                        throw new Error('Ollama is not running. Please start Ollama and ensure it\'s accessible at http://localhost:11434');
                                    } else if (error.message.includes('model')) {
                                        throw new Error('Moondream model not found. Please install it with: ollama pull moondream:1.8b-v2-fp16');
                                    } else {
                                        throw new Error(`Ollama error: ${error.message}`);
                                    }
                                } else {
                                    throw new Error('Ollama is not accessible. Please check if Ollama is running.');
                                }
                            }
                            break;

                        case 'groq-llama':
                            // Use Groq for text-based analysis (would need image descriptions first)
                            console.log('🤖 Agent: Using Groq Llama');
                            // For Groq, we'd need to get image descriptions first, then use text analysis
                            // This is a simplified implementation - you might want to add image description capability
                            answer = await groqRequest(
                                `You are a smart AI that needs to answer user's questions. The user has taken ${this.#photos.length} photos but I can only analyze text. Please provide a helpful response based on the question: ${question}`,
                                "I can see you have photos but I'm currently limited to text analysis. Please describe what you see and I'll help you with your question."
                            );
                            break;

                        default:
                            throw new Error(`Unknown model: ${this.#state.selectedModel}`);
                    }

                    console.log('🤖 Agent: Response received:', answer);
                    this.#state.answer = answer;
                    this.#state.error = undefined;
                }
            } catch (error) {
                console.error('❌ Agent: Request failed:', error);

                // Provide specific error messages based on the error type
                let errorMessage = `Failed to get response from ${this.#state.selectedModel}. `;

                if (error instanceof Error) {
                    if (error.message.includes('401') || error.message.includes('Invalid')) {
                        errorMessage += 'Invalid API key. Please check your configuration.';
                    } else if (error.message.includes('429')) {
                        errorMessage += 'Rate limit exceeded. Please try again later.';
                    } else if (error.message.includes('402')) {
                        errorMessage += 'Billing issue. Please check your account credits.';
                    } else if (error.message.includes('Ollama')) {
                        errorMessage = error.message;
                    } else if (error.message.includes('fetch') || error.message.includes('network')) {
                        errorMessage = 'Network error. Please check your internet connection.';
                    } else {
                        errorMessage += error.message;
                    }
                } else {
                    errorMessage += 'Please check your configuration and try again.';
                }

                this.#state.error = errorMessage;
                this.#state.answer = undefined;
            } finally {
                this.#state.loading = false;
                console.log('🤖 Agent: Finished processing, notifying UI');
                this.#notify();
            }
        });
    }

    #notify = () => {
        this.#stateCopy = { ...this.#state };
        for (let l of this.#stateListeners) {
            l();
        }
    }

    use() {
        const [state, setState] = React.useState(this.#stateCopy);
        React.useEffect(() => {
            const listener = () => setState(this.#stateCopy);
            this.#stateListeners.push(listener);
            return () => {
                this.#stateListeners = this.#stateListeners.filter(l => l !== listener);
            }
        }, []);
        return state;
    }
}
