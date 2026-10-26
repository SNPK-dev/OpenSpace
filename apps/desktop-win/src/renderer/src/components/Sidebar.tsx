import React, { useEffect, useState, useRef, FormEvent } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight, ChevronUp, Hash, LockKeyhole, MessageCircle, Mic, Settings, ShieldCheck, Users } from 'lucide-react'
import { api } from '../api/client'
import { useVault } from '../context/VaultContext'
import { useWS, useWSEvent } from '../context/WSContext'
import { clientCache } from '../cache/clientCache'
import AvatarImageField from './AvatarImageField'
import type {
  Identity, Room, Channel, Participant, DMConversation, MessageCreatedEvent, DMMessageCreatedEvent,
  RoomCreatedEvent, ServerSettings, PermissionSetting, IdentitySummary, Invite,
  VoiceJoinedEvent, VoiceLeftEvent, VoiceStateChangedEvent,
} from '../api/types'

type ModalKind = 'invite' | 'channel' | 'server' | 'profile' | 'leave' | null
type ServerSettingsSection = 'general' | 'permissions' | 'members'

const ROLE_OPTIONS = ['owner', 'admin', 'moderator', 'member', 'guest']

function toSettingsRecord(settings: PermissionSetting[]): Record<string, string[]> {
  return Object.fromEntries(settings.map(setting => [setting.key, setting.roles]))
}

export default function Sidebar() {
  const { lock, servers, selectedServerId, removeServer, updateServer } = useVault()
  const { connected } = useWS()
  const location = useLocation()
  const locationRef = useRef(location.pathname)

  const [identity, setIdentity] = useState<Identity | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [channels, setChannels] = useState<Record<string, Channel[]>>({})
  const [voiceParticipants, setVoiceParticipants] = useState<Record<string, Participant[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dmConvs, setDmConvs] = useState<DMConversation[]>([])
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [permissions, setPermissions] = useState<string[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<ModalKind>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const [newGroupName, setNewGroupName] = useState('')
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomType, setNewRoomType] = useState<'text' | 'voice'>('text')
  const [newRoomGroupId, setNewRoomGroupId] = useState('')
  const [roomCreateOpen, setRoomCreateOpen] = useState(false)
  const [creatingStructure, setCreatingStructure] = useState(false)

  const [inviteMaxUses, setInviteMaxUses] = useState(25)
  const [inviteExpiry, setInviteExpiry] = useState(168)
  const [createdInvite, setCreatedInvite] = useState<Invite | null>(null)

  const [serverSettings, setServerSettings] = useState<ServerSettings | null>(null)
  const [settingsDraft, setSettingsDraft] = useState({ name: '', description: '', public_url: '', avatar_url: '' })
  const [settingsSection, setSettingsSection] = useState<ServerSettingsSection>('general')
  const [permissionSettings, setPermissionSettings] = useState<PermissionSetting[]>([])
  const [identities, setIdentities] = useState<IdentitySummary[]>([])
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({})
  const [profileDraft, setProfileDraft] = useState({ display_name: '', avatar_url: '' })
  const prevConnectedRef = useRef<boolean | null>(null)

  const selectedServer = servers.find(server => server.server_id === selectedServerId)
  const sidebarTitle = selectedServer?.name ?? 'OpenSpace'
  const canCreateInvite = permissions.includes('invite.create')
  const canManageChannels = permissions.includes('channel.create')
  const canManageServer = permissions.includes('server.manage')
  const canManageIdentities = permissions.includes('identity.manage')
  const canManageRoles = permissions.includes('role.manage')

  useEffect(() => {
    setRoomCreateOpen(false)
    setActiveModal(null)
    setMenuOpen(false)
    if (!selectedServerId) {
      setIdentity(null)
      setRooms([])
      setChannels({})
      setVoiceParticipants({})
      setDmConvs([])
      setPermissions([])
      return
    }
    void api.me.get().then(setIdentity).catch(() => setIdentity(null))
    void api.me.permissions().then(res => setPermissions(res.permissions)).catch(() => setPermissions([]))
    void (async () => {
      try {
        const [roomRes, dmRes] = await Promise.all([api.rooms.list(), api.dm.listConversations()])
        setRooms(roomRes.rooms)
        setNewRoomGroupId(current => current || roomRes.rooms[0]?.id || '')
        setDmConvs(dmRes.conversations)
        void clientCache.saveRooms(selectedServerId, roomRes.rooms)
        void clientCache.saveDMConversations(selectedServerId, dmRes.conversations)
      } catch {
        const [cachedRooms, cachedDMs] = await Promise.all([
          clientCache.loadRooms(selectedServerId),
          clientCache.loadDMConversations(selectedServerId),
        ])
        setRooms(cachedRooms ?? [])
        if (cachedRooms) setNewRoomGroupId(current => current || cachedRooms[0]?.id || '')
        setDmConvs(cachedDMs ?? [])
      }
    })()
  }, [selectedServerId])

  useEffect(() => {
    if (!selectedServerId) return
    if (connected && prevConnectedRef.current === false) {
      void api.rooms.list().then(r => {
        setRooms(r.rooms)
        setNewRoomGroupId(current => current || r.rooms[0]?.id || '')
        void clientCache.saveRooms(selectedServerId, r.rooms)
      }).catch(() => null)
      void api.me.permissions().then(res => setPermissions(res.permissions)).catch(() => setPermissions([]))
    }
    prevConnectedRef.current = connected
  }, [connected, selectedServerId])

  useEffect(() => { locationRef.current = location.pathname }, [location.pathname])

  useEffect(() => {
    const match = location.pathname.match(/\/(channels|dm)\/([^/]+)/)
    const id = match?.[2]
    if (!id) return
    setUnread(prev => {
      if (!prev[id]) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [location.pathname])

  useWSEvent<RoomCreatedEvent>('room.created', (e) => {
    setRooms(prev => prev.some(r => r.id === e.room.id) ? prev : [...prev, e.room])
  })

  useWSEvent<MessageCreatedEvent>('message.created', (e) => {
    const activeId = locationRef.current.match(/\/channels\/([^/]+)/)?.[1]
    if (e.channel_id === activeId) return
    if (e.message.sender.id === identity?.id) return
    setUnread(prev => ({ ...prev, [e.channel_id]: (prev[e.channel_id] ?? 0) + 1 }))
  })

  useWSEvent<DMMessageCreatedEvent>('dm.message.created', (e) => {
    const activeId = locationRef.current.match(/\/dm\/([^/]+)/)?.[1]
    if (e.conversation_id === activeId) return
    if (e.message.sender.id === identity?.id) return
    setUnread(prev => ({ ...prev, [e.conversation_id]: (prev[e.conversation_id] ?? 0) + 1 }))
  })

  useWSEvent<VoiceJoinedEvent>('voice.joined', (e) => {
    setVoiceParticipants(prev => {
      const current = prev[e.channel_id] ?? []
      return {
        ...prev,
        [e.channel_id]: current.some(p => p.id === e.participant.id) ? current : [...current, e.participant],
      }
    })
  })

  useWSEvent<VoiceLeftEvent>('voice.left', (e) => {
    setVoiceParticipants(prev => ({
      ...prev,
      [e.channel_id]: (prev[e.channel_id] ?? []).filter(p => p.id !== e.identity_id),
    }))
  })

  useWSEvent<VoiceStateChangedEvent>('voice.state_changed', (e) => {
    setVoiceParticipants(prev => ({
      ...prev,
      [e.channel_id]: (prev[e.channel_id] ?? []).map(p => p.id === e.participant.id ? e.participant : p),
    }))
  })

  function hydrateVoiceParticipants(channelList: Channel[]) {
    channelList
      .filter(channel => channel.type === 'voice')
      .forEach(channel => {
        void api.voice.participants(channel.id)
          .then(res => setVoiceParticipants(prev => ({ ...prev, [channel.id]: res.participants })))
          .catch(() => undefined)
      })
  }

  async function toggleRoom(roomId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(roomId) ? next.delete(roomId) : next.add(roomId)
      return next
    })
    if (!channels[roomId] && selectedServerId) {
      try {
        const r = await api.channels.list(roomId)
        setChannels(prev => ({ ...prev, [roomId]: r.channels }))
        hydrateVoiceParticipants(r.channels)
        void clientCache.saveChannels(selectedServerId, roomId, r.channels)
      } catch {
        const cached = await clientCache.loadChannels(selectedServerId, roomId)
        if (cached) {
          setChannels(prev => ({ ...prev, [roomId]: cached }))
          hydrateVoiceParticipants(cached)
        }
      }
    }
  }

  function openModal(kind: ModalKind) {
    setMenuOpen(false)
    setFormError('')
    setCreatedInvite(null)
    setActiveModal(kind)
    if (kind === 'channel') setNewGroupName('')
    if (kind === 'profile') {
      setProfileDraft({
        display_name: identity?.display_name || identity?.username || '',
        avatar_url: identity?.avatar_url || '',
      })
    }
    if (kind === 'server') {
      setSettingsSection('general')
      void loadServerAdminState()
    }
  }

  async function loadServerAdminState() {
    if (!canManageServer) return
    setBusy(true)
    setFormError('')
    try {
      const [settings, permissionRes, identityRes] = await Promise.all([
        api.admin.getServerSettings(),
        api.admin.getPermissionSettings(),
        canManageIdentities ? api.admin.listIdentities() : Promise.resolve([]),
      ])
      setServerSettings(settings)
      setSettingsDraft({
        name: settings.name,
        description: settings.description || '',
        public_url: settings.public_url || '',
        avatar_url: settings.avatar_url || '',
      })
      setPermissionSettings(permissionRes.settings)
      setIdentities(identityRes)
      setRoleDrafts(Object.fromEntries(identityRes.map(item => [item.id, 'member'])))
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setBusy(false)
    }
  }

  async function handleLeaveServer() {
    if (!selectedServerId) return
    await removeServer(selectedServerId)
    setActiveModal(null)
  }

  async function refreshStructure() {
    if (!selectedServerId) return
    const r = await api.rooms.list()
    setRooms(r.rooms)
    setNewRoomGroupId(current => current || r.rooms[0]?.id || '')
    void clientCache.saveRooms(selectedServerId, r.rooms)
  }

  async function handleCreateGroup(e: FormEvent) {
    e.preventDefault()
    if (!newGroupName.trim()) return
    setCreatingStructure(true)
    setFormError('')
    try {
      const group = await api.rooms.create(newGroupName.trim(), 'text')
      setNewGroupName('')
      setActiveModal(null)
      setExpanded(prev => new Set(prev).add(group.id))
      await refreshStructure()
      const r = await api.channels.list(group.id)
      setChannels(prev => ({ ...prev, [group.id]: r.channels }))
      hydrateVoiceParticipants(r.channels)
      if (selectedServerId) void clientCache.saveChannels(selectedServerId, group.id, r.channels)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create channel')
    } finally {
      setCreatingStructure(false)
    }
  }

  async function handleCreateRoom(e: FormEvent) {
    e.preventDefault()
    const groupId = newRoomGroupId || rooms[0]?.id
    if (!groupId || !newRoomName.trim()) return
    setCreatingStructure(true)
    try {
      await api.channels.create(groupId, newRoomName.trim(), newRoomType)
      setNewRoomName('')
      setRoomCreateOpen(false)
      setExpanded(prev => new Set(prev).add(groupId))
      const r = await api.channels.list(groupId)
      setChannels(prev => ({ ...prev, [groupId]: r.channels }))
      hydrateVoiceParticipants(r.channels)
      if (selectedServerId) void clientCache.saveChannels(selectedServerId, groupId, r.channels)
    } finally {
      setCreatingStructure(false)
    }
  }

  async function handleCreateInvite(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      const invite = await api.invites.create(inviteMaxUses, inviteExpiry > 0 ? inviteExpiry : undefined)
      setCreatedInvite(invite)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create invite')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveServerSettings(e: FormEvent) {
    e.preventDefault()
    if (!selectedServerId) return
    setBusy(true)
    setFormError('')
    try {
      const settings = await api.admin.updateServerSettings(settingsDraft)
      const permissionRes = await api.admin.updatePermissionSettings(toSettingsRecord(permissionSettings))
      setServerSettings(settings)
      setPermissionSettings(permissionRes.settings)
      await updateServer(selectedServerId, {
        name: settings.name,
        avatar_url: settings.avatar_url || undefined,
      })
      setActiveModal(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save server settings')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    if (!profileDraft.display_name.trim()) return
    setBusy(true)
    setFormError('')
    try {
      const updated = await api.me.update(profileDraft.display_name.trim(), profileDraft.avatar_url.trim())
      setIdentity(updated)
      setActiveModal(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setBusy(false)
    }
  }

  async function assignRole(identityId: string) {
    const role = roleDrafts[identityId] || 'member'
    await api.admin.assignRole(identityId, role)
    await loadServerAdminState()
  }

  async function revokeRole(identityId: string, role: string) {
    await api.admin.revokeRole(identityId, role)
    await loadServerAdminState()
  }

  function openRoomCreate(groupId: string) {
    setNewRoomGroupId(groupId)
    setNewRoomName('')
    setNewRoomType('text')
    setRoomCreateOpen(true)
  }

  function togglePermissionRole(key: string, role: string, checked: boolean) {
    setPermissionSettings(prev => prev.map(setting => {
      if (setting.key !== key) return setting
      const roles = new Set(setting.roles)
      if (checked) roles.add(role)
      else roles.delete(role)
      return { ...setting, roles: ROLE_OPTIONS.filter(option => roles.has(option)) }
    }))
  }

  const initial = identity?.display_name?.[0]?.toUpperCase() ?? '?'

  if (!selectedServerId) {
    return (
      <div className="sidebar">
        <div className="sidebar-header" title={sidebarTitle}>
          <span className="sidebar-title-text">{sidebarTitle}</span>
        </div>
        <div className="sidebar-body">
          <div className="sidebar-empty">Select a server from the rail</div>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header" title={sidebarTitle}>
        <span className="sidebar-title-text">{sidebarTitle}</span>
        <div className="server-actions">
          <button type="button" className="btn-icon server-actions-toggle" title="Server actions" aria-label="Server actions" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
            {menuOpen ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
          </button>
          {menuOpen && (
            <div className="server-actions-menu" role="menu">
              {canCreateInvite && <button type="button" role="menuitem" onClick={() => openModal('invite')}>Invite to server</button>}
              {canManageServer && <button type="button" role="menuitem" onClick={() => openModal('server')}>Server settings</button>}
              {canManageChannels && <button type="button" role="menuitem" onClick={() => openModal('channel')}>Create channel</button>}
              <button type="button" role="menuitem" onClick={() => openModal('profile')}>Server profile</button>
              <button type="button" role="menuitem" className="danger" onClick={() => openModal('leave')}>Leave server</button>
            </div>
          )}
        </div>
      </div>
      <div className="sidebar-body">
        {permissions.includes('member.search') && <div className="sidebar-section"><NavLink to="/people" className={({ isActive }) => `channel-item${isActive ? ' active' : ''}`}><span className="channel-icon" aria-hidden="true"><Users /></span>People</NavLink></div>}
        {rooms.map(room => (
          <div key={room.id}>
            <div className="channel-group-row">
              <button type="button" className="channel-group-toggle" onClick={() => { void toggleRoom(room.id) }} aria-expanded={expanded.has(room.id)}>
                <span className="channel-group-caret" aria-hidden="true">{expanded.has(room.id) ? <ChevronDown /> : <ChevronRight />}</span>
                <span className="channel-group-name">{room.name}</span>
              </button>
              {canManageChannels && <button type="button" className="channel-group-add" title={`Create room in ${room.name}`} aria-label={`Create room in ${room.name}`} onClick={() => openRoomCreate(room.id)}>+</button>}
            </div>
            {expanded.has(room.id) && (channels[room.id] ?? []).map(ch => (
              <div key={ch.id} className="channel-entry">
                <NavLink to={`/channels/${ch.id}`} className={({ isActive }) => `channel-item${isActive ? ' active' : ''}`} style={{ paddingLeft: 24 }}>
                  <span className="channel-icon" aria-hidden="true">{ch.type === 'voice' ? <Mic /> : <Hash />}</span>
                  {ch.name}
                  {ch.type !== 'voice' && (unread[ch.id] ?? 0) > 0 && <span className="unread-badge">{(unread[ch.id] ?? 0) > 99 ? '99+' : unread[ch.id]}</span>}
                </NavLink>
                {ch.type === 'voice' && (voiceParticipants[ch.id] ?? []).length > 0 && (
                  <VoiceParticipantList participants={voiceParticipants[ch.id] ?? []} />
                )}
              </div>
            ))}
          </div>
        ))}
        {dmConvs.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-label">Direct Messages</div>
            {dmConvs.map(c => (
              <NavLink key={c.id} to={`/dm/${c.id}`} className={({ isActive }) => `channel-item${isActive ? ' active' : ''}`}>
                <span className="channel-icon" aria-hidden="true"><MessageCircle /></span>
                {c.peer.display_name || c.peer.username}
                {(unread[c.id] ?? 0) > 0 && <span className="unread-badge">{(unread[c.id] ?? 0) > 99 ? '99+' : unread[c.id]}</span>}
              </NavLink>
            ))}
          </div>
        )}
      </div>
      <div className="sidebar-user">
        <div className="user-avatar">{identity?.avatar_url ? <img src={identity.avatar_url} alt="" /> : initial}</div>
        <span className="user-name">{identity?.display_name || identity?.username}</span>
        <div className={`ws-dot${connected ? '' : ' offline'}`} title={connected ? 'Connected' : 'Reconnecting'} />
        <button className="btn-icon" title="Lock vault" aria-label="Lock vault" onClick={lock}><LockKeyhole aria-hidden="true" /></button>
      </div>

      {activeModal === 'leave' && <LeaveModal title={sidebarTitle} onCancel={() => setActiveModal(null)} onLeave={() => { void handleLeaveServer() }} />}
      {activeModal === 'invite' && (
        <div className="modal-backdrop" role="presentation" onClick={() => setActiveModal(null)}>
          <form className="modal action-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title" onSubmit={e => { void handleCreateInvite(e) }} onClick={e => e.stopPropagation()}>
            <ModalHeader id="invite-title" title="Invite to server" onClose={() => setActiveModal(null)} />
            <div className="modal-body">
              {formError && <div className="form-error">{formError}</div>}
              <label className="form-field" htmlFor="invite-max-uses"><span>Max uses</span><input id="invite-max-uses" type="number" min={1} value={inviteMaxUses} onChange={e => setInviteMaxUses(Number(e.target.value))} /></label>
              <label className="form-field" htmlFor="invite-expiry"><span>Expires in hours</span><input id="invite-expiry" type="number" min={0} value={inviteExpiry} onChange={e => setInviteExpiry(Number(e.target.value))} /></label>
              {createdInvite && <div className="result-box"><span>Invite code</span><strong>{createdInvite.code}</strong></div>}
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>Close</button><button type="submit" className="btn btn-primary" disabled={busy || inviteMaxUses < 1}>{busy ? 'Creating...' : 'Create invite'}</button></div>
            </div>
          </form>
        </div>
      )}
      {activeModal === 'channel' && (
        <div className="modal-backdrop" role="presentation" onClick={() => setActiveModal(null)}>
          <form className="modal action-modal" role="dialog" aria-modal="true" aria-labelledby="create-channel-title" onSubmit={e => { void handleCreateGroup(e) }} onClick={e => e.stopPropagation()}>
            <ModalHeader id="create-channel-title" title="Create channel" onClose={() => setActiveModal(null)} />
            <div className="modal-body">
              {formError && <div className="form-error">{formError}</div>}
              <label className="form-field" htmlFor="create-channel-name"><span>Channel name</span><input id="create-channel-name" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} maxLength={100} autoFocus /></label>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={creatingStructure || !newGroupName.trim()}>{creatingStructure ? 'Creating...' : 'Create channel'}</button></div>
            </div>
          </form>
        </div>
      )}
      {activeModal === 'profile' && identity && (
        <div className="modal-backdrop" role="presentation" onClick={() => setActiveModal(null)}>
          <form className="modal action-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onSubmit={e => { void handleSaveProfile(e) }} onClick={e => e.stopPropagation()}>
            <ModalHeader id="profile-title" title="Server profile" onClose={() => setActiveModal(null)} />
            <div className="modal-body">
              {formError && <div className="form-error">{formError}</div>}
              <label className="form-field" htmlFor="profile-display-name"><span>Display name</span><input id="profile-display-name" value={profileDraft.display_name} onChange={e => setProfileDraft(v => ({ ...v, display_name: e.target.value }))} maxLength={100} /></label>
              <AvatarImageField label="Profile avatar" value={profileDraft.avatar_url} onChange={avatar_url => setProfileDraft(v => ({ ...v, avatar_url }))} disabled={busy} />
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy || !profileDraft.display_name.trim()}>{busy ? 'Saving...' : 'Save profile'}</button></div>
            </div>
          </form>
        </div>
      )}
      {activeModal === 'server' && (
        <div className="modal-backdrop" role="presentation" onClick={() => setActiveModal(null)}>
          <form className="modal server-settings-modal" role="dialog" aria-modal="true" aria-labelledby="server-settings-title" onSubmit={e => { void handleSaveServerSettings(e) }} onClick={e => e.stopPropagation()}>
            <ModalHeader id="server-settings-title" title="Server settings" onClose={() => setActiveModal(null)} />
            <div className="modal-body server-settings-body">
              {busy && !serverSettings ? <div className="loading-state">Loading settings...</div> : (
                <>
                  {formError && <div className="form-error">{formError}</div>}
                  <div className="settings-layout">
                    <nav className="settings-nav" aria-label="Server settings categories">
                      <SettingsNavButton active={settingsSection === 'general'} icon={<Settings size={17} />} label="General" onClick={() => setSettingsSection('general')} />
                      <SettingsNavButton active={settingsSection === 'permissions'} icon={<ShieldCheck size={17} />} label="Permissions" onClick={() => setSettingsSection('permissions')} />
                      {canManageIdentities && <SettingsNavButton active={settingsSection === 'members'} icon={<Users size={17} />} label="Members" onClick={() => setSettingsSection('members')} />}
                    </nav>
                    <div className="settings-content">
                      {settingsSection === 'general' && <div className="settings-category"><h3>General</h3><label className="form-field" htmlFor="server-name"><span>Name</span><input id="server-name" value={settingsDraft.name} onChange={e => setSettingsDraft(v => ({ ...v, name: e.target.value }))} maxLength={100} /></label><label className="form-field" htmlFor="server-description"><span>Description</span><input id="server-description" value={settingsDraft.description} onChange={e => setSettingsDraft(v => ({ ...v, description: e.target.value }))} maxLength={500} /></label><label className="form-field" htmlFor="server-public-url"><span>Public URL</span><input id="server-public-url" value={settingsDraft.public_url} onChange={e => setSettingsDraft(v => ({ ...v, public_url: e.target.value }))} /></label><AvatarImageField label="Server avatar" value={settingsDraft.avatar_url} onChange={avatar_url => setSettingsDraft(v => ({ ...v, avatar_url }))} disabled={busy} /></div>}
                      {settingsSection === 'permissions' && <PermissionMatrix settings={permissionSettings} onToggle={togglePermissionRole} />}
                      {settingsSection === 'members' && canManageIdentities && <MemberRoleList identities={identities} roleDrafts={roleDrafts} canManageRoles={canManageRoles} onRoleDraft={(id, role) => setRoleDrafts(prev => ({ ...prev, [id]: role }))} onAssign={id => { void assignRole(id) }} onRevoke={(id, role) => { void revokeRole(id, role) }} />}
                    </div>
                  </div>
                  <div className="modal-actions settings-modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy || !settingsDraft.name.trim()}>{busy ? 'Saving...' : 'Save changes'}</button></div>
                </>
              )}
            </div>
          </form>
        </div>
      )}
      {roomCreateOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setRoomCreateOpen(false)}>
          <form className="modal room-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-room-title" onSubmit={e => { void handleCreateRoom(e) }} onClick={e => e.stopPropagation()}>
            <ModalHeader id="create-room-title" title="Create room" onClose={() => setRoomCreateOpen(false)} />
            <div className="modal-body">
              <label className="form-field" htmlFor="create-room-group"><span>Channel</span><select id="create-room-group" value={newRoomGroupId} onChange={e => setNewRoomGroupId(e.target.value)} disabled={rooms.length === 0}>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
              <label className="form-field" htmlFor="create-room-type"><span>Room type</span><select id="create-room-type" value={newRoomType} onChange={e => setNewRoomType(e.target.value as 'text' | 'voice')}><option value="text">Text</option><option value="voice">Voice</option></select></label>
              <label className="form-field" htmlFor="create-room-name"><span>Room name</span><input id="create-room-name" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} maxLength={100} autoFocus /></label>
              <div className="modal-actions"><button type="button" className="btn btn-secondary" onClick={() => setRoomCreateOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={creatingStructure || !newRoomName.trim() || rooms.length === 0}>{creatingStructure ? 'Creating...' : 'Create room'}</button></div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function ModalHeader({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return <div className="modal-header"><h2 id={id}>{title}</h2><button type="button" className="modal-close" aria-label="Close" onClick={onClose}>x</button></div>
}

function SettingsNavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" className={`settings-nav-button${active ? ' active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button>
}

function VoiceParticipantList({ participants }: { participants: Participant[] }) {
  return (
    <div className="voice-tree-participants">
      {participants.map(participant => (
        <div key={participant.id} className="voice-tree-participant">
          <span className="voice-tree-avatar">{participant.display_name?.[0]?.toUpperCase() ?? participant.username?.[0]?.toUpperCase() ?? '?'}</span>
          <span className="voice-tree-name">{participant.display_name || participant.username}</span>
          <span className="voice-tree-icons">
            {participant.muted && <span title="Muted">M</span>}
            {participant.deafened && <span title="Deafened">D</span>}
            {participant.camera_enabled && <span title="Camera on">C</span>}
            {participant.screen_sharing && <span title="Screen sharing">S</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

function LeaveModal({ title, onCancel, onLeave }: { title: string; onCancel: () => void; onLeave: () => void }) {
  return (
    <div className="confirm-backdrop" role="presentation" onClick={onCancel}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="leave-server-title" onClick={e => e.stopPropagation()}>
        <h2 id="leave-server-title">Leave server?</h2>
        <p>Remove {title} from this local profile. You can add it again later if you still have access.</p>
        <div className="confirm-actions"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button><button type="button" className="btn btn-danger" onClick={onLeave}>Leave server</button></div>
      </div>
    </div>
  )
}

function PermissionMatrix({ settings, onToggle }: { settings: PermissionSetting[]; onToggle: (key: string, role: string, checked: boolean) => void }) {
  if (settings.length === 0) return null
  return (
    <div className="settings-section">
      <h3>Permissions</h3>
      <div className="permission-grid">
        {settings.map(setting => (
          <div className="permission-row" key={setting.key}>
            <div className="permission-copy"><strong>{setting.label}</strong><span>{setting.key}</span></div>
            <div className="permission-roles">
              {ROLE_OPTIONS.map(role => <label key={role}><input type="checkbox" checked={setting.roles.includes(role)} onChange={e => onToggle(setting.key, role, e.target.checked)} />{role}</label>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MemberRoleList({
  identities, roleDrafts, canManageRoles, onRoleDraft, onAssign, onRevoke,
}: {
  identities: IdentitySummary[]
  roleDrafts: Record<string, string>
  canManageRoles: boolean
  onRoleDraft: (id: string, role: string) => void
  onAssign: (id: string) => void
  onRevoke: (id: string, role: string) => void
}) {
  return (
    <div className="settings-section">
      <h3>Members</h3>
      <div className="member-list">
        {identities.map(item => (
          <div className="member-row" key={item.id}>
            <div className="member-main"><strong>{item.display_name || item.username}</strong><span>{item.username}</span></div>
            <div className="role-chips">{item.roles.map(role => <button key={role} type="button" disabled={!canManageRoles || role === 'owner'} onClick={() => onRevoke(item.id, role)}>{role}</button>)}</div>
            {canManageRoles && <div className="role-assign"><select value={roleDrafts[item.id] || 'member'} onChange={e => onRoleDraft(item.id, e.target.value)}>{ROLE_OPTIONS.map(role => <option key={role} value={role}>{role}</option>)}</select><button type="button" className="btn btn-secondary" onClick={() => onAssign(item.id)}>Add</button></div>}
          </div>
        ))}
      </div>
    </div>
  )
}
