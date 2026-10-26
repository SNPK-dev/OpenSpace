import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParams } from '../navigation/RootNavigator'
import { useAuth } from '../context/AuthContext'
import { ApiError } from '../api/client'
import { colors, fonts, radius } from '../theme'

type Props = NativeStackScreenProps<RootStackParams, 'Login'>

export default function LoginScreen({ navigation }: Props) {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError(null)
    setLoading(true)
    try {
      await login(username, password)
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Welcome back</Text>
        <Text style={s.subtitle}>Sign in to your OpenSpace account</Text>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <Text style={s.label}>Username</Text>
        <TextInput
          style={s.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.textMuted}
        />

        <Text style={s.label}>Password</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor={colors.textMuted}
        />

        <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={() => { void handleLogin() }} disabled={loading}>
          <Text style={s.btnText}>{loading ? 'Signing in…' : 'Log In'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={s.link}>Need an account? Register with invite</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface2 },
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: fonts.xl, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: fonts.base, color: colors.textMuted, textAlign: 'center', marginBottom: 24 },
  error: { backgroundColor: 'rgba(237,66,69,0.2)', color: '#f87171', padding: 12, borderRadius: radius.sm, marginBottom: 16, fontSize: fonts.sm },
  label: { fontSize: fonts.sm, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { backgroundColor: colors.inputBg, borderRadius: radius.sm, padding: 12, color: colors.text, fontSize: fonts.md, marginBottom: 16 },
  btn: { backgroundColor: colors.primary, borderRadius: radius.sm, padding: 14, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: fonts.md },
  link: { color: colors.primary, textAlign: 'center', marginTop: 16, fontSize: fonts.base },
})
