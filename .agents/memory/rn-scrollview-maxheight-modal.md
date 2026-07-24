---
name: ScrollView inside a maxHeight modal card never scrolls
description: Yoga flexShrink:0 default makes ScrollViews overflow maxHeight containers instead of scrolling
---

A ScrollView inside a container with `maxHeight` (e.g. a bottom-sheet modal card at `maxHeight:"88%"`) will NOT scroll when content is long: RN/Yoga children default to `flexShrink: 0`, so the ScrollView keeps its full content height, overflows the cap, and viewport == content height means native scrolling never engages.

**Fix:** `style={{ flexShrink: 1 }}` on the ScrollView. Identical behavior on iOS and Android.

**Why:** saved-itinerary detail modal shipped unscrollable; three sibling modals (crew picker, vehicle picker, add/edit vehicle) had the same latent bug.

**How to apply:** any vertical ScrollView whose ancestor uses `maxHeight` needs `flexShrink: 1`. SECOND gotcha (proven on-device): a Touchable ancestor (e.g. TouchableOpacity backdrop/card wrapper) intermittently blocks the native scroll pan — the JS responder grant beats slow drag starts, so it "sometimes scrolls, mostly doesn't", worst on Android New Arch. Never wrap a ScrollView in a Touchable; for tap-to-dismiss sheets use a plain View container with an absolute-fill Pressable backdrop and the card as a sibling View on top. Pinned footers (action rows) belong outside the ScrollView.
