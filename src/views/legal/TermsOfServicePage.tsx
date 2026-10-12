import {
  LegalPageLayout,
  LegalSection,
} from '../../components/legal/LegalPageLayout'
import { TERMS } from '../../components/legal/legalContent'

export function TermsOfServicePage() {
  return (
    <LegalPageLayout
      title={TERMS.title}
      lastUpdated={TERMS.lastUpdated}
      scopeNote={TERMS.scopeNote}
    >
      {TERMS.sections.map(({ heading, body }) => (
        <LegalSection key={heading} heading={heading}>
          {body}
        </LegalSection>
      ))}
    </LegalPageLayout>
  )
}
