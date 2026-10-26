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

type Props = NativeStackScreenProps<RootStackParams, 'Register'>

export default function RegisterScreen({ navigation }: Props) {
  const { register } = useAuth()
  const [inviteCode, setInviteCode] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    setError(null)
    setLoading(true)
    try {
      await register(username, password, displayName, inviteCode)
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Create account</Text>
        <Text style={s.subtitle}>You need an invite code to join</Text>

        {error ? <Text style={s.error}>{error}</Text> : null}

        {(['Invite code', 'Username', 'Display name'] as const).map((label) => {
          const key = label === 'Invite code' ? inviteCode : label === 'Username' ? username : displayName
          const setter = label === 'Invite code' ? setInviteCode : label === 'Username' ? setUsername : setDisplayName
          return (
            <View key={label}>
              <Text style={s.label}>{label}</Text>
              <TextInput
                style={s.input}
                value={key}
                onChangeText={setter}
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor={colors.textMuted}
              />
            </View>
          )
        })}

        <Text style={s.label}>Password</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor={colors.textMuted}
        />

        <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={() => { void handleRegister() }} disabled={loading}>
          <Text style={s.btnText}>{loading ? 'Creating account…' : 'Create Account'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={s.link}>Already have an account? Log in</Text>
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
