import * as React from 'react';
import { AsyncLock } from "../utils/lock";
import { answerQuestionWithImages } from "../modules/openai";
import { startAudio } from '../modules/openai';

type AgentState = {
    lastDescription?: string;
    answer?: string;
    loading: boolean;
    error?: string;
}

export class Agent {
    #lock = new AsyncLock();
    #photos: Uint8Array[] = [];
    #state: AgentState = { loading: false };
    #stateCopy: AgentState = { loading: false };
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

    async answer(question: string) {
        console.log('🤖 Agent: User asked:', question);
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
                    // Use OpenAI Vision to analyze images directly
                    console.log('🤖 Agent: Sending to OpenAI Vision:', {
                        question,
                        imageCount: this.#photos.length
                    });

                    let answer = await answerQuestionWithImages(question, this.#photos);
                    console.log('🤖 Agent: OpenAI Vision response:', answer);
                    this.#state.answer = answer;
                    this.#state.error = undefined;
                }
            } catch (error) {
                console.error('❌ Agent: OpenAI Vision request failed:', error);
                this.#state.error = 'Failed to get response from AI. Please check your OpenAI API key and try again.';
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
