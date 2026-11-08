// Below lg a step is a column that fills the screen: the explanation scrolls and the field with Back and Next stays at the
// bottom, above the on-screen keyboard. From lg up both simply flow in the card.
export const STEP_BODY = 'max-lg:-mx-1 max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-y-auto max-lg:px-1'
// The build and measurement steps are also pinned on desktop: the card matches the sticky avatar's height and only its options scroll.
export const STEP_BODY_PINNED = 'lg:min-h-0 lg:flex-1 lg:overflow-y-auto'
export const STEP_CARD_PINNED = 'lg:h-[calc(100svh-9rem)]'
export const STEP_FOOTER = 'max-lg:shrink-0 max-lg:border-t max-lg:border-kral-rule max-lg:pt-3 lg:mt-6'
