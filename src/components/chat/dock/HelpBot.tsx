import { useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCurrentUser } from '../../../hooks/useCurrentUser'
import { useSection } from '../../../hooks/useSection'
import { CHAT_BRAND_NAME } from '../../../service/chatApi'
import { addUserMessage, openChat, replyAfter, useHelpSession, type HelpChip, type HelpMessage } from '../../../service/chatDock'
import { HELP_CATEGORIES, HELP_CATEGORY_LABELS, listPublicAnswers, type PublicHelpAnswer } from '../../../service/helpAnswers'
import { matchAnswers } from '../../../utils/helpMatch'
import { isStaffRole } from '../../../utils/staffRole'
import { SectionError } from '../../staff/StaffSection'
import { SECONDARY_BUTTON } from '../../ui/buttonStyles'
import { ChatSkeleton } from '../ChatSkeleton'
import { Composer } from '../Composer'

const MAX_QUESTION_LENGTH = 200
const REPLY_DELAY_MS = 500
const START_CHIPS = 4
const CATEGORY_CHIPS = 5

const BUBBLE = 'max-w-[85%] min-w-0 rounded-xl px-3 py-2 text-base leading-6 md:text-sm [overflow-wrap:anywhere] whitespace-pre-wrap'
const BOT_BUBBLE = `${BUBBLE} border border-line bg-canvas-sub text-fg`
const CHIP = 'font-ui min-h-11 cursor-pointer rounded-xl border border-line-strong bg-canvas px-3 py-2 text-left text-base leading-5 text-fg hover:bg-fg/10 md:text-sm'

const askChip = (answer: PublicHelpAnswer): HelpChip => ({ label: answer.question, action: { type: 'ask', answerId: answer.id } })
const TOPICS_CHIP: HelpChip = { label: 'Browse topics', action: { type: 'topics' } }
const REPHRASE_CHIP: HelpChip = { label: 'Rephrase', action: { type: 'rephrase' } }
const HUMAN_CHIP: HelpChip = { label: 'Talk to a person', action: { type: 'human' } }

function Bubble({ message }: { message: HelpMessage }) {
  return message.from === 'user' ? (
    <li className="flex justify-end">
      <p className={`${BUBBLE} bg-fg text-canvas`}>{message.text}</p>
    </li>
  ) : (
    <li className="flex flex-col items-start gap-1">
      <p className={BOT_BUBBLE}>{message.text}</p>
      {message.link && (
        <Link to={message.link.to} className="font-ui flex min-h-11 items-center px-1 text-base font-semibold text-fg underline underline-offset-2 hover:text-chrome-strong md:text-sm">
          {message.link.label}
        </Link>
      )}
    </li>
  )
}

/** The people-hand-off: a guest signs in first, a customer opens their chat with the store. Staff are never offered it. */
function useTalkToAPerson() {
  const user = useCurrentUser()
  const navigate = useNavigate()
  return {
    offered: !isStaffRole(user?.role),
    talk: () => (user ? openChat('mine', { name: CHAT_BRAND_NAME }) : navigate('/login?next=%2Fmessages')),
  }
}

function Conversation({ answers }: { answers: PublicHelpAnswer[] }) {
  const { messages, typing } = useHelpSession()
  const { offered, talk } = useTalkToAPerson()
  const reduced = useReducedMotion()
  const root = useRef<HTMLDivElement>(null)
  const log = useRef<HTMLDivElement>(null)
  const delay = reduced ? 0 : REPLY_DELAY_MS
  const handoff = offered ? [HUMAN_CHIP] : []

  // The newest message stays in view; the log takes focus when the box opens, so a keyboard user lands inside it.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [messages, typing])
  useEffect(() => log.current?.focus(), [])

  function ask(answer: PublicHelpAnswer) {
    addUserMessage(answer.question)
    const related = answers.filter((a) => a.id !== answer.id && a.category === answer.category).slice(0, 3)
    replyAfter(delay, { text: answer.answer, link: answer.link, chips: related.length ? related.map(askChip) : [TOPICS_CHIP] })
  }

  function topics() {
    addUserMessage(TOPICS_CHIP.label)
    const present = HELP_CATEGORIES.filter((c) => answers.some((a) => a.category === c))
    replyAfter(delay, { text: 'Pick a topic.', chips: present.map((category) => ({ label: HELP_CATEGORY_LABELS[category], action: { type: 'category', category } })) })
  }

  function category(name: (typeof HELP_CATEGORIES)[number]) {
    addUserMessage(HELP_CATEGORY_LABELS[name])
    const inTopic = answers.filter((a) => a.category === name).slice(0, CATEGORY_CHIPS)
    replyAfter(delay, { text: `Here is what I can answer about ${HELP_CATEGORY_LABELS[name].toLowerCase()}.`, chips: [...inTopic.map(askChip), TOPICS_CHIP] })
  }

  function type(text: string) {
    addUserMessage(text)
    const { best, related } = matchAnswers(text, answers)
    if (best) replyAfter(delay, { text: best.answer, link: best.link, chips: related.map(askChip) })
    else if (related.length) replyAfter(delay, { text: 'Did you mean one of these?', chips: related.map(askChip) })
    else replyAfter(delay, { text: "I don't have an answer for that yet.", chips: [...handoff, REPHRASE_CHIP] })
  }

  function press({ action }: HelpChip) {
    // The chips are replaced by the answer's, so focus moves to the conversation instead of being lost.
    if (action.type !== 'rephrase') log.current?.focus()
    if (action.type === 'ask') ask(answers.find((a) => a.id === action.answerId)!)
    else if (action.type === 'topics') topics()
    else if (action.type === 'category') category(action.category)
    else if (action.type === 'human') talk()
    else root.current?.querySelector('textarea')?.focus()
  }

  const last = messages.at(-1)
  const chips = messages.length === 0 ? [...answers.slice(0, START_CHIPS).map(askChip), TOPICS_CHIP] : last?.from === 'bot' ? (last.chips ?? []) : []

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col">
      <div ref={log} role="log" tabIndex={0} aria-label="KRAL Help conversation" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <ul className="grid gap-3">
          <li className="flex justify-start">
            <p className={BOT_BUBBLE}>Hi, I&apos;m KRAL Help. I can answer common questions about orders, shipping, returns and sizing. Pick one below or type your question.</p>
          </li>
          {messages.map((message) => (
            <Bubble key={message.id} message={message} />
          ))}
          {typing && (
            <li className="flex justify-start">
              <p role="status" className={`${BOT_BUBBLE} text-fg-muted`}>
                KRAL Help is typing…
              </p>
            </li>
          )}
        </ul>
        {chips.length > 0 && !typing && (
          <div role="group" aria-label="Suggested replies" className="mt-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button key={`${chip.action.type}-${chip.label}`} type="button" onClick={() => press(chip)} className={CHIP}>
                {chip.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <Composer onSend={type} sending={typing} maxLength={MAX_QUESTION_LENGTH} publishOffset={false} />
    </div>
  )
}

/** The "KRAL Help" box: answers from the saved list only, by chips or typed questions. Loads the published answers itself, with its own loading, error and empty states. */
export function HelpBot() {
  const section = useSection(listPublicAnswers)
  const { offered, talk } = useTalkToAPerson()
  const { state, retry } = section

  const handoff = offered && (
    <button type="button" onClick={talk} className={SECONDARY_BUTTON}>
      Talk to a person
    </button>
  )

  if (state.status === 'loading') return <ChatSkeleton compact />
  if (state.status === 'error') {
    return (
      <div className="grid content-start gap-4 p-3">
        <SectionError what="the help answers" kind={state.kind} onRetry={retry} />
        {handoff}
      </div>
    )
  }
  if (state.data.length === 0) {
    return (
      <div className="grid content-start gap-3 p-3">
        <div>
          <p className="text-base font-semibold text-fg">No saved answers yet</p>
          <p className="mt-1 text-base text-fg-muted md:text-sm">There is nothing for me to look up right now.</p>
        </div>
        {handoff}
      </div>
    )
  }
  return <Conversation answers={state.data} />
}
