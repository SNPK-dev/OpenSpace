import React from 'react'
import { render, fireEvent, waitFor, screen } from '@testing-library/react-native'
import RegisterScreen from '../screens/RegisterScreen'

const mockGoBack = jest.fn()
const mockNavigation = { navigate: jest.fn(), goBack: mockGoBack } as any

const mockRegister = jest.fn()
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    register: mockRegister,
    isAuthenticated: false,
    isLoading: false,
    identity: null,
  }),
}))

jest.mock('../api/client', () => ({
  ApiError: class ApiError extends Error {
    code: string
    constructor(status: number, code: string) {
      super(code)
      this.code = code
    }
  },
}))

beforeEach(() => jest.clearAllMocks())

describe('RegisterScreen', () => {
  it('renders title and subtitle', () => {
    render(<RegisterScreen navigation={mockNavigation} route={{} as any} />)
    expect(screen.getByText('Create account')).toBeTruthy()
    expect(screen.getByText('You need an invite code to join')).toBeTruthy()
  })

  it('renders all form fields', () => {
    render(<RegisterScreen navigation={mockNavigation} route={{} as any} />)
    expect(screen.getByText('Invite code')).toBeTruthy()
    expect(screen.getByText('Username')).toBeTruthy()
    expect(screen.getByText('Display name')).toBeTruthy()
    expect(screen.getByText('Password')).toBeTruthy()
  })

  it('renders Create Account button', () => {
    render(<RegisterScreen navigation={mockNavigation} route={{} as any} />)
    expect(screen.getByText('Create Account')).toBeTruthy()
  })

  it('calls register with all field values on submit', async () => {
    mockRegister.mockResolvedValueOnce(undefined)
    render(<RegisterScreen navigation={mockNavigation} route={{} as any} />)

    const inputs = screen.UNSAFE_getAllByType(require('react-native').TextInput)
    // Order: Invite code, Username, Display name, Password
    fireEvent.changeText(inputs[0], 'INVITE123')
    fireEvent.changeText(inputs[1], 'newuser')
    fireEvent.changeText(inputs[2], 'New User')
    fireEvent.changeText(inputs[3], 'Password123!')
    fireEvent.press(screen.getByText('Create Account'))

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith('newuser', 'Password123!', 'New User', 'INVITE123')
    })
  })

  it('shows error on registration failure', async () => {
    const { ApiError } = require('../api/client')
    mockRegister.mockRejectedValueOnce(new ApiError(400, 'invite_not_found'))
    render(<RegisterScreen navigation={mockNavigation} route={{} as any} />)

    fireEvent.press(screen.getByText('Create Account'))
    await waitFor(() => {
      expect(screen.getByText('invite_not_found')).toBeTruthy()
    })
  })

  it('navigates back when "Already have an account" is pressed', () => {
    render(<RegisterScreen navigation={mockNavigation} route={{} as any} />)
    fireEvent.press(screen.getByText('Already have an account? Log in'))
    expect(mockGoBack).toHaveBeenCalled()
  })
})
