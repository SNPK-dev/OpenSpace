import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Text } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme'

import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'
import ChannelListScreen from '../screens/ChannelListScreen'
import ChatScreen from '../screens/ChatScreen'
import VoiceScreen from '../screens/VoiceScreen'
import DMListScreen from '../screens/DMListScreen'
import DMScreen from '../screens/DMScreen'

export type RootStackParams = {
  Login: undefined
  Register: undefined
  Main: undefined
}

export type ChannelsStackParams = {
  ChannelList: undefined
  Chat: { channelId: string; channelName: string; roomId: string }
  Voice: { channelId: string; channelName: string }
}

export type DMStackParams = {
  DMList: undefined
  DM: { convId: string; peerName: string }
}

const Root = createNativeStackNavigator<RootStackParams>()
const ChannelsStack = createNativeStackNavigator<ChannelsStackParams>()
const DMStack = createNativeStackNavigator<DMStackParams>()
const Tabs = createBottomTabNavigator()

const screenOptions = {
  headerStyle: { backgroundColor: colors.surface2 },
  headerTintColor: colors.text,
  headerTitleStyle: { color: colors.text },
}

function ChannelsNavigator() {
  return (
    <ChannelsStack.Navigator screenOptions={screenOptions}>
      <ChannelsStack.Screen name="ChannelList" component={ChannelListScreen} options={{ title: 'Channels' }} />
      <ChannelsStack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: `#${route.params.channelName}` })} />
      <ChannelsStack.Screen name="Voice" component={VoiceScreen} options={({ route }) => ({ title: `🔊 ${route.params.channelName}` })} />
    </ChannelsStack.Navigator>
  )
}

function DMNavigator() {
  return (
    <DMStack.Navigator screenOptions={screenOptions}>
      <DMStack.Screen name="DMList" component={DMListScreen} options={{ title: 'Direct Messages' }} />
      <DMStack.Screen name="DM" component={DMScreen} options={({ route }) => ({ title: route.params.peerName })} />
    </DMStack.Navigator>
  )
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface2, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="ChannelsTab"
        component={ChannelsNavigator}
        options={{ title: 'Channels', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>#</Text> }}
      />
      <Tabs.Screen
        name="DMsTab"
        component={DMNavigator}
        options={{ title: 'DMs', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>💬</Text> }}
      />
    </Tabs.Navigator>
  )
}

export default function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) return null

  return (
    <NavigationContainer>
      <Root.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
        {isAuthenticated ? (
          <Root.Screen name="Main" component={MainTabs} />
        ) : (
          <>
            <Root.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Root.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
          </>
        )}
      </Root.Navigator>
    </NavigationContainer>
  )
}
