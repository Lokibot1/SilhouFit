import { useSearchParams } from 'react-router-dom'
import { AuthSplit } from '../../components/auth/AuthSplit'
import { SignUpForm } from '../../components/auth/SignUpForm'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { useSignUpForm } from '../../hooks/useSignUpForm'

const META_DESCRIPTION =
  'Create your KRAL account to save your fit profile, try clothes with AR fitting and shop boutiques online with one secure sign in. It takes a minute.'

export function SignUpPage() {
  useDocumentTitle('Sign up — KRAL')
  useMetaDescription(META_DESCRIPTION)
  const next = useSearchParams()[0].get('next')
  const form = useSignUpForm({ next })

  return (
    <AuthSplit photo={form.status !== 'success'}>
      <SignUpForm form={form} nextParam={next} />
    </AuthSplit>
  )
}
