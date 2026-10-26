package policy

import "testing"

func TestCanAnyUsesDefaults(t *testing.T) {
	ReplaceOverrides(nil)
	if !CanAny([]string{"moderator"}, ModerateMessages) {
		t.Fatal("moderator should moderate messages by default")
	}
	if CanAny([]string{"guest"}, ModerateMessages) {
		t.Fatal("guest should not moderate messages by default")
	}
}

func TestCanAnyUsesOverrides(t *testing.T) {
	ReplaceOverrides(map[string][]string{"message.delete_any": []string{"owner"}})
	t.Cleanup(func() { ReplaceOverrides(nil) })

	if CanAny([]string{"moderator"}, ModerateMessages) {
		t.Fatal("moderator should not moderate messages after override")
	}
	if !CanAny([]string{"owner"}, ModerateMessages) {
		t.Fatal("owner should moderate messages after override")
	}
}

func TestEffectiveKeys(t *testing.T) {
	ReplaceOverrides(map[string][]string{"channel.create": []string{"owner"}})
	t.Cleanup(func() { ReplaceOverrides(nil) })

	for _, key := range EffectiveKeys([]string{"moderator"}) {
		if key == "channel.create" {
			t.Fatal("moderator should not have channel.create after override")
		}
	}
}

func TestSocialPermissionsUseIndependentRoleSettings(t *testing.T) {
	ReplaceOverrides(map[string][]string{
		"member.search":  {"guest"},
		"profile.view":   {"guest", "member"},
		"friend.request": {"member"},
		"dm.create":      {"moderator"},
	})
	t.Cleanup(func() { ReplaceOverrides(nil) })

	if !CanAny([]string{"guest"}, SearchMembers) || CanAny([]string{"member"}, SearchMembers) {
		t.Fatal("member search override must be evaluated independently")
	}
	if CanAny([]string{"member"}, CreateDirectMessages) || !CanAny([]string{"moderator"}, CreateDirectMessages) {
		t.Fatal("dm.create override must not inherit dm.send")
	}
}
