export const AudioSession = { startAudioSession: jest.fn(), stopAudioSession: jest.fn() }
export const VideoView = 'VideoView'
export const useLocalParticipant = jest.fn(() => ({ localParticipant: null, isCameraEnabled: false, isMicrophoneEnabled: false }))
export const useRoomContext = jest.fn(() => null)
export const LiveKitRoom = ({ children }) => children
export const useTracks = jest.fn(() => [])
export const useParticipants = jest.fn(() => [])
export const RoomEvent = {}
export const Track = { Source: { Camera: 'camera', Microphone: 'microphone' } }
