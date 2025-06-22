import * as React from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TextInput, View, TouchableOpacity } from 'react-native';
import { rotateImage } from '../modules/imaging';
import { toBase64Image } from '../utils/base64';
import { Agent } from '../agent/Agent';
import { InvalidateSync } from '../utils/invalidateSync';
import { textToSpeech } from '../modules/openai';

function usePhotos(device: BluetoothRemoteGATTServer) {
    // Subscribe to device
    const [photos, setPhotos] = React.useState<Uint8Array[]>([]);
    const [subscribed, setSubscribed] = React.useState<boolean>(false);
    const [isCapturing, setIsCapturing] = React.useState<boolean>(false);

    const capturePhoto = React.useCallback(async () => {
        try {
            setIsCapturing(true);
            const service = await device.getPrimaryService('19B10000-E8F2-537E-4F6C-D104768A1214'.toLowerCase());
            const photoControlCharacteristic = await service.getCharacteristic('19b10006-e8f2-537e-4f6c-d104768a1214');
            // Send -1 to take a single photo
            await photoControlCharacteristic.writeValue(new Uint8Array([0xFF]));
        } catch (error) {
            console.error('Failed to capture photo:', error);
        } finally {
            setIsCapturing(false);
        }
    }, [device]);

    React.useEffect(() => {
        (async () => {
            let previousChunk = -1;
            let buffer: Uint8Array = new Uint8Array(0);
            function onChunk(id: number | null, data: Uint8Array) {
                // Resolve if packet is the first one
                if (previousChunk === -1) {
                    if (id === null) {
                        return;
                    } else if (id === 0) {
                        previousChunk = 0;
                        buffer = new Uint8Array(0);
                    } else {
                        console.warn('Unexpected first chunk id', id);
                        return;
                    }
                } else {
                    if (id === null) {
                        if (buffer.length === 0) {
                            console.warn('Photo end received but buffer is empty');
                        } else {
                            console.log('Photo received', buffer);
                            rotateImage(buffer, '270').then((rotated) => {
                                console.log('Rotated photo', rotated);
                                setPhotos((p) => [...p.slice(-9), rotated]); // Only keep last 10
                            });
                        }
                        previousChunk = -1;
                        return;
                    } else {
                        if (id !== previousChunk + 1) {
                            console.error('Invalid chunk', id, previousChunk, 'Dropping current photo buffer.');
                            previousChunk = -1;
                            buffer = new Uint8Array(0);
                            return;
                        }
                        previousChunk = id;
                    }
                }
                // Append data
                buffer = new Uint8Array([...buffer, ...data]);
            }
            // Subscribe for photo updates
            const service = await device.getPrimaryService('19B10000-E8F2-537E-4F6C-D104768A1214'.toLowerCase());
            const photoCharacteristic = await service.getCharacteristic('19b10005-e8f2-537e-4f6c-d104768a1214');
            await photoCharacteristic.startNotifications();
            setSubscribed(true);
            photoCharacteristic.addEventListener('characteristicvaluechanged', (e) => {
                let value = (e.target as BluetoothRemoteGATTCharacteristic).value!;
                let array = new Uint8Array(value.buffer);
                if (array[0] == 0xff && array[1] == 0xff) {
                    onChunk(null, new Uint8Array());
                } else {
                    let packetId = array[0] + (array[1] << 8);
                    let packet = array.slice(2);
                    onChunk(packetId, packet);
                }
            });
            // Start automatic photo capture every 5s
            const photoControlCharacteristic = await service.getCharacteristic('19b10006-e8f2-537e-4f6c-d104768a1214');
            await photoControlCharacteristic.writeValue(new Uint8Array([0x05]));
        })();
    }, []);
    return [subscribed, photos, capturePhoto, isCapturing] as const;
}

export const DeviceView = React.memo((props: { device: BluetoothRemoteGATTServer }) => {
    const [subscribed, photos, capturePhoto, isCapturing] = usePhotos(props.device);
    const agent = React.useMemo(() => new Agent(), []);
    const agentState = agent.use();

    // Background processing agent
    const processedPhotos = React.useRef<Uint8Array[]>([]);
    const sync = React.useMemo(() => {
        let processed = 0;
        return new InvalidateSync(async () => {
            if (processedPhotos.current.length > processed) {
                let unprocessed = processedPhotos.current.slice(processed);
                processed = processedPhotos.current.length;
                await agent.addPhoto(unprocessed);
            }
        });
    }, []);
    React.useEffect(() => {
        processedPhotos.current = photos;
        sync.invalidate();
    }, [photos]);
    React.useEffect(() => {
        if (agentState.answer) {
            textToSpeech(agentState.answer)
        }
    }, [agentState.answer])

    const latestPhoto = photos[photos.length - 1];

    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            {/* Live Camera View */}
            <View style={{
                flex: 1,
                justifyContent: 'center',
                alignItems: 'center',
                padding: 20
            }}>
                <View style={{
                    backgroundColor: 'rgba(28, 28, 28, 0.95)',
                    borderRadius: 20,
                    padding: 20,
                    alignItems: 'center',
                    shadowColor: '#fff',
                    shadowOffset: { width: 0, height: 10 },
                    shadowOpacity: 0.1,
                    shadowRadius: 20,
                    elevation: 10,
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.1)'
                }}>
                    <Text style={{
                        color: 'white',
                        fontSize: 24,
                        fontWeight: 'bold',
                        marginBottom: 20
                    }}>
                        Live Camera View
                    </Text>

                    {latestPhoto ? (
                        <View style={{
                            borderRadius: 15,
                            overflow: 'hidden',
                            shadowColor: '#fff',
                            shadowOffset: { width: 0, height: 5 },
                            shadowOpacity: 0.2,
                            shadowRadius: 10,
                            elevation: 8
                        }}>
                            <Image
                                style={{
                                    width: 300,
                                    height: 200,
                                    borderRadius: 15
                                }}
                                source={{ uri: toBase64Image(latestPhoto) }}
                            />
                        </View>
                    ) : (
                        <View style={{
                            width: 300,
                            height: 200,
                            backgroundColor: 'rgba(48, 48, 48, 0.5)',
                            borderRadius: 15,
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderWidth: 2,
                            borderColor: 'rgba(255, 255, 255, 0.2)',
                            borderStyle: 'dashed'
                        }}>
                            <Text style={{ color: '#888', fontSize: 16 }}>No camera feed</Text>
                        </View>
                    )}

                    <TouchableOpacity
                        onPress={capturePhoto}
                        disabled={isCapturing}
                        style={{
                            backgroundColor: isCapturing ? '#666' : '#fff',
                            paddingHorizontal: 30,
                            paddingVertical: 15,
                            borderRadius: 25,
                            marginTop: 20,
                            flexDirection: 'row',
                            alignItems: 'center'
                        }}
                    >
                        {isCapturing ? (
                            <ActivityIndicator size="small" color="#000" />
                        ) : (
                            <Text style={{ color: '#000', fontSize: 16, fontWeight: '600' }}>
                                📸 Capture Photo
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Photo Gallery */}
            {photos.length > 0 && (
                <View style={{
                    height: 120,
                    paddingHorizontal: 20,
                    paddingBottom: 20
                }}>
                    <Text style={{
                        color: 'white',
                        fontSize: 16,
                        marginBottom: 10,
                        opacity: 0.8
                    }}>
                        Recent Photos ({photos.length})
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {photos.map((photo, index) => (
                            <View key={index} style={{
                                marginRight: 10,
                                borderRadius: 8,
                                overflow: 'hidden',
                                shadowColor: '#fff',
                                shadowOffset: { width: 0, height: 2 },
                                shadowOpacity: 0.1,
                                shadowRadius: 4,
                                elevation: 3
                            }}>
                                <Image
                                    style={{
                                        width: 80,
                                        height: 80,
                                        borderRadius: 8
                                    }}
                                    source={{ uri: toBase64Image(photo) }}
                                />
                            </View>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Chat Interface */}
            <View style={{
                backgroundColor: 'rgba(28, 28, 28, 0.95)',
                padding: 20,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                shadowColor: '#fff',
                shadowOffset: { width: 0, height: -5 },
                shadowOpacity: 0.1,
                shadowRadius: 10,
                elevation: 10
            }}>
                <View style={{
                    minHeight: 100,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginBottom: 20
                }}>
                    {agentState.loading && (
                        <View style={{ alignItems: 'center' }}>
                            <ActivityIndicator size="large" color="#fff" />
                            <Text style={{ color: '#888', marginTop: 10, fontSize: 16 }}>Processing...</Text>
                        </View>
                    )}
                    {agentState.answer && !agentState.loading && (
                        <ScrollView
                            style={{ flexGrow: 1, flexBasis: 0 }}
                            showsVerticalScrollIndicator={false}
                        >
                            <Text style={{
                                color: 'white',
                                fontSize: 18,
                                lineHeight: 24,
                                textAlign: 'center'
                            }}>
                                {agentState.answer}
                            </Text>
                        </ScrollView>
                    )}
                </View>

                <TextInput
                    style={{
                        color: 'white',
                        height: 50,
                        fontSize: 16,
                        borderRadius: 15,
                        backgroundColor: 'rgba(48, 48, 48, 0.8)',
                        paddingHorizontal: 15,
                        paddingVertical: 10,
                        borderWidth: 1,
                        borderColor: 'rgba(255, 255, 255, 0.2)'
                    }}
                    placeholder='Ask about what you see...'
                    placeholderTextColor={'#888'}
                    readOnly={agentState.loading}
                    onSubmitEditing={(e) => agent.answer(e.nativeEvent.text)}
                />
            </View>
        </View>
    );
});
