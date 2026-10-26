import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, SectionList,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ChannelsStackParams } from '../navigation/RootNavigator'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { Room, Channel } from '../api/types'
import { colors, fonts, radius } from '../theme'

type Props = NativeStackScreenProps<ChannelsStackParams, 'ChannelList'>

interface Section {
  title: string
  data: Channel[]
}

export default function ChannelListScreen({ navigation }: Props) {
  const { logout } = useAuth()
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => { void logout() }} style={{ marginRight: 12 }}>
          <Text style={{ color: colors.danger, fontSize: fonts.base }}>Logout</Text>
        </TouchableOpacity>
      ),
    })
  }, [navigation, logout])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { rooms } = await api.rooms.list()
      const results = await Promise.all(
        rooms.map(async (room) => {
          const { channels } = await api.channels.list(room.id)
          return { title: room.name, data: channels }
        })
      )
      setSections(results.filter(s => s.data.length > 0))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
  }

  return (
    <SectionList
      style={s.list}
      sections={sections}
      keyExtractor={(item) => item.id}
      renderSectionHeader={({ section }) => (
        <Text style={s.sectionHeader}>{section.title.toUpperCase()}</Text>
      )}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={s.item}
          onPress={() => {
            if (item.type === 'voice') {
              navigation.navigate('Voice', { channelId: item.id, channelName: item.name })
            } else {
              navigation.navigate('Chat', { channelId: item.id, channelName: item.name, roomId: item.room_id })
            }
          }}
        >
          <Text style={s.channelIcon}>{item.type === 'voice' ? '🔊' : '#'}</Text>
          <Text style={s.channelName}>{item.name}</Text>
        </TouchableOpacity>
      )}
    />
  )
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1, backgroundColor: colors.bg },
  sectionHeader: {
    fontSize: fonts.sm,
    fontWeight: '700',
    color: colors.textMuted,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 6,
    backgroundColor: colors.bg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  channelIcon: { fontSize: fonts.md, opacity: 0.8 },
  channelName: { fontSize: fonts.base, color: colors.textMuted },
})
