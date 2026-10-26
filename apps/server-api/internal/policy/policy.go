package policy

import "sync"

type Action int

const (
	CreateInvite Action = iota
	ManageRoles
	ManageIdentities
	ManageChannels
	ManageServer
	DeleteServer
	ModerateMessages
	MuteMembers
	KickMembers
	SendMessages
	ReadMessages
	AttachFiles
	JoinVoice
	SearchMembers
	ViewProfiles
	RequestFriends
	CreateDirectMessages
	SendDirectMessages
)

type ActionDefinition struct {
	Action       Action   `json:"-"`
	Key          string   `json:"key"`
	Label        string   `json:"label"`
	Description  string   `json:"description"`
	DefaultRoles []string `json:"default_roles"`
}

var seedRoles = []string{"owner", "admin", "moderator", "member", "guest"}

var definitions = []ActionDefinition{
	{CreateInvite, "invite.create", "Create invites", "Create server invite links.", []string{"owner", "admin"}},
	{ManageRoles, "role.manage", "Manage roles", "Assign and revoke roles.", []string{"owner", "admin"}},
	{ManageIdentities, "identity.manage", "Manage identities", "View, disable, and enable identities.", []string{"owner", "admin"}},
	{ManageChannels, "channel.create", "Create channels and rooms", "Create, update, reorder, and delete channel groups and rooms.", []string{"owner", "admin"}},
	{ManageServer, "server.manage", "Manage server", "Update server settings and operational settings.", []string{"owner", "admin"}},
	{DeleteServer, "server.delete", "Delete server", "Owner-level destructive server actions.", []string{"owner"}},
	{ModerateMessages, "message.delete_any", "Delete others' messages", "Delete messages sent by other identities.", []string{"owner", "admin", "moderator"}},
	{MuteMembers, "voice.mute_others", "Mute others", "Mute other voice participants.", []string{"owner", "admin", "moderator"}},
	{KickMembers, "member.kick", "Kick members", "Kick or remove members.", []string{"owner", "admin", "moderator"}},
	{SendMessages, "message.send", "Send messages", "Send text messages.", []string{"owner", "admin", "moderator", "member"}},
	{ReadMessages, "message.read", "Read messages", "Read room message history.", []string{"owner", "admin", "moderator", "member", "guest"}},
	{AttachFiles, "file.upload", "Upload files", "Upload message attachments.", []string{"owner", "admin", "moderator", "member"}},
	{JoinVoice, "voice.join", "Join voice", "Join voice rooms.", []string{"owner", "admin", "moderator", "member", "guest"}},
	{SearchMembers, "member.search", "Search members", "Find active members on this server.", []string{"owner", "admin", "moderator", "member"}},
	{ViewProfiles, "profile.view", "View profiles", "Open public server member profiles.", []string{"owner", "admin", "moderator", "member", "guest"}},
	{RequestFriends, "friend.request", "Manage friends", "Send and respond to server-local friend requests.", []string{"owner", "admin", "moderator", "member"}},
	{CreateDirectMessages, "dm.create", "Start direct messages", "Start a direct-message conversation from a member profile.", []string{"owner", "admin", "moderator", "member"}},
	{SendDirectMessages, "dm.send", "Send direct messages", "Send messages in existing direct-message conversations.", []string{"owner", "admin", "moderator", "member"}},
}

var (
	defByAction = map[Action]ActionDefinition{}
	defByKey    = map[string]ActionDefinition{}
	mu          sync.RWMutex
	overrides   = map[Action]map[string]bool{}
)

func init() {
	for _, def := range definitions {
		defByAction[def.Action] = def
		defByKey[def.Key] = def
	}
}

func SeedRoles() []string {
	return append([]string{}, seedRoles...)
}

func Definitions() []ActionDefinition {
	out := make([]ActionDefinition, len(definitions))
	copy(out, definitions)
	return out
}

func IsKnownAction(key string) bool {
	_, ok := defByKey[key]
	return ok
}

func IsSeedRole(role string) bool {
	for _, seed := range seedRoles {
		if seed == role {
			return true
		}
	}
	return false
}

func ActionForKey(key string) (Action, bool) {
	def, ok := defByKey[key]
	return def.Action, ok
}

func Key(action Action) string {
	return defByAction[action].Key
}

func ReplaceOverrides(next map[string][]string) {
	parsed := map[Action]map[string]bool{}
	for key, roles := range next {
		action, ok := ActionForKey(key)
		if !ok {
			continue
		}
		parsed[action] = rolesToSet(roles)
	}

	mu.Lock()
	overrides = parsed
	mu.Unlock()
}

func SnapshotSettings() map[string][]string {
	mu.RLock()
	defer mu.RUnlock()

	out := map[string][]string{}
	for _, def := range definitions {
		if roles, ok := overrides[def.Action]; ok {
			out[def.Key] = setToRoles(roles)
			continue
		}
		out[def.Key] = append([]string{}, def.DefaultRoles...)
	}
	return out
}

func EffectiveKeys(roles []string) []string {
	var keys []string
	for _, def := range definitions {
		if CanAny(roles, def.Action) {
			keys = append(keys, def.Key)
		}
	}
	return keys
}

func Can(role string, action Action) bool {
	mu.RLock()
	roleSet, ok := overrides[action]
	mu.RUnlock()
	if ok {
		return roleSet[role]
	}
	return rolesToSet(defByAction[action].DefaultRoles)[role]
}

func CanAny(roles []string, action Action) bool {
	for _, r := range roles {
		if Can(r, action) {
			return true
		}
	}
	return false
}

func rolesToSet(roles []string) map[string]bool {
	out := map[string]bool{}
	for _, role := range roles {
		out[role] = true
	}
	return out
}

func setToRoles(set map[string]bool) []string {
	var out []string
	for _, role := range seedRoles {
		if set[role] {
			out = append(out, role)
		}
	}
	return out
}
