import React, { useEffect, useMemo, useState } from 'react'
import { MessageCircle, Search, UserCheck, UserPlus, Users, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { PublicProfile } from '../api/types'

const MAX_MEMBER_RESULTS = 200
const MAX_SEARCH_LENGTH = 80

export default function PeoplePane() {
  const { memberId } = useParams<{ memberId?: string }>()
  const { identity } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [members, setMembers] = useState<PublicProfile[]>([])
  const [relationships, setRelationships] = useState<PublicProfile[]>([])
  const [selected, setSelected] = useState<PublicProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh(search = query) {
    setLoading(true); setError('')
    try {
      const [memberRes, friendRes] = await Promise.all([api.social.searchMembers(search), api.social.listFriends()])
      setMembers(memberRes.members.slice(0, MAX_MEMBER_RESULTS)); setRelationships(friendRes.relationships.slice(0, MAX_MEMBER_RESULTS))
    } catch { setError('People discovery is unavailable or restricted by your role.') }
    finally { setLoading(false) }
  }

  useEffect(() => { const timer = setTimeout(() => { void refresh(query) }, 220); return () => clearTimeout(timer) }, [query])
  useEffect(() => { if (!memberId) { setSelected(null); return }; void api.social.getMember(memberId).then(setSelected).catch(() => setError('Profile not found.')) }, [memberId])

  async function change(action: 'request'|'accept'|'decline'|'cancel'|'remove'|'block'|'unblock') {
    if (!selected) return
    const next = await api.social.changeFriendship(selected.id, action)
    setSelected(next); await refresh()
  }

  async function startDM() {
    if (!selected) return
    const conversation = await api.dm.start(selected.id)
    navigate(`/dm/${conversation.id}`)
  }

  const friends = useMemo(() => relationships.filter(item => item.relationship === 'accepted'), [relationships])
  const incoming = useMemo(() => relationships.filter(item => item.relationship === 'pending' && item.relationship_direction === 'incoming'), [relationships])

  return <div className="people-pane">
    <div className="channel-header"><Users aria-hidden="true" /> People</div>
    <div className="people-layout">
      <section className="people-directory glass-inner">
        <label className="people-search"><Search aria-hidden="true" /><input value={query} maxLength={MAX_SEARCH_LENGTH} onChange={e => setQuery(e.target.value)} placeholder="Search server members" aria-label="Search server members" /></label>
        {incoming.length > 0 && <PeopleGroup title={`Pending — ${incoming.length}`} items={incoming} onOpen={id => navigate(`/people/${id}`)} />}
        {!query && friends.length > 0 && <PeopleGroup title="Friends" items={friends} onOpen={id => navigate(`/people/${id}`)} />}
        <PeopleGroup title={query ? 'Search results' : 'Server members'} items={members} onOpen={id => navigate(`/people/${id}`)} />
        {loading && <div className="people-state">Loading…</div>}
        {!loading && error && <div className="people-state people-error">{error}</div>}
      </section>
      <section className="profile-panel glass-soft">
        {!selected ? <div className="profile-empty"><Users /><strong>Select a member</strong><span>Open a server profile to message or add them.</span></div> : <>
          <div className="profile-banner" />
          <div className="profile-content">
            <div className="profile-avatar">{selected.avatar_url ? <img src={selected.avatar_url} alt="" /> : selected.display_name[0]?.toUpperCase()}</div>
            <h2>{selected.display_name}</h2><div className="profile-username">@{selected.username}</div>
            <div className="profile-roles">{selected.roles.map(role => <span className={`role-chip role-${role}`} key={role}>{role}</span>)}</div>
            {selected.id !== identity?.id && <div className="profile-actions">
              <button className="btn btn-primary" onClick={() => { void startDM() }}><MessageCircle /> Message</button>
              {selected.relationship === 'none' && <button className="btn" onClick={() => { void change('request') }}><UserPlus /> Add friend</button>}
              {selected.relationship === 'pending' && selected.relationship_direction === 'incoming' && <><button className="btn" onClick={() => { void change('accept') }}><UserCheck /> Accept</button><button className="btn btn-ghost" onClick={() => { void change('decline') }}><X /> Decline</button></>}
              {selected.relationship === 'pending' && selected.relationship_direction === 'outgoing' && <button className="btn btn-ghost" onClick={() => { void change('cancel') }}>Cancel request</button>}
              {selected.relationship === 'accepted' && <button className="btn btn-ghost" onClick={() => { void change('remove') }}>Remove friend</button>}
              {selected.relationship === 'blocked' ? <button className="btn btn-ghost" onClick={() => { void change('unblock') }}>Unblock</button> : <button className="btn btn-ghost" onClick={() => { void change('block') }}>Block</button>}
            </div>}
          </div>
        </>}
      </section>
    </div>
  </div>
}

function PeopleGroup({ title, items, onOpen }: { title: string; items: PublicProfile[]; onOpen: (id: string) => void }) {
  return <div className="people-group"><h3>{title}</h3>{items.map(item => <button className="people-row" key={item.id} onClick={() => onOpen(item.id)}><span className="people-avatar">{item.avatar_url ? <img src={item.avatar_url} alt="" /> : item.display_name[0]?.toUpperCase()}</span><span><strong>{item.display_name}</strong><small>@{item.username}</small></span>{item.relationship === 'accepted' && <UserCheck aria-label="Friend" />}</button>)}</div>
}
