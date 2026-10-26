module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|livekit-client|@livekit/.*))',
  ],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/src/__mocks__/async-storage.js',
    '^@livekit/react-native$': '<rootDir>/src/__mocks__/livekit-react-native.js',
    '^@livekit/react-native-webrtc$': '<rootDir>/src/__mocks__/livekit-webrtc.js',
  },
  testMatch: ['<rootDir>/src/__tests__/**/*.test.{ts,tsx}'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/__mocks__/**', '!src/**/*.d.ts'],
}
