import type { ReactNode } from 'react'
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { C } from '../../src/theme/tokens'

/**
 * The same palette the web uses, in React Native's idiom.
 *
 * `C` is the shared token object — plain data, which is why it crosses to a
 * platform with no CSS at all. What cannot cross is the layout: the web's
 * `tokens.css` is class-based and Metro has no stylesheet, so these are the
 * handful of shapes the phone screens need, written once here rather than
 * inline in every screen.
 */

/** The spec's 44px minimum, as a constant rather than a number people remember. */
export const TAP = 44

export function Screen({
  children,
  scroll = true,
  pad = 20,
}: {
  children: ReactNode
  scroll?: boolean
  pad?: number
}) {
  const inner = (
    <View style={{ paddingHorizontal: pad, paddingBottom: 28, paddingTop: 8, flexGrow: 1 }}>
      {children}
    </View>
  )
  return (
    <SafeAreaView style={s.screen} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  )
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.title, style]}>{children}</Text>
}

export function Sub({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.sub, style]}>{children}</Text>
}

export function Kicker({ children }: { children: ReactNode }) {
  return <Text style={s.kicker}>{children}</Text>
}

export function Card({
  children,
  style,
  tone = 'plain',
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  tone?: 'plain' | 'green' | 'ochre' | 'clay'
}) {
  return <View style={[s.card, TONES[tone], style]}>{children}</View>
}

const TONES: Record<string, ViewStyle> = {
  plain: { backgroundColor: C.white, borderColor: C.line },
  green: { backgroundColor: C.gTint, borderColor: C.gBorder },
  ochre: { backgroundColor: C.ochreBg, borderColor: C.ochreBorder },
  clay: { backgroundColor: C.clayBg, borderColor: C.clay },
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  style,
}: {
  label: string
  onPress: () => void
  kind?: 'primary' | 'secondary' | 'quiet'
  disabled?: boolean
  busy?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const off = disabled || busy
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off) }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        s.button,
        kind === 'primary' && { backgroundColor: C.g },
        kind === 'secondary' && { backgroundColor: C.white, borderWidth: 1, borderColor: C.line3 },
        kind === 'quiet' && { backgroundColor: 'transparent' },
        off && { opacity: 0.55 },
        pressed && !off && { opacity: 0.85 },
        style,
      ]}
    >
      {busy && <ActivityIndicator color={kind === 'primary' ? '#F2F7F4' : C.g} />}
      <Text
        style={[
          s.buttonLabel,
          kind === 'primary' ? { color: '#F2F7F4' } : { color: kind === 'quiet' ? C.mut : C.ink },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** A tappable row — the phone's whole navigation vocabulary, near enough. */
export function Pick({
  head,
  sub,
  onPress,
  tone = 'plain',
}: {
  head: string
  sub?: string
  onPress: () => void
  tone?: 'plain' | 'green' | 'ochre' | 'clay'
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [s.card, TONES[tone], s.pick, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.pickHead}>{head}</Text>
        {sub ? <Text style={s.pickSub}>{sub}</Text> : null}
      </View>
      <Text style={{ color: C.faint, fontSize: 20 }}>›</Text>
    </Pressable>
  )
}

/** Key on the left, value on the right — the card, the ledger, the summary. */
export function RecordRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={[s.recordRow, last && { borderBottomWidth: 0 }]}>
      <Text style={s.recordKey}>{k}</Text>
      <Text style={s.recordValue}>{v}</Text>
    </View>
  )
}

/**
 * The standing mark when the app is running on fixtures.
 *
 * The same decision as the web's badge: a build with no API configured shows
 * invented figures, and nothing on the screen used to say so. Somebody read the
 * product for an hour and concluded the backend was not connected — they were
 * right about what they were looking at.
 */
export function FixtureBadge({ live }: { live: boolean }) {
  if (live) return null
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>Demo data · no API configured</Text>
    </View>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surface },
  title: { fontSize: 25, fontWeight: '700', letterSpacing: -0.5, color: C.ink },
  sub: { fontSize: 14.5, lineHeight: 21, color: C.mut, marginTop: 6 },
  kicker: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.3, color: C.faint, marginTop: 22,
    textTransform: 'uppercase',
  },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, marginTop: 10 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: TAP + 16 },
  pickHead: { fontSize: 16, fontWeight: '600', color: C.ink },
  pickSub: { fontSize: 13, lineHeight: 19, color: C.mut, marginTop: 2 },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    minHeight: 52, borderRadius: 11, paddingHorizontal: 20,
  },
  buttonLabel: { fontSize: 16.5, fontWeight: '600' },
  recordRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 14,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#EFEEE8',
  },
  recordKey: { fontSize: 13.5, color: C.mut, flexShrink: 1 },
  recordValue: { fontSize: 14.5, fontWeight: '600', color: C.ink, textAlign: 'right', flexShrink: 1 },
  badge: {
    position: 'absolute', bottom: 12, alignSelf: 'center', zIndex: 50,
    backgroundColor: C.ochreBg, borderWidth: 1, borderColor: C.ochreBorder,
    borderRadius: 99, paddingHorizontal: 13, paddingVertical: 6,
  },
  badgeText: { fontSize: 11.5, fontWeight: '600', color: C.ochreInk },
})
