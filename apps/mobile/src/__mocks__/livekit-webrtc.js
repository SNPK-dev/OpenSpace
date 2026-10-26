module.exports = {
  RTCPeerConnection: jest.fn(),
  RTCIceCandidate: jest.fn(),
  RTCSessionDescription: jest.fn(),
  MediaStream: jest.fn(),
  mediaDevices: { getUserMedia: jest.fn(), enumerateDevices: jest.fn(() => Promise.resolve([])) },
  registerGlobals: jest.fn(),
}
