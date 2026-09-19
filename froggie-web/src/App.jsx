import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Award,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Compass,
  Heart,
  Home,
  Laptop,
  Leaf,
  ListFilter,
  MapPin,
  MessageCircleHeart,
  PackageOpen,
  Pencil,
  Printer,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Star,
  Trophy,
  UserRound,
  UsersRound,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import {
  clearIMessageSetup,
  formatPhone,
  getPhotonStatus,
  loadIMessageSetup,
  requestPhotonVerification,
  saveIMessageSetup,
  validateIMessageIdentity,
  verifyPhotonCode,
} from './lib/imessageSetup.js'

const categories = [
  { name: 'All projects', icon: Compass },
  { name: 'Coding', icon: Code2 },
  { name: 'Website building', icon: Laptop },
  { name: '3D printing', icon: Printer },
  { name: 'Planning', icon: CalendarDays },
  { name: 'Companionship', icon: UsersRound },
  { name: 'Food & groceries', icon: ShoppingBasket },
  { name: 'General help', icon: Heart },
]

const communityLocations = [
  { label: 'Oakland, CA', detail: 'Alameda County' },
  { label: 'Berkeley, CA', detail: 'Alameda County' },
  { label: 'Alameda, CA', detail: 'Alameda County' },
  { label: 'Emeryville, CA', detail: 'Alameda County' },
  { label: 'San Leandro, CA', detail: 'Alameda County' },
  { label: 'Hayward, CA', detail: 'Alameda County' },
  { label: 'Fremont, CA', detail: 'Alameda County' },
  { label: 'Richmond, CA', detail: 'Contra Costa County' },
  { label: 'Walnut Creek, CA', detail: 'Contra Costa County' },
  { label: 'Concord, CA', detail: 'Contra Costa County' },
  { label: 'San Francisco, CA', detail: 'San Francisco County' },
  { label: 'Daly City, CA', detail: 'San Mateo County' },
  { label: 'South San Francisco, CA', detail: 'San Mateo County' },
  { label: 'San Mateo, CA', detail: 'San Mateo County' },
  { label: 'Redwood City, CA', detail: 'San Mateo County' },
  { label: 'Palo Alto, CA', detail: 'Santa Clara County' },
  { label: 'Mountain View, CA', detail: 'Santa Clara County' },
  { label: 'Sunnyvale, CA', detail: 'Santa Clara County' },
  { label: 'San Jose, CA', detail: 'Santa Clara County' },
  { label: 'Remote, anywhere', detail: 'Online community' },
]

const projects = [
  {
    id: 1,
    title: 'A simple page for our garden club',
    summary: 'Help Margaret turn the club schedule and a few favorite photos into a friendly one-page website.',
    category: 'Website building',
    location: 'Remote',
    effort: '2–3 hours',
    requester: 'Margaret',
    match: 'Great match',
    tone: 'garden',
    posted: '18 min ago',
  },
  {
    id: 2,
    title: 'Print replacement knobs for a radio',
    summary: 'A neighbor has the measurements and would love help preparing and printing two small knobs.',
    category: '3D printing',
    location: 'Oakland · In person',
    effort: 'About 1 hour',
    requester: 'Anonymous neighbor',
    match: 'Near you',
    tone: 'print',
    posted: '42 min ago',
  },
  {
    id: 3,
    title: 'Plan a low-key community potluck',
    summary: 'Help organize a simple sign-up sheet and a checklist for our apartment courtyard potluck.',
    category: 'Planning',
    location: 'Remote',
    effort: '1–2 hours',
    requester: 'Dani',
    match: 'New',
    tone: 'potluck',
    posted: '1 hr ago',
  },
  {
    id: 4,
    title: 'Grocery pickup after a busy week',
    summary: 'Pick up a prepaid grocery order and bring it a few blocks to a neighbor’s front desk.',
    category: 'Food & groceries',
    location: 'Berkeley · In person',
    effort: '30–45 min',
    requester: 'Lee',
    match: 'This weekend',
    tone: 'groceries',
    posted: '2 hrs ago',
  },
  {
    id: 5,
    title: 'Make a spreadsheet less confusing',
    summary: 'Clean up a volunteer roster and add a clear summary tab so the whole group can use it.',
    category: 'General help',
    location: 'Remote',
    effort: 'About 1 hour',
    requester: 'Priya',
    match: 'Good fit',
    tone: 'spreadsheet',
    posted: 'Today',
  },
  {
    id: 6,
    title: 'Practice for a first video call',
    summary: 'Do a friendly test run of Zoom and help a neighbor feel ready for a family reunion call.',
    category: 'Companionship',
    location: 'Remote',
    effort: '30 minutes',
    requester: 'Anonymous neighbor',
    match: 'Flexible',
    tone: 'call',
    posted: 'Today',
  },
]

const leaders = [
  { rank: 1, name: 'SunnySideUp', points: 1240, projects: 21, initials: 'SS', color: 'yellow', badge: 'Good Egg' },
  { rank: 2, name: 'Jules M.', points: 1085, projects: 18, initials: 'JM', color: 'coral', badge: 'Steady Sprout' },
  { rank: 3, name: 'Anonymous tadpole', points: 960, projects: 16, initials: 'AT', color: 'blue', badge: 'Quiet Hero' },
  { rank: 4, name: 'Theo R.', points: 875, projects: 14, initials: 'TR', color: 'green', badge: 'Neighborly' },
  { rank: 5, name: 'Mina K.', points: 720, projects: 12, initials: 'MK', color: 'pink', badge: 'Helping Hand' },
]

function FrogMark({ compact = false }) {
  return (
    <span className={`frog-mark ${compact ? 'frog-mark--compact' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 60 48" role="img">
        <circle cx="18" cy="14" r="9" fill="currentColor" />
        <circle cx="42" cy="14" r="9" fill="currentColor" />
        <ellipse cx="30" cy="28" rx="24" ry="17" fill="currentColor" />
        <circle cx="18" cy="13" r="3" fill="#fffdf6" />
        <circle cx="42" cy="13" r="3" fill="#fffdf6" />
        <path d="M20 29c5 6 15 6 20 0" fill="none" stroke="#fffdf6" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function Header({ view, setView, onOpenOnboarding }) {
  const [open, setOpen] = useState(false)
  const nav = [
    ['community', 'Find projects'],
    ['my-projects', 'My projects'],
    ['leaderboard', 'Good-deed garden'],
  ]
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <button className="brand-button" onClick={() => setView('home')} aria-label="Froggie the Helper home">
          <FrogMark />
          <span className="brand-wordmark">froggie<span>the helper</span></span>
        </button>
        <nav className="desktop-nav" aria-label="Main navigation">
          {nav.map(([key, label]) => (
            <button key={key} className={view === key ? 'nav-link active' : 'nav-link'} onClick={() => setView(key)}>{label}</button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="button button--ghost desktop-only" onClick={() => onOpenOnboarding('requester')}>I could use a hand</button>
          <button className="button button--primary" onClick={() => onOpenOnboarding('helper')}>Hop in to help <ArrowRight size={17} aria-hidden="true" /></button>
          <button className="menu-button mobile-only" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Toggle menu">
            {open ? <X aria-hidden="true" /> : <span className="menu-lines" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="mobile-menu" aria-label="Mobile navigation">
          {nav.map(([key, label]) => (
            <button key={key} onClick={() => { setView(key); setOpen(false) }}>{label}<ChevronRight size={18} /></button>
          ))}
          <button onClick={() => { onOpenOnboarding('requester'); setOpen(false) }}>I could use a hand<ChevronRight size={18} /></button>
        </nav>
      )}
    </header>
  )
}

function ProjectArt({ tone }) {
  const art = {
    garden: { icon: Leaf, label: 'Garden club website illustration', className: 'art--garden' },
    print: { icon: Printer, label: '3D printing illustration', className: 'art--print' },
    potluck: { icon: UtensilsCrossed, label: 'Community potluck illustration', className: 'art--potluck' },
    groceries: { icon: ShoppingBasket, label: 'Grocery pickup illustration', className: 'art--groceries' },
    spreadsheet: { icon: Laptop, label: 'Spreadsheet help illustration', className: 'art--sheet' },
    call: { icon: MessageCircleHeart, label: 'Friendly video call illustration', className: 'art--call' },
  }[tone]
  const Icon = art.icon
  return (
    <div className={`project-art ${art.className}`} role="img" aria-label={art.label}>
      <span className="art-sun" />
      <span className="art-hill art-hill--one" />
      <span className="art-hill art-hill--two" />
      <span className="art-icon"><Icon size={34} strokeWidth={1.8} aria-hidden="true" /></span>
      <span className="art-spark art-spark--one">✦</span>
      <span className="art-spark art-spark--two">✦</span>
    </div>
  )
}

function ProjectCard({ project, onOpen, claimed }) {
  return (
    <article className="project-card">
      <button className="card-hit" onClick={() => onOpen(project)} aria-label={`View ${project.title}`} />
      <ProjectArt tone={project.tone} />
      <div className="project-card__body">
        <div className="card-topline">
          <span className="match-pill"><Sparkles size={13} aria-hidden="true" /> {claimed ? 'Claimed by you' : project.match}</span>
          <span className="posted">{project.posted}</span>
        </div>
        <h3>{project.title}</h3>
        <p>{project.summary}</p>
        <div className="meta-row">
          <span><MapPin size={15} aria-hidden="true" />{project.location}</span>
          <span><Clock3 size={15} aria-hidden="true" />{project.effort}</span>
        </div>
        <div className="card-footer">
          <span className="category-label">{project.category}</span>
          <span className="circle-arrow" aria-hidden="true"><ArrowRight size={18} /></span>
        </div>
      </div>
    </article>
  )
}

function HomeView({ setView, onOpenOnboarding, onOpenProject, claimedIds, onToast }) {
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('All projects')
  const filtered = projects.filter((project) => {
    const categoryMatch = activeCategory === 'All projects' || project.category === activeCategory
    const searchMatch = `${project.title} ${project.summary} ${project.category}`.toLowerCase().includes(query.toLowerCase())
    return categoryMatch && searchMatch
  })

  function handleSearch(event) {
    event.preventDefault()
    setView('community')
    onToast(query ? `Showing community projects related to “${query}”.` : 'Showing all open community projects.')
  }

  return (
    <main>
      <section className="hero">
        <div className="pond-shape pond-shape--right" aria-hidden="true" />
        <div className="pond-shape pond-shape--left" aria-hidden="true" />
        <div className="lily lily--one" aria-hidden="true"><span /></div>
        <div className="lily lily--two" aria-hidden="true"><span /></div>
        <div className="shell hero-inner">
          <h1>A little help<br /><em>goes a long way.</em></h1>
          <p className="hero-copy">Froggie helps neighbors turn everyday needs into small, safe community projects, always with permission first.</p>
          <div className="hero-actions">
            <button className="button button--primary button--large" onClick={() => onOpenOnboarding('requester')}>I could use a hand <Heart size={18} aria-hidden="true" /></button>
            <button className="button button--outline button--large" onClick={() => onOpenOnboarding('helper')}>I want to help <ArrowRight size={18} aria-hidden="true" /></button>
          </div>
          <form className="search-bar" onSubmit={handleSearch}>
            <Search size={23} aria-hidden="true" />
            <label className="sr-only" htmlFor="project-search">Search community projects</label>
            <input id="project-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What would you like to help with?" />
            <button type="submit">Find a project <ArrowRight size={18} aria-hidden="true" /></button>
          </form>
          <div className="hero-proof" aria-label="Community activity">
            <div className="avatar-stack"><span>JM</span><span>AT</span><span>SR</span></div>
            <p><strong>143 neighbors</strong> lent a hand this month</p>
          </div>
        </div>
        <div className="hero-frog" aria-hidden="true">
          <div className="speech-bubble">Ready when you are!</div>
          <div className="frog-body"><FrogMark compact /><span className="frog-arm frog-arm--left" /><span className="frog-arm frog-arm--right" /></div>
          <div className="lily-pad" />
        </div>
      </section>

      <section className="category-strip" aria-labelledby="browse-title">
        <div className="shell">
          <div className="section-heading compact-heading">
            <div><span className="eyebrow">Find your fit</span><h2 id="browse-title">Ways to lend a hand</h2></div>
            <button className="text-link" onClick={() => setView('community')}>See all projects <ArrowRight size={17} /></button>
          </div>
          <div className="category-row" role="list" aria-label="Project categories">
            {categories.map(({ name, icon: Icon }) => (
              <button key={name} className={activeCategory === name ? 'category-tile active' : 'category-tile'} onClick={() => setActiveCategory(name)}>
                <span><Icon size={24} aria-hidden="true" /></span>{name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="projects-section">
        <div className="shell">
          <div className="section-heading">
            <div><span className="eyebrow">Fresh from the pond</span><h2>Small projects, real neighbors</h2><p>Requester-approved summaries only. Private email text stays private.</p></div>
            <div className="section-count">{filtered.length} open</div>
          </div>
          {filtered.length ? (
            <div className="project-grid">
              {filtered.slice(0, 6).map((project) => <ProjectCard key={project.id} project={project} onOpen={onOpenProject} claimed={claimedIds.includes(project.id)} />)}
            </div>
          ) : (
            <div className="empty-state"><FrogMark compact /><h3>No projects in this patch yet</h3><p>Try another category, or check back after the next ripple.</p><button className="button button--outline" onClick={() => setActiveCategory('All projects')}>Show all projects</button></div>
          )}
        </div>
      </section>

      <section className="consent-section">
        <div className="shell consent-grid">
          <div className="consent-copy">
            <span className="eyebrow">Permission comes first</span>
            <h2>Froggie notices.<br />You decide.</h2>
            <p>If an everyday email hints that community help might be useful, Froggie sends a private suggestion. Nothing appears in the community until you approve or edit it.</p>
            <ul className="check-list">
              <li><Check size={18} /> Read-only Gmail connection</li>
              <li><Check size={18} /> No raw email text shared</li>
              <li><Check size={18} /> Dismiss any suggestion, no questions asked</li>
            </ul>
            <button className="button button--dark" onClick={() => onOpenOnboarding('requester')}>See how privacy works <ArrowRight size={17} /></button>
          </div>
          <RequestConfirmationCard onToast={onToast} />
        </div>
      </section>

      <section className="how-section">
        <div className="shell">
          <div className="section-heading centered"><div><span className="eyebrow">Simple by design</span><h2>Three little hops to help</h2></div></div>
          <div className="steps-grid">
            <div className="step-card"><span className="step-number">1</span><MessageCircleHeart aria-hidden="true" /><h3>A private suggestion</h3><p>Froggie checks in through iMessage when it spots a safe, specific way the community may help.</p></div>
            <div className="step-card featured"><span className="step-number">2</span><Pencil aria-hidden="true" /><h3>You approve the words</h3><p>Edit, approve, or dismiss. You choose the summary, location detail, and what gets shared.</p></div>
            <div className="step-card"><span className="step-number">3</span><UsersRound aria-hidden="true" /><h3>A neighbor hops in</h3><p>A matched helper claims the project, completes it, and earns cheerful community points.</p></div>
          </div>
        </div>
      </section>

      <section className="garden-section">
        <div className="shell garden-card">
          <div className="garden-illustration" aria-hidden="true"><span className="flower f1">✿</span><span className="flower f2">✿</span><span className="flower f3">✿</span><FrogMark compact /></div>
          <div className="garden-copy"><span className="eyebrow">The good-deed garden</span><h2>Helping should feel joyful, not competitive.</h2><p>Collect badges, grow a contribution streak, and celebrate people who show up. Be public, use a nickname, or stay anonymous.</p><button className="button button--primary" onClick={() => setView('leaderboard')}>Visit the garden <Trophy size={18} /></button></div>
          <div className="mini-score"><span>This week</span><strong>486</strong><small>kindness points grown</small></div>
        </div>
      </section>
    </main>
  )
}

function RequestConfirmationCard({ onToast }) {
  const [status, setStatus] = useState('draft')
  const [editing, setEditing] = useState(false)
  const [summary, setSummary] = useState('A simple one-page website for my gardening group, including our meeting dates and a few photos.')
  return (
    <div className="message-demo" aria-live="polite">
      <div className="message-header"><div className="message-avatar"><FrogMark compact /></div><div><strong>Froggie</strong><span>Private suggestion · just now</span></div><ShieldCheck size={20} aria-label="Private" /></div>
      {status === 'dismissed' ? (
        <div className="message-success"><Leaf size={34} /><h3>Suggestion tucked away</h3><p>Nothing was shared. Froggie won’t ask again about this conversation.</p><button className="button button--outline" onClick={() => setStatus('draft')}>View demo again</button></div>
      ) : status === 'approved' ? (
        <div className="message-success"><BadgeCheck size={36} /><h3>Ready for the community</h3><p>Your approved summary will be shared in Website building. Private email details stay private.</p><button className="button button--outline" onClick={() => setStatus('draft')}>Reset demo</button></div>
      ) : (
        <>
          <div className="imessage-bubble">I noticed you mentioned wanting a simple page for the garden club. Would you like me to ask the community for help?</div>
          <div className="privacy-note"><ShieldCheck size={17} /><div><strong>Nothing has been shared yet.</strong><span>You’re always in control.</span></div></div>
          <div className="suggestion-box">
            <span className="field-label">Suggested summary</span>
            {editing ? <textarea aria-label="Edit suggested summary" value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} /> : <p>{summary}</p>}
            <div className="suggestion-meta"><span><Laptop size={15} /> Website building</span><span><MapPin size={15} /> Remote</span></div>
          </div>
          <div className="message-actions">
            <button className="button button--primary" onClick={() => { if (editing) { setEditing(false); onToast('Your edits are saved privately.'); } else { setStatus('approved'); onToast('Approved. Your summary is ready for the community.'); } }}>{editing ? 'Save edits' : 'Approve request'} <Check size={17} /></button>
            <button className="button button--outline" onClick={() => setEditing(!editing)}>{editing ? 'Cancel' : 'Edit'} <Pencil size={16} /></button>
            <button className="button button--quiet" onClick={() => setStatus('dismissed')}>Dismiss</button>
          </div>
        </>
      )}
    </div>
  )
}

function CommunityView({ onOpenProject, claimedIds }) {
  const [query, setQuery] = useState('')
  const [skill, setSkill] = useState('All projects')
  const [mode, setMode] = useState('Any format')
  const [showFilters, setShowFilters] = useState(false)
  const filtered = projects.filter((p) => (skill === 'All projects' || p.category === skill) && (mode === 'Any format' || p.location.includes(mode)) && `${p.title} ${p.summary}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <main className="dashboard-page">
      <section className="dashboard-hero"><div className="shell"><span className="eyebrow">Community pond</span><h1>Find a small project<br />that feels like you.</h1><p>Matches come first, then the whole community. Every card uses a requester-approved summary.</p>
        <div className="feed-search"><Search size={21} /><label className="sr-only" htmlFor="feed-search">Search projects</label><input id="feed-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" /><button onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}><ListFilter size={18} /> Filters</button></div>
      </div></section>
      <section className="feed-section"><div className="shell feed-layout">
        <aside className={showFilters ? 'filter-panel open' : 'filter-panel'}><div className="filter-title"><strong>Filter the pond</strong><button onClick={() => { setSkill('All projects'); setMode('Any format'); }}>Reset</button></div>
          <fieldset><legend>Skill</legend>{categories.slice(0, 7).map(({name}) => <label key={name}><input type="radio" name="skill" checked={skill === name} onChange={() => setSkill(name)} /><span>{name}</span></label>)}</fieldset>
          <fieldset><legend>Format</legend>{['Any format','Remote','In person'].map((name) => <label key={name}><input type="radio" name="mode" checked={mode === name} onChange={() => setMode(name)} /><span>{name}</span></label>)}</fieldset>
          <div className="safety-callout"><ShieldCheck size={20} /><div><strong>Low-risk projects only</strong><p>No emergencies, medical care, childcare, or money transfers.</p></div></div>
        </aside>
        <div className="feed-content"><div className="feed-heading"><div><span className="eyebrow">Picked for you</span><h2>Matching projects</h2></div><span>{filtered.length} open</span></div>
          {filtered.length ? <div className="project-grid project-grid--feed">{filtered.map((project) => <ProjectCard key={project.id} project={project} onOpen={onOpenProject} claimed={claimedIds.includes(project.id)} />)}</div> : <div className="empty-state"><Search size={34} /><h3>No matching projects right now</h3><p>Try a broader skill or format. New requests ripple in throughout the day.</p><button className="button button--outline" onClick={() => {setSkill('All projects'); setMode('Any format'); setQuery('')}}>Clear filters</button></div>}
        </div>
      </div></section>
    </main>
  )
}

function MyProjectsView({ claimedIds, onOpenProject, onComplete, completedIds }) {
  const [tab, setTab] = useState('helping')
  const claimed = projects.filter((project) => claimedIds.includes(project.id))
  return (
    <main className="dashboard-page light-page"><section className="simple-hero"><div className="shell"><span className="eyebrow">Your corner of the pond</span><h1>My projects</h1><p>Keep track of the help you’re giving and the requests you’ve approved.</p></div></section>
      <section className="my-projects"><div className="shell"><div className="segmented" role="tablist" aria-label="Project role"><button role="tab" aria-selected={tab === 'helping'} className={tab === 'helping' ? 'active' : ''} onClick={() => setTab('helping')}>I’m helping <span>{claimed.length}</span></button><button role="tab" aria-selected={tab === 'receiving'} className={tab === 'receiving' ? 'active' : ''} onClick={() => setTab('receiving')}>My help requests <span>1</span></button></div>
        {tab === 'helping' ? (claimed.length ? <div className="project-list">{claimed.map((project) => <article className="list-project" key={project.id}><ProjectArt tone={project.tone} /><div className="list-main"><div className="card-topline"><span className={completedIds.includes(project.id) ? 'status-pill status-pill--complete' : 'status-pill'}>{completedIds.includes(project.id) ? 'Complete' : 'In progress'}</span><span>{project.category}</span></div><h3>{project.title}</h3><p>{project.summary}</p><div className="meta-row"><span><MapPin size={15} />{project.location}</span><span><Clock3 size={15} />{project.effort}</span></div></div><div className="list-actions"><button className="button button--outline" onClick={() => onOpenProject(project)}>View details</button>{!completedIds.includes(project.id) && <button className="button button--primary" onClick={() => onComplete(project)}>Mark complete</button>}</div></article>)}</div> : <div className="empty-state"><FrogMark compact /><h3>Your first project is one hop away</h3><p>Claim a project from the community feed and it’ll stay organized here.</p></div>) : <div className="project-list"><article className="list-project requester-project"><ProjectArt tone="garden" /><div className="list-main"><div className="card-topline"><span className="status-pill status-pill--awaiting">Awaiting confirmation</span><span>Website building</span></div><h3>A simple page for our garden club</h3><p>Jordan marked this project complete. Take a look, then confirm when it feels finished.</p><div className="progress-track" aria-label="Project progress"><span className="done" /><span className="done" /><span className="done" /><span className="current" /><span /></div></div><div className="list-actions"><button className="button button--outline">Message helper</button><button className="button button--primary">Confirm completion</button></div></article></div>}
      </div></section>
    </main>
  )
}

function LeaderboardView({ points, completedCount }) {
  const [identity, setIdentity] = useState('nickname')
  return (
    <main className="dashboard-page garden-page"><section className="leader-hero"><div className="shell leader-hero-grid"><div><span className="eyebrow">The good-deed garden</span><h1>Every hand makes<br />the garden grow.</h1><p>A cheerful celebration of contribution, not a contest. Show your name, use a nickname, or bloom anonymously.</p></div><div className="score-card"><span className="score-label"><Sparkles size={18} /> Your garden</span><strong>{points}</strong><small>kindness points</small><div className="score-stats"><span><b>{completedCount}</b> projects</span><span><b>3</b> week streak</span><span><b>4</b> badges</span></div></div></div></section>
      <section className="leader-content"><div className="shell leader-grid"><div className="leader-board"><div className="leader-board__head"><div><span className="eyebrow">This season</span><h2>Community blooms</h2></div><span>Updated today</span></div><div className="podium"><div className="podium-person second"><Avatar leader={leaders[1]} /><strong>{leaders[1].name}</strong><span>{leaders[1].points} pts</span><div>2</div></div><div className="podium-person first"><span className="crown">✦</span><Avatar leader={leaders[0]} /><strong>{leaders[0].name}</strong><span>{leaders[0].points} pts</span><div>1</div></div><div className="podium-person third"><Avatar leader={leaders[2]} /><strong>{leaders[2].name}</strong><span>{leaders[2].points} pts</span><div>3</div></div></div><div className="rank-list">{leaders.slice(3).map((leader) => <div className="rank-row" key={leader.rank}><span className="rank-number">{leader.rank}</span><Avatar leader={leader} /><div><strong>{leader.name}</strong><span>{leader.badge} · {leader.projects} projects</span></div><b>{leader.points} pts</b></div>)}<div className="rank-row you"><span className="rank-number">12</span><div className="avatar avatar--cream">Y</div><div><strong>You</strong><span>Kindness Keeper · {completedCount} projects</span></div><b>{points} pts</b></div></div></div>
        <aside className="badge-panel"><span className="eyebrow">Your badges</span><h2>Growing nicely!</h2><div className="badge-grid"><div><span className="badge-icon sun"><Star /></span><strong>First Hop</strong><small>First project claimed</small></div><div><span className="badge-icon leaf"><Leaf /></span><strong>Steady Sprout</strong><small>3-week streak</small></div><div><span className="badge-icon heart"><Heart /></span><strong>Kind Words</strong><small>5 thank-yous</small></div><div className="locked"><span className="badge-icon"><Award /></span><strong>Pond Pal</strong><small>2 projects to go</small></div></div><div className="identity-card"><strong>How you appear</strong><p>You’re always in control of your leaderboard identity.</p><label><span>Display as</span><select value={identity} onChange={(e) => setIdentity(e.target.value)}><option value="name">Jordan Rivera</option><option value="nickname">HelpfulHeron</option><option value="anonymous">Anonymous tadpole</option></select><ChevronDown size={16} /></label><div className="identity-preview"><span className="avatar avatar--green">{identity === 'anonymous' ? 'AT' : identity === 'name' ? 'JR' : 'HH'}</span><span>{identity === 'anonymous' ? 'Anonymous tadpole' : identity === 'name' ? 'Jordan Rivera' : 'HelpfulHeron'}</span><BadgeCheck size={18} /></div></div></aside>
      </div></section>
    </main>
  )
}

function Avatar({ leader }) { return <div className={`avatar avatar--${leader.color}`}>{leader.initials}</div> }

function ProjectModal({ project, onClose, onClaim, claimed }) {
  const closeRef = useRef(null)
  useEffect(() => {
    function onKey(event) { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('modal-open')
    closeRef.current?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open') }
  }, [onClose])
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section className="modal project-modal" role="dialog" aria-modal="true" aria-labelledby="project-title"><button ref={closeRef} className="close-button" onClick={onClose} aria-label="Close project details"><X /></button><ProjectArt tone={project.tone} /><div className="modal-content"><span className="match-pill"><Sparkles size={13} />{project.match}</span><h2 id="project-title">{project.title}</h2><p className="modal-summary">{project.summary}</p><div className="project-facts"><div><MapPin /><span>Format<strong>{project.location}</strong></span></div><div><Clock3 /><span>Expected effort<strong>{project.effort}</strong></span></div><div><UserRound /><span>Requested by<strong>{project.requester}</strong></span></div></div><div className="boundaries"><ShieldCheck /><div><strong>Clear, safe boundaries</strong><p>Only the approved summary is shown. Contact details unlock after both people confirm the match. No money transfers or sensitive care.</p></div></div><div className="modal-actions"><button className="button button--primary button--large" disabled={claimed} onClick={() => onClaim(project)}>{claimed ? <><Check size={18} /> Claimed by you</> : <>I can help <Heart size={18} /></>}</button><button className="button button--outline button--large" onClick={onClose}>Maybe later</button></div></div></section></div>
}

function LocationCombobox({ value, onChange, error }) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const query = value.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!query) return communityLocations.slice(0, 7)
    return communityLocations.filter((location) => `${location.label} ${location.detail}`.toLowerCase().includes(query)).slice(0, 7)
  }, [query])

  function choose(location) {
    onChange(location.label)
    setOpen(false)
    setActiveIndex(0)
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && open && matches[activeIndex]) {
      event.preventDefault()
      choose(matches[activeIndex])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="field location-field" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
      <label htmlFor="community-location">Community or location</label>
      <div className="location-input-wrap">
        <Search size={18} aria-hidden="true" />
        <input
          id="community-location"
          type="search"
          role="combobox"
          value={value}
          placeholder="Search a city or community"
          autoComplete="off"
          aria-expanded={open}
          aria-controls="community-location-options"
          aria-activedescendant={open && matches[activeIndex] ? `community-location-${activeIndex}` : undefined}
          aria-invalid={Boolean(error)}
          onFocus={() => setOpen(true)}
          onChange={(event) => { onChange(event.target.value); setOpen(true); setActiveIndex(0) }}
          onKeyDown={handleKeyDown}
        />
        {value && <button type="button" className="location-clear" onClick={() => { onChange(''); setOpen(true) }} aria-label="Clear location"><X size={15} /></button>}
      </div>
      {error && <small className="field-error">{error}</small>}
      {open && (
        <div className="location-dropdown" id="community-location-options" role="listbox" aria-label="Location suggestions">
          {matches.length ? matches.map((location, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              id={`community-location-${index}`}
              className={index === activeIndex ? 'location-option active' : 'location-option'}
              key={location.label}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(location)}
            >
              <span className="location-pin"><MapPin size={17} aria-hidden="true" /></span>
              <span><strong>{location.label}</strong><small>{location.detail}</small></span>
              {value === location.label && <Check size={17} aria-hidden="true" />}
            </button>
          )) : (
            <div className="location-empty"><Search size={20} /><span><strong>No nearby match</strong><small>Try a city name, county, or “Remote.”</small></span></div>
          )}
        </div>
      )}
    </div>
  )
}

function OnboardingModal({ role, onClose, onFinish }) {
  const [step, setStep] = useState(1)
  const [selected, setSelected] = useState(['Website building'])
  const [mode, setMode] = useState('Both')
  const [identity, setIdentity] = useState('Nickname')
  const [community, setCommunity] = useState('')
  const [name, setName] = useState('')
  const isHelper = role === 'helper'
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailBusy, setGmailBusy] = useState(false)
  const [verificationSession, setVerificationSession] = useState(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [requestBusy, setRequestBusy] = useState(false)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [savedSetup, setSavedSetup] = useState(() => loadIMessageSetup(role))
  const [photonStatus, setPhotonStatus] = useState({ loading: true, configured: false, missing: [] })
  const totalSteps = 4

  useEffect(() => {
    function onKey(event) { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey); document.body.classList.add('modal-open')
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('modal-open') }
  }, [onClose])

  useEffect(() => {
    let active = true
    getPhotonStatus()
      .then((status) => { if (active) setPhotonStatus({ loading: false, ...status }) })
      .catch(() => { if (active) setPhotonStatus({ loading: false, configured: false, missing: [], offline: true }) })
    return () => { active = false }
  }, [])

  function toggleSkill(skill) { setSelected((current) => current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]) }

  function connectGmail() {
    setGmailBusy(true)
    setErrors((current) => ({ ...current, gmail: undefined }))
    window.setTimeout(() => {
      setGmailConnected(true)
      setGmailBusy(false)
    }, 650)
  }

  async function startVerification() {
    const nextErrors = validateIMessageIdentity({ name, phone })
    if (!photonStatus.configured) nextErrors.integration = photonStatus.offline
      ? 'The Froggie API is not running. Start the full npm run dev command.'
      : 'Photon still needs its project ID and project secret.'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }
    setRequestBusy(true)
    setErrors({})
    try {
      const session = await requestPhotonVerification({ name, phone, role })
      setVerificationSession(session)
      setStep(4)
    } catch (error) {
      setErrors({ integration: error.message })
    } finally {
      setRequestBusy(false)
    }
  }

  async function verifyCode() {
    if (!verificationCode.trim()) {
      setErrors({ code: 'Enter the six-digit code from iMessage.' })
      return
    }
    setVerifyBusy(true)
    try {
      const verification = await verifyPhotonCode(verificationSession, verificationCode)
      const setup = saveIMessageSetup({ name, session: verificationSession, verification, role, gmailConnected, consent, community, mode, identity, selected })
      setSavedSetup(setup)
      setErrors({})
    } catch (error) {
      setErrors({ code: error.message })
    } finally {
      setVerifyBusy(false)
    }
  }

  async function resendCode() {
    setRequestBusy(true)
    try {
      const session = await requestPhotonVerification({ name, phone, role })
      setVerificationSession(session)
      setVerificationCode('')
      setErrors({})
    } catch (error) {
      setErrors({ code: error.message })
    } finally {
      setRequestBusy(false)
    }
  }

  function resetIMessageSetup() {
    clearIMessageSetup(role)
    setSavedSetup(null)
    setStep(1)
    setName('')
    setPhone('')
    setCommunity('')
    setConsent(false)
    setGmailConnected(false)
    setVerificationSession(null)
    setVerificationCode('')
  }

  function handlePrimaryAction() {
    if (step === 1) {
      setStep(2)
      return
    }
    if (step === 2) {
      if (isHelper && !community.trim()) {
        setErrors({ location: 'Choose the community where you would like to help.' })
        return
      }
      if (!isHelper && (!gmailConnected || !consent)) {
        setErrors({
          ...(!gmailConnected ? { gmail: 'Connect Gmail read-only before continuing.' } : {}),
          ...(!consent ? { consent: 'Confirm that every request requires your approval.' } : {}),
        })
        return
      }
      setErrors({})
      setStep(3)
      return
    }
    if (step === 3) startVerification()
    else verifyCode()
  }

  const primaryLabel = step < 3 ? 'Continue' : step === 3 ? 'Send code through Photon' : 'Verify & finish'

  let onboardingBody
  if (savedSetup) {
    onboardingBody = (
      <div className="setup-success" aria-live="polite">
        <span className="setup-success__icon"><BadgeCheck size={42} aria-hidden="true" /></span>
        <span className="eyebrow">You’re connected</span>
        <h2 id="onboarding-title">Froggie can check in privately.</h2>
        <p>{isHelper ? 'Project matches' : 'Private suggestions'} will go to the iMessage number ending in <strong>{savedSetup.imessage.phoneLast4}</strong>. {isHelper ? 'You can answer right from Messages.' : 'A request still cannot be shared until you approve it.'}</p>
        <div className="connection-summary">
          <div><Smartphone size={20} /><span><strong>Photon iMessage</strong><small>Verified · •••• {savedSetup.imessage.phoneLast4}</small></span><Check size={18} /></div>
          {!isHelper && <div><span className="gmail-mark">M</span><span><strong>Gmail</strong><small>Connected · read-only</small></span><Check size={18} /></div>}
          <div><ShieldCheck size={20} /><span><strong>{isHelper ? 'Helper profile' : 'Permission'}</strong><small>{isHelper ? 'Ready for matches' : 'Approval required every time'}</small></span><Check size={18} /></div>
        </div>
        <div className="local-demo-note"><CircleHelp size={17} /><span>Photon carries the message. Froggie stores only the last four digits and setup status in this browser.</span></div>
      </div>
    )
  } else if (isHelper && step === 1) {
    onboardingBody = (
      <div className="onboarding-content">
        <span className="eyebrow">What feels like you?</span>
        <h2 id="onboarding-title">Choose your helping skills</h2>
        <p>Pick as many as you like. You can change these anytime.</p>
        <fieldset className="skill-picker"><legend className="sr-only">Helping skills</legend>{categories.slice(1).map(({name: skillName, icon: Icon}) => <label key={skillName} className={selected.includes(skillName) ? 'skill-option selected' : 'skill-option'}><input type="checkbox" checked={selected.includes(skillName)} onChange={() => toggleSkill(skillName)} /><Icon size={20} /><span>{skillName}</span>{selected.includes(skillName) && <Check size={17} />}</label>)}</fieldset>
      </div>
    )
  } else if (isHelper && step === 2) {
    onboardingBody = (
      <div className="onboarding-content">
        <span className="eyebrow">Your helping rhythm</span>
        <h2 id="onboarding-title">When and how can you help?</h2>
        <div className="form-grid">
          <fieldset><legend>Project format</legend><div className="choice-row">{['Remote','In person','Both'].map((value) => <label key={value} className={mode === value ? 'choice selected' : 'choice'}><input type="radio" name="helper-mode" checked={mode === value} onChange={() => setMode(value)} />{value}</label>)}</div></fieldset>
          <LocationCombobox value={community} onChange={(nextValue) => { setCommunity(nextValue); setErrors((current) => ({ ...current, location: undefined })) }} error={errors.location} />
          <label className="field"><span>Availability</span><select defaultValue="weekends"><option value="weekends">Mostly weekends</option><option value="weekdays">Weekdays</option><option value="flexible">Flexible</option></select></label>
          <fieldset><legend>Leaderboard identity</legend><div className="choice-row">{['Name','Nickname','Anonymous'].map((value) => <label key={value} className={identity === value ? 'choice selected' : 'choice'}><input type="radio" name="identity" checked={identity === value} onChange={() => setIdentity(value)} />{value}</label>)}</div></fieldset>
        </div>
      </div>
    )
  } else if (!isHelper && step === 1) {
    onboardingBody = (
      <div className="onboarding-content">
        <span className="eyebrow">Private by default</span>
        <h2 id="onboarding-title">Let Froggie check in gently</h2>
        <p>Froggie looks only for low-risk, concrete needs and asks you privately through iMessage. It never posts automatically.</p>
        <div className="privacy-stack"><div><ShieldCheck /><span><strong>Read-only Gmail</strong><small>Froggie can notice possible small projects, but never sends or changes email.</small></span></div><div><MessageCircleHeart /><span><strong>Private iMessage first</strong><small>You approve, edit, or dismiss every suggestion before it goes anywhere.</small></span></div><div><UsersRound /><span><strong>Only your summary is shared</strong><small>Helpers never see the original email conversation.</small></span></div></div>
      </div>
    )
  } else if (!isHelper && step === 2) {
    onboardingBody = (
      <div className="onboarding-content">
        <span className="eyebrow">Email permission</span>
        <h2 id="onboarding-title">Connect the signal, not the conversation.</h2>
        <div className="form-grid">
          <div className={errors.gmail ? 'connect-card connect-card--error' : 'connect-card'}>
            <div><span className="gmail-mark">M</span><span><strong>Connect Gmail read-only</strong><small>{gmailConnected ? 'Connected with gmail.readonly permission.' : 'Froggie can read messages, but cannot send or change them.'}</small></span></div>
            <button type="button" className={gmailConnected ? 'button button--connected' : 'button button--outline'} onClick={connectGmail} disabled={gmailConnected || gmailBusy} aria-busy={gmailBusy}>{gmailBusy ? 'Connecting…' : gmailConnected ? <><Check size={16} /> Connected</> : 'Connect'}</button>
          </div>
          {errors.gmail && <small className="field-error standalone-error">{errors.gmail}</small>}
          <label className={errors.consent ? 'consent-check consent-check--error' : 'consent-check'}><input checked={consent} onChange={(event) => { setConsent(event.target.checked); setErrors((current) => ({ ...current, consent: undefined })) }} type="checkbox" /><span>I understand that Froggie will ask me before sharing any help request.</span></label>
          {errors.consent && <small className="field-error standalone-error">{errors.consent}</small>}
          <div className="local-demo-note"><CircleHelp size={17} /><span>Next, Photon will send a private code to your iMessage number.</span></div>
        </div>
      </div>
    )
  } else if (step === 3) {
    onboardingBody = (
      <div className="onboarding-content">
        <span className="eyebrow">Connect iMessage</span>
        <h2 id="onboarding-title">Get Froggie in your Messages.</h2>
        <p>{isHelper ? 'Receive matching projects and handoff updates through the app you already use.' : 'Receive private suggestions and approve them without learning a new app.'}</p>
        <div className="form-grid">
          <div className={photonStatus.configured ? 'photon-box photon-box--ready' : 'photon-box photon-box--missing'}>
            <span className="photon-mark"><MessageCircleHeart size={22} /></span>
            <span><strong>Photon iMessage</strong><small>{photonStatus.loading ? 'Checking connection…' : photonStatus.configured ? 'Managed iMessage line ready' : photonStatus.offline ? 'Froggie API is offline' : 'Project credentials needed'}</small></span>
            <span className="photon-status">{photonStatus.configured ? <><Check size={15} /> Ready</> : 'Setup needed'}</span>
          </div>
          <label className="field"><span>Your name</span><input value={name} onChange={(event) => { setName(event.target.value); setErrors((current) => ({ ...current, name: undefined })) }} type="text" autoComplete="name" placeholder={isHelper ? 'Jordan' : 'Margaret'} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} />{errors.name && <small id="name-error" className="field-error">{errors.name}</small>}</label>
          <label className="field"><span>iMessage phone number</span><input value={phone} onChange={(event) => { setPhone(formatPhone(event.target.value)); setErrors((current) => ({ ...current, phone: undefined, integration: undefined })) }} type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" aria-invalid={Boolean(errors.phone)} aria-describedby="phone-help" /><small id="phone-help" className={errors.phone ? 'field-error' : 'field-help'}>{errors.phone || 'Photon will send a six-digit code to this number.'}</small></label>
          {errors.integration && <div className="integration-error" role="alert"><CircleHelp size={18} /><span>{errors.integration}</span></div>}
        </div>
      </div>
    )
  } else {
    onboardingBody = (
      <div className="onboarding-content verification-step">
        <span className="verification-icon"><Smartphone size={30} aria-hidden="true" /></span>
        <span className="eyebrow">Verify iMessage</span>
        <h2 id="onboarding-title">Enter your private check-in code</h2>
        <p>Photon sent a six-digit code to the iMessage number ending in <strong>{verificationSession?.phoneLast4}</strong>.</p>
        <label className="field code-field"><span>Six-digit code</span><input value={verificationCode} onChange={(event) => { setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6)); setErrors({}) }} type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? 'code-error' : 'code-help'} /><small id={errors.code ? 'code-error' : 'code-help'} className={errors.code ? 'field-error' : 'field-help'}>{errors.code || 'The code expires after 10 minutes.'}</small></label>
        <button type="button" className="resend-button" onClick={resendCode} disabled={requestBusy}>{requestBusy ? 'Sending a fresh code…' : 'Send a fresh code'}</button>
        <div className="privacy-note verification-note"><ShieldCheck size={17} /><div><strong>Still private.</strong><span>Verification connects the channel; it does not approve any request.</span></div></div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <button className="close-button" onClick={onClose} aria-label="Close onboarding"><X /></button>
        <div className="onboarding-brand">
          <FrogMark />
          <div>
            <strong>{isHelper ? 'Join the helper pond' : 'Set up private suggestions'}</strong>
            <span>{savedSetup ? 'iMessage connected' : `Step ${step} of ${totalSteps}`}</span>
          </div>
        </div>
        <div className="step-dots" style={{ '--step-count': totalSteps }} aria-hidden="true">
          {Array.from({ length: totalSteps }, (_, index) => <span key={index} className={step >= index + 1 ? 'active' : ''} />)}
        </div>

        {onboardingBody}
        {false && (savedSetup ? (
          <div className="setup-success" aria-live="polite">
            <span className="setup-success__icon"><BadgeCheck size={42} aria-hidden="true" /></span>
            <span className="eyebrow">You’re connected</span>
            <h2 id="onboarding-title">Froggie can check in privately.</h2>
            <p>{isHelper ? 'Project matches' : 'Private suggestions'} will go to the iMessage number ending in <strong>{savedSetup.imessage.phoneLast4}</strong>. {isHelper ? 'You can answer right from Messages.' : 'A request still cannot be shared until you approve it.'}</p>
            <div className="connection-summary">
              <div><Smartphone size={20} /><span><strong>Photon iMessage</strong><small>Verified · •••• {savedSetup.imessage.phoneLast4}</small></span><Check size={18} /></div>
              {!isHelper && <div><span className="gmail-mark">M</span><span><strong>Gmail</strong><small>Connected · read-only</small></span><Check size={18} /></div>}
              <div><ShieldCheck size={20} /><span><strong>{isHelper ? 'Helper profile' : 'Permission'}</strong><small>{isHelper ? 'Ready for matches' : 'Approval required every time'}</small></span><Check size={18} /></div>
            </div>
            <div className="local-demo-note"><CircleHelp size={17} /><span>Photon carries the message. Froggie stores only the last four digits and setup status in this browser.</span></div>
          </div>
        ) : isHelper ? (
          step === 1 ? (
            <div className="onboarding-content">
              <span className="eyebrow">What feels like you?</span><h2 id="onboarding-title">Choose your helping skills</h2><p>Pick as many as you like. You can change these anytime.</p>
              <fieldset className="skill-picker"><legend className="sr-only">Helping skills</legend>{categories.slice(1).map(({name: skillName, icon: Icon}) => <label key={skillName} className={selected.includes(skillName) ? 'skill-option selected' : 'skill-option'}><input type="checkbox" checked={selected.includes(skillName)} onChange={() => toggleSkill(skillName)} /><Icon size={20} /><span>{skillName}</span>{selected.includes(skillName) && <Check size={17} />}</label>)}</fieldset>
            </div>
          ) : (
            <div className="onboarding-content">
              <span className="eyebrow">Your helping rhythm</span><h2 id="onboarding-title">When and how can you help?</h2>
              <div className="form-grid"><fieldset><legend>Project format</legend><div className="choice-row">{['Remote','In person','Both'].map((value) => <label key={value} className={mode === value ? 'choice selected' : 'choice'}><input type="radio" name="helper-mode" checked={mode === value} onChange={() => setMode(value)} />{value}</label>)}</div></fieldset><label className="field"><span>Community or location</span><input type="text" placeholder="Oakland, CA" autoComplete="address-level2" /></label><label className="field"><span>Availability</span><select defaultValue="weekends"><option value="weekends">Mostly weekends</option><option value="weekdays">Weekdays</option><option value="flexible">Flexible</option></select></label><fieldset><legend>Leaderboard identity</legend><div className="choice-row">{['Name','Nickname','Anonymous'].map((value) => <label key={value} className={identity === value ? 'choice selected' : 'choice'}><input type="radio" name="identity" checked={identity === value} onChange={() => setIdentity(value)} />{value}</label>)}</div></fieldset></div>
            </div>
          )
        ) : step === 1 ? (
          <div className="onboarding-content">
            <span className="eyebrow">Private by default</span><h2 id="onboarding-title">Let Froggie check in gently</h2><p>Froggie looks only for low-risk, concrete needs and asks you privately through iMessage. It never posts automatically.</p>
            <div className="privacy-stack"><div><ShieldCheck /><span><strong>Read-only Gmail</strong><small>Froggie can notice possible small projects, but never sends or changes email.</small></span></div><div><MessageCircleHeart /><span><strong>Private iMessage first</strong><small>You approve, edit, or dismiss every suggestion before it goes anywhere.</small></span></div><div><UsersRound /><span><strong>Only your summary is shared</strong><small>Helpers never see the original email conversation.</small></span></div></div>
          </div>
        ) : step === 2 ? (
          <div className="onboarding-content">
            <span className="eyebrow">Let’s connect</span><h2 id="onboarding-title">How should Froggie reach you?</h2>
            <div className="form-grid">
              <label className="field"><span>Your name</span><input value={name} onChange={(event) => { setName(event.target.value); setErrors((current) => ({ ...current, name: undefined })) }} type="text" autoComplete="name" placeholder="Margaret" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} />{errors.name && <small id="name-error" className="field-error">{errors.name}</small>}</label>
              <label className="field"><span>iMessage phone number</span><input value={phone} onChange={(event) => { setPhone(formatPhone(event.target.value)); setErrors((current) => ({ ...current, phone: undefined })) }} type="tel" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" aria-invalid={Boolean(errors.phone)} aria-describedby="phone-help" /><small id="phone-help" className={errors.phone ? 'field-error' : 'field-help'}>{errors.phone || 'Use a number that is signed in to iMessage.'}</small></label>
              <div className={errors.gmail ? 'connect-card connect-card--error' : 'connect-card'}>
                <div><span className="gmail-mark">M</span><span><strong>Connect Gmail read-only</strong><small>{gmailConnected ? 'Connected with gmail.readonly permission.' : 'Froggie can read messages, but cannot send or change them.'}</small></span></div>
                <button type="button" className={gmailConnected ? 'button button--connected' : 'button button--outline'} onClick={connectGmail} disabled={gmailConnected || gmailBusy} aria-busy={gmailBusy}>{gmailBusy ? 'Connecting…' : gmailConnected ? <><Check size={16} /> Connected</> : 'Connect'}</button>
              </div>
              {errors.gmail && <small className="field-error standalone-error">{errors.gmail}</small>}
              <label className={errors.consent ? 'consent-check consent-check--error' : 'consent-check'}><input checked={consent} onChange={(event) => { setConsent(event.target.checked); setErrors((current) => ({ ...current, consent: undefined })) }} type="checkbox" /><span>I understand that Froggie will ask me before sharing any help request.</span></label>
              {errors.consent && <small className="field-error standalone-error">{errors.consent}</small>}
              <div className="local-demo-note"><CircleHelp size={17} /><span>Local demo: the next step creates an on-screen test code. No message leaves this device.</span></div>
            </div>
          </div>
        ) : (
          <div className="onboarding-content verification-step">
            <span className="verification-icon"><Smartphone size={30} aria-hidden="true" /></span>
            <span className="eyebrow">Verify iMessage</span><h2 id="onboarding-title">Enter your private check-in code</h2>
            <p>For this localhost demo, use <strong>2468</strong>. In production, this code would arrive at the number ending in <strong>{verificationSession?.phoneLast4}</strong>.</p>
            <label className="field code-field"><span>Four-digit code</span><input value={verificationCode} onChange={(event) => { setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 4)); setErrors({}) }} type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="0000" aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? 'code-error' : 'code-help'} /><small id={errors.code ? 'code-error' : 'code-help'} className={errors.code ? 'field-error' : 'field-help'}>{errors.code || 'The demo code expires after 10 minutes.'}</small></label>
            <button type="button" className="resend-button" onClick={resendCode} disabled={requestBusy}>{requestBusy ? 'Creating a fresh code…' : 'Create a fresh demo code'}</button>
            <div className="privacy-note verification-note"><ShieldCheck size={17} /><div><strong>Still private.</strong><span>Verification connects the channel; it does not approve any request.</span></div></div>
          </div>
        ))}

        <div className="onboarding-footer">
          {savedSetup ? (
            <><button className="button button--quiet" onClick={resetIMessageSetup}>Set up a different number</button><button className="button button--primary" onClick={() => onFinish(isHelper ? 'Photon iMessage is connected for helper matches.' : 'Photon iMessage is connected. Froggie will always ask before sharing.')}>Done <Check size={17} /></button></>
          ) : (
            <>{step > 1 && <button className="button button--quiet" onClick={() => { setStep((current) => current - 1); setErrors({}) }}>Back</button>}<button className="button button--primary" onClick={handlePrimaryAction} disabled={requestBusy || verifyBusy || (photonStatus.loading && step === 3)} aria-busy={requestBusy || verifyBusy}>{requestBusy ? 'Sending through Photon…' : verifyBusy ? 'Verifying…' : primaryLabel} {!requestBusy && !verifyBusy && (step === totalSteps ? <Check size={17} /> : <ArrowRight size={17} />)}</button></>
          )}
        </div>
      </section>
    </div>
  )
}

function Toast({ message, onClose }) {
  useEffect(() => { const timer = setTimeout(onClose, 3800); return () => clearTimeout(timer) }, [message, onClose])
  return <div className="toast" role="status"><span><Check size={17} /></span><p>{message}</p><button onClick={onClose} aria-label="Dismiss notification"><X size={16} /></button></div>
}

function Footer({ setView }) {
  return <footer><div className="shell footer-grid"><div><button className="brand-button footer-brand" onClick={() => setView('home')}><FrogMark /><span className="brand-wordmark">froggie<span>the helper</span></span></button><p>Small projects. Real neighbors. Better days.</p></div><div><strong>Explore</strong><button onClick={() => setView('community')}>Community projects</button><button onClick={() => setView('leaderboard')}>Good-deed garden</button><button onClick={() => setView('my-projects')}>My projects</button></div><div><strong>Safety</strong><span>Consent first</span><span>Low-risk requests only</span><span>Privacy by design</span></div><div className="footer-stamp"><FrogMark compact /><span>Neighbor powered</span><small>Made with care for every kind of helper.</small></div></div><div className="shell footer-bottom"><span>© 2026 Froggie the Helper</span><span>Kindness has no monetary value. That’s the point.</span></div></footer>
}

export default function App() {
  const [view, setView] = useState('home')
  const [selectedProject, setSelectedProject] = useState(null)
  const [onboardingRole, setOnboardingRole] = useState(null)
  const [claimedIds, setClaimedIds] = useState([])
  const [completedIds, setCompletedIds] = useState([])
  const [points, setPoints] = useState(540)
  const [toast, setToast] = useState('')

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [view])
  const viewContent = useMemo(() => {
    if (view === 'community') return <CommunityView onOpenProject={setSelectedProject} claimedIds={claimedIds} />
    if (view === 'my-projects') return <MyProjectsView claimedIds={claimedIds} onOpenProject={setSelectedProject} completedIds={completedIds} onComplete={(project) => {setCompletedIds((ids) => [...ids, project.id]); setPoints((value) => value + 60); setToast('Project marked complete. 60 kindness points added!')}} />
    if (view === 'leaderboard') return <LeaderboardView points={points} completedCount={completedIds.length + 6} />
    return <HomeView setView={setView} onOpenOnboarding={setOnboardingRole} onOpenProject={setSelectedProject} claimedIds={claimedIds} onToast={setToast} />
  }, [view, claimedIds, completedIds, points])

  function claimProject(project) {
    if (!claimedIds.includes(project.id)) setClaimedIds((ids) => [...ids, project.id])
    setSelectedProject(null)
    setToast(`${project.title} is now in My projects. Froggie will guide the handoff.`)
  }
  return <div className="app-shell"><Header view={view} setView={setView} onOpenOnboarding={setOnboardingRole} />{viewContent}<Footer setView={setView} /><nav className="mobile-bottom-nav" aria-label="Quick navigation"><button className={view === 'home' ? 'active' : ''} onClick={() => setView('home')}><Home /><span>Home</span></button><button className={view === 'community' ? 'active' : ''} onClick={() => setView('community')}><Compass /><span>Projects</span></button><button className={view === 'my-projects' ? 'active' : ''} onClick={() => setView('my-projects')}><Heart /><span>Mine</span></button><button className={view === 'leaderboard' ? 'active' : ''} onClick={() => setView('leaderboard')}><Trophy /><span>Garden</span></button></nav>{selectedProject && <ProjectModal project={selectedProject} onClose={() => setSelectedProject(null)} onClaim={claimProject} claimed={claimedIds.includes(selectedProject.id)} />}{onboardingRole && <OnboardingModal role={onboardingRole} onClose={() => setOnboardingRole(null)} onFinish={(message) => { setOnboardingRole(null); setToast(message); if (onboardingRole === 'helper') setView('community') }} />}{toast && <Toast message={toast} onClose={() => setToast('')} />}</div>
}
