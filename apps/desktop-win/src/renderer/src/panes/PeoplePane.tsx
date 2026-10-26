import React, { useEffect, useState } from 'react'
import { MessageCircle, Search, UserPlus, Users } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { PublicProfile } from '../api/types'

const MAX_MEMBER_RESULTS = 200
const MAX_SEARCH_LENGTH = 80

export default function PeoplePane() {
  const { memberId } = useParams<{ memberId?: string }>(); const navigate = useNavigate()
  const [query,setQuery]=useState(''); const [members,setMembers]=useState<PublicProfile[]>([]); const [selected,setSelected]=useState<PublicProfile|null>(null); const [error,setError]=useState('')
  useEffect(()=>{const timer=setTimeout(()=>{void api.social.searchMembers(query).then(r=>setMembers(r.members.slice(0,MAX_MEMBER_RESULTS))).catch(()=>setError('People discovery is unavailable or restricted by your role.'))},220);return()=>clearTimeout(timer)},[query])
  useEffect(()=>{if(!memberId){setSelected(null);return}void api.social.getMember(memberId).then(setSelected).catch(()=>setError('Profile not found.'))},[memberId])
  async function startDM(){if(!selected)return;const c=await api.dm.start(selected.id);navigate(`/dm/${c.id}`)}
  async function addFriend(){if(!selected)return;setSelected(await api.social.changeFriendship(selected.id,'request'))}
  return <div className="people-pane"><div className="channel-header"><Users/> People</div><div className="people-layout"><section className="people-directory glass-inner"><label className="people-search"><Search/><input value={query} maxLength={MAX_SEARCH_LENGTH} onChange={e=>setQuery(e.target.value)} placeholder="Search server members"/></label>{error&&<div className="people-state people-error">{error}</div>}<div className="people-group"><h3>Server members</h3>{members.map(item=><button className="people-row" key={item.id} onClick={()=>navigate(`/people/${item.id}`)}><span className="people-avatar">{item.avatar_url?<img src={item.avatar_url} alt=""/>:item.display_name[0]?.toUpperCase()}</span><span><strong>{item.display_name}</strong><small>@{item.username}</small></span></button>)}</div></section><section className="profile-panel glass-soft">{!selected?<div className="profile-empty"><Users/><strong>Select a member</strong><span>Open a server profile to message or add them.</span></div>:<><div className="profile-banner"/><div className="profile-content"><div className="profile-avatar">{selected.avatar_url?<img src={selected.avatar_url} alt=""/>:selected.display_name[0]?.toUpperCase()}</div><h2>{selected.display_name}</h2><div className="profile-username">@{selected.username}</div><div className="profile-roles">{selected.roles.map(role=><span className={`role-chip role-${role}`} key={role}>{role}</span>)}</div><div className="profile-actions"><button className="btn btn-primary" onClick={()=>{void startDM()}}><MessageCircle/> Message</button>{selected.relationship==='none'&&<button className="btn" onClick={()=>{void addFriend()}}><UserPlus/> Add friend</button>}</div></div></>}</section></div></div>
}
