import * as React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type AIModel = 'openai-vision' | 'ollama-moondream' | 'groq-llama';

export interface ModelSelectorProps {
    selectedModel: AIModel;
    onModelChange: (model: AIModel) => void;
}

const MODELS = [
    {
        id: 'openai-vision' as const,
        name: 'OpenAI GPT-4 Vision',
        description: 'High-quality image analysis',
        icon: '🤖'
    },
    {
        id: 'ollama-moondream' as const,
        name: 'Ollama Moondream',
        description: 'Local image analysis',
        icon: '🏠'
    },
    {
        id: 'groq-llama' as const,
        name: 'Groq Llama',
        description: 'Fast text analysis',
        icon: '⚡'
    }
];

export const ModelSelector: React.FC<ModelSelectorProps> = ({ selectedModel, onModelChange }) => {
    const selectedModelInfo = MODELS.find(model => model.id === selectedModel);

    return (
        <View style={styles.container}>
            <Text style={styles.label}>AI Model:</Text>
            <View style={styles.buttonContainer}>
                {MODELS.map((model) => (
                    <TouchableOpacity
                        key={model.id}
                        style={[
                            styles.button,
                            selectedModel === model.id && styles.buttonSelected
                        ]}
                        onPress={() => onModelChange(model.id)}
                    >
                        <Text style={styles.buttonIcon}>{model.icon}</Text>
                        <Text style={[
                            styles.buttonText,
                            selectedModel === model.id && styles.buttonTextSelected
                        ]}>
                            {model.name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: 15,
    },
    label: {
        color: '#888',
        fontSize: 14,
        marginBottom: 8,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    button: {
        flex: 1,
        backgroundColor: 'rgba(48, 48, 48, 0.8)',
        borderRadius: 12,
        padding: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    buttonSelected: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    buttonIcon: {
        fontSize: 16,
        marginBottom: 4,
    },
    buttonText: {
        color: 'white',
        fontSize: 12,
        textAlign: 'center',
        fontWeight: '500',
    },
    buttonTextSelected: {
        color: '#fff',
        fontWeight: '600',
    },
});
