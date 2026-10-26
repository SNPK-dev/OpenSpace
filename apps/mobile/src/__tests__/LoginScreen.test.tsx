import React from 'react'
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native'
import LoginScreen from '../screens/LoginScreen'

// Mock navigation
const mockNavigate = jest.fn()
const mockNavigation = { navigate: mockNavigate, goBack: jest.fn() } as any

// Mock AuthContext
const mockLogin = jest.fn()
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    isAuthenticated: false,
    isLoading: false,
    identity: null,
  }),
}))

// Mock ApiError
jest.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    code: string
    constructor(status: number, code: string) {
      super(code)
      this.code = code
    }
  },
}))

beforeEach(() => {
  jest.clearAllMocks()
})

describe('LoginScreen', () => {
  it('renders title and subtitle', () => {
    render(<LoginScreen navigation={mockNavigation} route={{} as any} />)
    expect(screen.getByText('Welcome back')).toBeTruthy()
    expect(screen.getByText('Sign in to your OpenSpace account')).toBeTruthy()
  })

  it('renders username and password inputs', () => {
    render(<LoginScreen navigation={mockNavigation} route={{} as any} />)
    expect(screen.getByText('Username')).toBeTruthy()
    expect(screen.getByText('Password')).toBeTruthy()
  })

  it('renders Log In button', () => {
    render(<LoginScreen navigation={mockNavigation} route={{} as any} />)
    expect(screen.getByText('Log In')).toBeTruthy()
  })

  it('calls login with entered credentials on button press', async () => {
    mockLogin.mockResolvedValueOnce(undefined)
    render(<LoginScreen navigation={mockNavigation} route={{} as any} />)

    // Find TextInputs by testID isn't available, use getAllByDisplayValue or query differently
    const inputs = screen.UNSAFE_getAllByType(require('react-native').TextInput)
    fireEvent.changeText(inputs[0], 'testuser')
    fireEvent.changeText(inputs[1], 'testpassword')
    fireEvent.press(screen.getByText('Log In'))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('testuser', 'testpassword')
    })
  })

  it('shows error message on login failure', async () => {
    const { ApiError } = require('../api/client')
    mockLogin.mockRejectedValueOnce(new ApiError(401, 'invalid_credentials'))
    render(<LoginScreen navigation={mockNavigation} route={{} as any} />)

    const inputs = screen.UNSAFE_getAllByType(require('react-native').TextInput)
    fireEvent.changeText(inputs[0], 'baduser')
    fireEvent.changeText(inputs[1], 'badpass')
    fireEvent.press(screen.getByText('Log In'))

    await waitFor(() => {
      expect(screen.getByText('invalid_credentials')).toBeTruthy()
    })
  })

  it('shows loading state during login', async () => {
    mockLogin.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(resolve, 100))
    )
    render(<LoginScreen navigation={mockNavigation} route={{} as any} />)
    fireEvent.press(screen.getByText('Log In'))
    expect(screen.getByText('Signing in…')).toBeTruthy()
  })

  it('navigates to Register screen on link press', () => {
    render(<LoginScreen navigation={mockNavigation} route={{} as any} />)
    fireEvent.press(screen.getByText('Need an account? Register with invite'))
    expect(mockNavigate).toHaveBeenCalledWith('Register')
  })
})
