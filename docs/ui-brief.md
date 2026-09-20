# UI context: Froggie the Helper

Use this as the design brief or paste it into a UI-generation tool.

## Product

Froggie privately notices low-risk situations in a consenting person's email where community help might be useful. Froggie first asks that person through iMessage. A request is never shared until the person explicitly confirms or edits it.

Once approved, the request is posted to relevant helper groups and a general community feed. A volunteer can claim the project, help the person, complete it, and earn fun points.

The service is for anyone who could use occasional help. A person may be both a help-seeker and a helper.

## Personality

Kind, cheerful, whimsical, neighborly, and dignity-preserving. Froggie should feel like an encouraging community mascot, never a surveillance product, charity bureaucracy, childish toy, or competitive gig marketplace.

## Visual direction

- Polished cozy maximalism
- Froggie mascot with light pond and garden motifs
- Soft greens, warm cream, and coral or yellow highlights
- Rounded cards and controls with expressive but readable typography
- Small illustrations, stamps, badges, and delightful micro-interactions
- Mobile-first while retaining a useful desktop community dashboard
- Avoid generic SaaS gradients, crypto aesthetics, corporate dashboards, and excessive glassmorphism

## Language

Use “help request,” “small project,” “helper,” and “community.” Avoid “case,” “patient,” “beneficiary,” and “task worker.”

Possible lines:

- “A little help goes a long way.”
- “Small projects. Real neighbors. Better days.”
- “Froggie found something your community might be able to help with.”
- “Nothing is shared until you say so.”
- “Hop in and lend a hand.”

## Roles

### Person receiving help

- Connects Gmail and iMessage
- Receives a private suggestion from Froggie
- Approves, edits, or dismisses it
- Chooses remote/in-person and sharing details
- Sees when a helper claims it
- Confirms completion

### Community helper

- Selects skills, location, remote/in-person preference, and availability
- Browses matching projects and a general feed
- Claims a project
- Sees active and completed projects
- Earns playful points and badges
- Chooses whether their leaderboard identity is public or anonymous

## Initial skill groups

- Coding
- Website building
- 3D printing
- Planning
- Meeting people / companionship
- Food and groceries
- General help

## Safety

- Never publish an inferred problem automatically.
- The requester must confirm or edit a suggestion first.
- Exclude emergencies, medical care, money transfers, childcare, credentials, and other high-risk requests.
- Always show whether a project is remote or in person.
- Never expose private email text to helpers; show only the requester-approved summary.

## Primary demo story

Margaret has a normal email conversation with her son. One message suggests a safe, concrete need: help making a small website for her gardening group.

Froggie sends Margaret a private iMessage:

> I noticed you mentioned wanting a simple page for the garden club. Would you like me to ask the community for help?

Margaret approves or edits it. The request appears in Website Building and the general community feed. A helper claims it, completes it, Margaret confirms completion, and the helper earns points.

## Screens

### Landing page

- Explain Froggie in under five seconds.
- Present “I could use a hand” and “I want to help” paths.
- Show the trust statement “Nothing is shared until you say so.”
- Include a short three-step explanation.

### Requester onboarding

- Name and iMessage registration
- Gmail read-only connection
- Clear explanation of what is scanned, stored, and never shared
- Consent and connection success states

### Helper onboarding

- Skill chips
- Remote, in-person, or both
- Community/location
- Availability
- Public name or anonymous leaderboard identity

### Community project feed

- Matching projects first and a general community section
- Skill, remote/in-person, and availability filters
- Cards containing only the approved summary, category, approximate location, expected effort, and status
- No raw email content

### Project detail

- Clear request and boundaries
- “I can help” action and claim confirmation
- Contact/handoff information revealed only at the appropriate stage
- Open → Claimed → In progress → Awaiting confirmation → Complete

### My projects

- Helper's claimed and completed projects
- Requester's approved, active, and completed requests

### Points and leaderboard

- Points total, badges, contribution streaks, and completed projects
- Public or anonymous entries
- Celebrate contribution without shaming low participation
- No monetary value

### Private request confirmation

- Suggested summary
- Edit, approve, and dismiss actions
- Strong “Nothing has been shared yet” reassurance

## Design-system requirements

- WCAG-conscious contrast
- Large touch targets and visible focus states
- Reduced-motion support
- Responsive layouts
- Empty, loading, success, error, and privacy states
- Reusable cards, skill chips, status pills, badges, and Froggie callouts

Prioritize the golden-path demo over settings and administration.
