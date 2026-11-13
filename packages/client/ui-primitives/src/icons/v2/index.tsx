/**
 * 24-grid product icon set: 24×24 viewBox, 1.5px stroke, round caps and joins,
 * 2px padding, currentColor. Consumers pass \`size\` to render smaller; the
 * geometry and stroke stay fixed so every glyph keeps the same optical weight.
 */
import type { ReactNode } from 'react'
import type { IconProps } from '../props.ts'

/** Stroke width shared by every glyph on the 24 grid. */
export const ICON_V2_STROKE = 1.5

/** Square edge of the drawn grid; callers scale it down through \`size\`. */
export const ICON_V2_GRID = 24

interface SvgProps extends IconProps {
  /** Glyph geometry. */
  children: ReactNode
}

/** One 24-grid frame; every glyph inherits the stroke treatment from here. */
function IconFrame({ size = ICON_V2_GRID, className, children }: SvgProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      stroke="currentColor"
      strokeWidth={ICON_V2_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

/** Chevron pointing down. */
export const IconChevronDown = (props: IconProps) => (
  <IconFrame {...props}><path d="M6 9.5 12 15.5 18 9.5" /></IconFrame>
)

/** Chevron pointing up. */
export const IconChevronUp = (props: IconProps) => (
  <IconFrame {...props}><path d="M6 14.5 12 8.5 18 14.5" /></IconFrame>
)

/** Chevron pointing right. */
export const IconChevronRight = (props: IconProps) => (
  <IconFrame {...props}><path d="M9.5 6 15.5 12 9.5 18" /></IconFrame>
)

/** Dismiss a surface or clear a value. */
export const IconClose = (props: IconProps) => (
  <IconFrame {...props}><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" /></IconFrame>
)

/** Confirm a choice or a completed step. */
export const IconCheck = (props: IconProps) => (
  <IconFrame {...props}><path d="M5 12.5 9.4 16.9 19 6.8" /></IconFrame>
)

/** Add an item or open a composer action. */
export const IconPlus = (props: IconProps) => (
  <IconFrame {...props}><path d="M12 5.5v13M5.5 12h13" /></IconFrame>
)

/** Find text or a session. */
export const IconSearch = (props: IconProps) => (
  <IconFrame {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M15.8 15.8 20 20" />
  </IconFrame>
)

/** Open settings. */
export const IconSettings = (props: IconProps) => (
  <IconFrame {...props}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 4v2.2M12 17.8V20M4 12h2.2M17.8 12H20M6.3 6.3l1.6 1.6M16.1 16.1l1.6 1.6M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6" />
  </IconFrame>
)

/** Send the composer draft. */
export const IconSend = (props: IconProps) => (
  <IconFrame {...props}>
    <path d="M20.5 3.5 3.6 10.2l6.8 3.4 3.4 6.8 6.7-16.9Z" />
    <path d="M10.4 13.6 20.5 3.5" />
  </IconFrame>
)

/** Delete an item. */
export const IconTrash = (props: IconProps) => (
  <IconFrame {...props}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9L17.5 7" />
    <path d="M10 10.5v6M14 10.5v6" />
  </IconFrame>
)

/** Edit a value or a document. */
export const IconEdit = (props: IconProps) => (
  <IconFrame {...props}>
    <path d="M4 20l1.2-4.2L16.4 4.6a2.1 2.1 0 0 1 3 3L8.2 18.8 4 20Z" />
    <path d="M14.4 6.6l3 3" />
  </IconFrame>
)

/** Branch a conversation or a workspace. */
export const IconBranch = (props: IconProps) => (
  <IconFrame {...props}>
    <circle cx="6.5" cy="5.5" r="2.2" />
    <circle cx="6.5" cy="18.5" r="2.2" />
    <circle cx="17.5" cy="9" r="2.2" />
    <path d="M6.5 7.7v8.6M17.5 11.2v1a3 3 0 0 1-3 3h-5" />
  </IconFrame>
)

/** Browse the wider web or a global scope. */
export const IconGlobe = (props: IconProps) => (
  <IconFrame {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="M4 12h16M12 4c2.8 3.4 2.8 12.6 0 16M12 4c-2.8 3.4-2.8 12.6 0 16" />
  </IconFrame>
)

/** A stored data set. */
export const IconDatabase = (props: IconProps) => (
  <IconFrame {...props}>
    <ellipse cx="12" cy="6" rx="7" ry="2.8" />
    <path d="M5 6v12c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8V6" />
    <path d="M5 12c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8" />
  </IconFrame>
)

/** A model provider endpoint or key. */
export const IconApi = (props: IconProps) => (
  <IconFrame {...props}>
    <path d="M8 4.5H6.5A2 2 0 0 0 4.5 6.5v3.2L2.8 12l1.7 2.3v3.2a2 2 0 0 0 2 2H8" />
    <path d="M16 4.5h1.5a2 2 0 0 1 2 2v3.2l1.7 2.3-1.7 2.3v3.2a2 2 0 0 1-2 2H16" />
    <path d="M9.5 12h5" />
  </IconFrame>
)

/** Reasoning or a thinking step. */
export const IconThink = (props: IconProps) => (
  <IconFrame {...props}>
    <path d="M8.5 18.5a5 5 0 0 1-1.3-9.8 4.6 4.6 0 0 1 8.9-1.2 4 4 0 0 1 .4 8" />
    <path d="M8.5 18.5h6.5a3.5 3.5 0 0 0 1.5-6.7" />
    <path d="M10 21h3" />
  </IconFrame>
)

/** A planned step or checklist. */
export const IconPlan = (props: IconProps) => (
  <IconFrame {...props}>
    <path d="M9 6.5h10.5M9 12h10.5M9 17.5h10.5" />
    <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
  </IconFrame>
)

/** A queued follow-up message. */
export const IconQueue = (props: IconProps) => (
  <IconFrame {...props}>
    <rect x="4" y="4.5" width="16" height="4" rx="2" />
    <rect x="4" y="10" width="16" height="4" rx="2" />
    <rect x="4" y="15.5" width="10" height="4" rx="2" />
  </IconFrame>
)

/** Browse for a file or a directory. */
export const IconBrowse = (props: IconProps) => (
  <IconFrame {...props}>
    <path d="M3.5 8V6.2a1.7 1.7 0 0 1 1.7-1.7h4l2 2h6.6a1.7 1.7 0 0 1 1.7 1.7V9" />
    <path d="M3.2 9.5h17.6l-1.6 9.2a1.7 1.7 0 0 1-1.7 1.4H6.5a1.7 1.7 0 0 1-1.7-1.4L3.2 9.5Z" />
  </IconFrame>
)

/** Inject context into the conversation. */
export const IconContextInjection = (props: IconProps) => (
  <IconFrame {...props}>
    <path d="M9.5 7.5H7a4 4 0 0 0 0 8h2.5M14.5 7.5H17a4 4 0 0 1 0 8h-2.5" />
    <path d="M8.5 12h7" />
  </IconFrame>
)

/** A warning that needs attention. */
export const IconWarning = (props: IconProps) => (
  <IconFrame {...props}>
    <path d="M12 4 2.9 20h18.2L12 4Z" />
    <path d="M12 10v4.2M12 17.2h.01" />
  </IconFrame>
)

/** A highlight or generated suggestion. */
export const IconSparkle = (props: IconProps) => (
  <IconFrame {...props}>
    <path d="M12 3.5 14.1 9.9 20.5 12l-6.4 2.1L12 20.5 9.9 14.1 3.5 12l6.4-2.1L12 3.5Z" />
  </IconFrame>
)

/** Ask for help or more detail. */
export const IconQuestion = (props: IconProps) => (
  <IconFrame {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="M9.7 9.6a2.4 2.4 0 1 1 3.5 2.2c-.8.4-1.2 1-1.2 1.8v.4" />
    <path d="M12 17.2h.01" />
  </IconFrame>
)

/** The agent composition preset. */
export const IconAgentPreset = (props: IconProps) => (
  <IconFrame {...props}>
    <path d="M12 2.8v3.4" />
    <rect x="4.5" y="6.2" width="15" height="11.6" rx="3" />
    <path d="M8.8 11.2h.01M15.2 11.2h.01M9.5 15h5" />
    <path d="M9 17.8v2.4M15 17.8v2.4" />
  </IconFrame>
)

/** The signed-in person or a profile choice. */
export const IconPersonalization = (props: IconProps) => (
  <IconFrame {...props}>
    <circle cx="12" cy="8.8" r="3.6" />
    <path d="M4.8 20c1.3-3.7 4-5.4 7.2-5.4s5.9 1.7 7.2 5.4" />
  </IconFrame>
)
