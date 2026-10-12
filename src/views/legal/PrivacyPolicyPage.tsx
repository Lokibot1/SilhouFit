import {
  LegalPageLayout,
  LegalSection,
} from '../../components/legal/LegalPageLayout'
import { PRIVACY } from '../../components/legal/legalContent'

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title={PRIVACY.title}
      lastUpdated={PRIVACY.lastUpdated}
      scopeNote={PRIVACY.scopeNote}
    >
      {PRIVACY.sections.map(({ heading, body }) => (
        <LegalSection key={heading} heading={heading}>
          {body}
        </LegalSection>
      ))}
    </LegalPageLayout>
  )
}
