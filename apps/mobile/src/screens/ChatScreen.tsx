import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { ChannelsStackParams } from '../navigation/RootNavigator'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useWSEvent } from '../context/WSContext'
import type { Message, MessageCreatedEvent, MessageDeletedEvent } from '../api/types'
import { colors, fonts, radius } from '../theme'

type Props = NativeStackScreenProps<ChannelsStackParams, 'Chat'>

export default function ChatScreen({ route }: Props) {
  const { channelId, channelName, roomId } = route.params
  const { identity } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setMessages([])
    void api.messages.list(roomId, channelId).then(r => {
      setMessages(r.messages)
      setHasMore(r.has_more)
    })
  }, [channelId, roomId])

  useWSEvent<MessageCreatedEvent>('message.created', (e) => {
    if (e.channel_id !== channelId) return
    setMessages(prev => [e.message, ...prev])
  })

  useWSEvent<MessageDeletedEvent>('message.deleted', (e) => {
    if (e.channel_id !== channelId) return
    setMessages(prev => prev.filter(m => m.id !== e.message_id))
  })

  async function loadMore() {
    if (!hasMore || loadingMore) return
    const oldest = messages[messages.length - 1]
    if (!oldest) return
    setLoadingMore(true)
    const r = await api.messages.list(roomId, channelId, oldest.id)
    setMessages(prev => [...prev, ...r.messages])
    setHasMore(r.has_more)
    setLoadingMore(false)
  }

  async function send() {
    const content = input.trim()
    if (!content || sending) return
    setSending(true)
    setInput('')
    try {
      await api.messages.send(roomId, channelId, content)
    } catch {
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  function renderItem({ item }: { item: Message }) {
    const isOwn = item.sender.id === identity?.id
    return (
      <View style={s.msgRow}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{(item.sender.display_name || item.sender.username)[0]?.toUpperCase()}</Text>
        </View>
        <View style={s.msgBody}>
          <View style={s.msgHeader}>
            <Text style={s.author}>{item.sender.display_name || item.sender.username}</Text>
            <Text style={s.time}>{new Date(item.created_at).toLocaleTimeString()}</Text>
          </View>
          <Text style={s.content}>{item.content}</Text>
        </View>
        {isOwn && (
          <TouchableOpacity onPress={() => { void api.messages.delete(roomId, channelId, item.id) }}>
            <Text style={s.deleteBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
      <FlatList
        style={s.list}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={renderItem}
        inverted
        onEndReached={() => { void loadMore() }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingMore ? <Text style={s.loadMore}>Loading…</Text> : null}
      />
      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder={`Message #${channelName}`}
          placeholderTextColor={colors.textMuted}
          multiline
          returnKeyType="send"
          onSubmitEditing={() => { void send() }}
          blurOnSubmit={false}
        />
        <TouchableOpacity style={s.sendBtn} onPress={() => { void send() }} disabled={sending || !input.trim()}>
          <Text style={s.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  loadMore: { color: colors.textMuted, textAlign: 'center', padding: 8, fontSize: fonts.sm },
  msgRow: { flexDirection: 'row', padding: 12, paddingVertical: 6, gap: 10, alignItems: 'flex-start' },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: fonts.base },
  msgBody: { flex: 1 },
  msgHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2 },
  author: { fontWeight: '600', color: colors.text, fontSize: fonts.base },
  time: { fontSize: fonts.sm, color: colors.textMuted },
  content: { color: colors.text, fontSize: fonts.base, lineHeight: 22 },
  deleteBtn: { color: colors.danger, fontSize: fonts.base, padding: 4 },
  inputRow: { flexDirection: 'row', padding: 8, gap: 8, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: colors.inputBg, borderRadius: radius.sm, padding: 10, color: colors.text, fontSize: fonts.base, maxHeight: 120 },
  sendBtn: { backgroundColor: colors.primary, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: fonts.md },
})
