import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useAuth } from '../../../src/api/auth'
import { useApi } from '../../../src/api/provider'
import { toE164 } from '../../../src/data/member'
import { C } from '../../../src/theme/tokens'
import { Button, Card, Screen, Sub, Title } from '../ui'

/**
 * Phone number, then the code that arrives by SMS.
 *
 * The same two calls the web makes, through the same `useAuth` — nothing about
 * signing in is different on a handset except the keyboard. What is different
 * is what happens afterwards: the refresh token goes into MMKV bound to this
 * device, so opening the app tomorrow does not cost another SMS. On ₦100 of
 * airtime that is not a convenience.
 */
export function SignInScreen({ onIn }: { onIn: () => void }) {
  const { live } = useApi()
  const { requestCode, submitCode, error, clearError } = useAuth()

  const [msisdn, setMsisdn] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState('')

  const ask = async () => {
    if (!live) return onIn()
    setBusy(true)
    clearError()
    try {
      const challenge = await requestCode(toE164(msisdn))
      setChallengeId(challenge.challengeId)
      setSentTo(toE164(msisdn))
      // The development build echoes the code back rather than sending it, so
      // a demo works with no SMS account. A production API never does — see
      // ProductionSafetyCheck, which refuses to start if it is switched on.
      if (challenge.devCode) setCode(challenge.devCode)
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (!challengeId) return
    setBusy(true)
    try {
      if (await submitCode(challengeId, code)) onIn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <View style={s.mark}>
        <Text style={s.markText}>CSP</Text>
      </View>
      <Title style={{ marginTop: 20 }}>Civil Servant Protect</Title>
      <Sub>
        {challengeId
          ? `We sent a six-digit code to ${sentTo}.`
          : 'Your phone number is your account. We send a code to it.'}
      </Sub>

      {challengeId === null ? (
        <>
          <Card style={{ marginTop: 20 }}>
            <Text style={s.label}>Phone number</Text>
            <TextInput
              style={s.input}
              value={msisdn}
              onChangeText={setMsisdn}
              placeholder="0803 000 0214"
              placeholderTextColor={C.ghost2}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              accessibilityLabel="Phone number"
            />
          </Card>
          <Button
            label="Send me a code"
            onPress={() => void ask()}
            busy={busy}
            disabled={msisdn.replace(/\D/g, '').length < 10}
            style={{ marginTop: 14 }}
          />
        </>
      ) : (
        <>
          <Card style={{ marginTop: 20 }}>
            <Text style={s.label}>The code</Text>
            <TextInput
              style={[s.input, s.codeInput]}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              placeholder="······"
              placeholderTextColor={C.ghost2}
              keyboardType="number-pad"
              // Android fills this from the SMS itself, which saves the member
              // leaving the app to read it.
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              accessibilityLabel="The six-digit code"
            />
          </Card>
          <Button
            label="Continue"
            onPress={() => void verify()}
            busy={busy}
            disabled={code.length < 6}
            style={{ marginTop: 14 }}
          />
          <Button
            label="Use a different number"
            kind="quiet"
            onPress={() => {
              setChallengeId(null)
              setCode('')
              clearError()
            }}
            style={{ marginTop: 4 }}
          />
        </>
      )}

      {error ? (
        <Card tone="clay" style={{ marginTop: 14 }}>
          <Text style={{ color: C.clayInk, fontSize: 14, lineHeight: 20 }}>{error}</Text>
        </Card>
      ) : null}

      {!live && (
        <Card tone="ochre" style={{ marginTop: 18 }}>
          <Text style={{ color: C.ochreInk, fontSize: 13.5, lineHeight: 20 }}>
            This build has no API address, so it runs on demo data. Set CSP_API_URL and rebuild to
            sign in for real.
          </Text>
        </Card>
      )}
    </Screen>
  )
}

const s = StyleSheet.create({
  mark: {
    width: 54, height: 54, borderRadius: 15, backgroundColor: C.g,
    alignItems: 'center', justifyContent: 'center', marginTop: 40,
  },
  markText: { color: C.surface, fontSize: 18, fontWeight: '700', letterSpacing: 0.5 },
  label: { fontSize: 12, color: C.mut, marginBottom: 6 },
  input: {
    fontSize: 19, color: C.ink, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: C.line3, borderRadius: 9, backgroundColor: C.surface,
    minHeight: 52,
  },
  codeInput: { fontSize: 26, letterSpacing: 8, textAlign: 'center' },
})
