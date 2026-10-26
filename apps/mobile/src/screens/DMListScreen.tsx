import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { DMStackParams } from '../navigation/RootNavigator'
import { api } from '../api/client'
import type { DMConversation } from '../api/types'
import { colors, fonts } from '../theme'

type Props = NativeStackScreenProps<DMStackParams, 'DMList'>

export default function DMListScreen({ navigation }: Props) {
  const [convs, setConvs] = useState<DMConversation[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { conversations } = await api.dm.listConversations()
    setConvs(conversations)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.primary} /></View>

  if (convs.length === 0) {
    return <View style={s.center}><Text style={s.empty}>No conversations yet</Text></View>
  }

  return (
    <FlatList
      style={s.list}
      data={convs}
      keyExtractor={c => c.id}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={s.item}
          onPress={() => navigation.navigate('DM', {
            convId: item.id,
            peerName: item.peer.display_name || item.peer.username,
          })}
        >
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(item.peer.display_name || item.peer.username)[0]?.toUpperCase()}</Text>
          </View>
          <Text style={s.name}>{item.peer.display_name || item.peer.username}</Text>
        </TouchableOpacity>
      )}
    />
  )
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  empty: { color: colors.textMuted, fontSize: fonts.base },
  list: { flex: 1, backgroundColor: colors.bg },
  item: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: fonts.base },
  name: { fontSize: fonts.base, color: colors.text, fontWeight: '500' },
})
