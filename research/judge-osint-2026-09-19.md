# Hack for Humanity SF — judge OSINT and build strategy

**Research date:** 2026-09-19  
**Owner:** JS / DNM team  
**Scope:** Public, professionally relevant sources only. No sensitive personal data.  
**Event:** [Hack for Humanity: San Francisco](https://luma.com/h4h-san-francisco)

## Executive read

This panel is likely to reward a project that combines three things:

1. **A real, local human need** — preferably validated by a resident, community worker, or organization.
2. **A credible working system** — not merely a chatbot or slide deck; the demo should complete one useful workflow.
3. **Evidence and trust** — a measurable outcome, transparent limitations, and a human fallback where mistakes matter.

The official event page asks teams to use Google Gemini to solve a real problem in their own community, but it does **not** publish a judging rubric. The preferences below are reasoned inferences from the judges' public work and statements, not claims about private intentions.

The panel has three overlapping centers of gravity:

- **Community outcomes:** Sebastien Floodpage and Michael Seiler.
- **Scientific and production rigor:** Alessio Lodge, Gediminas Pazera, and Xinchi Qi.
- **Developer experience, demonstration, and communication:** Liz Zhang, Roan Weigert, and Dmytro Spodarets.

The safest winning posture is therefore: **one community, one painful workflow, one beneficiary story, one live end-to-end demo, one quantified result, and one honest safety boundary.**

## Judge profiles

### Sebastien Floodpage — Deepfire; formerly Google

**Verified professional signals**

- Deepfire combines satellite, camera, lightning, and ground-sensor data to identify wildfire ignitions, suppress false alarms, and deliver actionable alerts to response agencies. Its public positioning centers on shrinking the gap between ignition and first report. [Deepfire company profile](https://www.linkedin.com/company/deepfire)
- At Google.org, Floodpage worked on applied-AI initiatives including Full Fact's multilingual misinformation-detection tooling. [Google.org article authored by Floodpage](https://blog.google/company-news/outreach-and-initiatives/google-org/fullfact-and-google-fight-misinformation/)
- His public profile also describes program work with Médecins Sans Frontières on computer vision for antimicrobial-resistance testing and with Full Fact on political misinformation. [Public professional profile](https://ch.linkedin.com/in/sebastien-floodpage)
- Deepfire is working with Earth Fire Alliance to make FireSat data usable by agencies of different sizes, including under-resourced regions, through open data standards. [Earth Fire Alliance–Deepfire announcement](https://www.globenewswire.com/news-release/2026/08/05/3339429/0/en/earth-fire-alliance-and-deepfire-collaborate-to-support-firesat-data-delivery-to-fire-agencies-worldwide.html)

**Likely values — inference**

- Applied AI that reduces response time in consequential settings.
- Technology for public-interest institutions and underserved communities.
- Data fusion, false-positive reduction, and information that leads to action.
- Products and APIs that local organizations can actually adopt.

**What to emphasize in the pitch**

- Who acts on the output, how quickly, and what changes because of it.
- A concrete alert, triage, or coordination workflow rather than passive analysis.
- How the system handles bad data and avoids noisy or harmful recommendations.
- A path from the local pilot to repeatable use by other communities.

### Liz Zhang — Developer Relations Lead, FalkorDB

**Verified professional signals**

- Zhang describes her mission as closing the gap between sophisticated AI systems and what developers feel able to build. She emphasizes useful documentation, concrete demos, onboarding, and helping developers get unstuck. [Liz Zhang's professional site](https://www.zhang-liz.com/)
- Her public activity shows a strong builder orientation: shipping agent projects, explaining new tools, and hosting this event around one problem in a participant's own community. [Public professional profile](https://www.linkedin.com/in/lizz-zhang)
- FalkorDB's core product thesis is trustworthy, traceable AI through low-latency knowledge graphs, GraphRAG, and persistent agent memory rather than ungrounded model output. [FalkorDB company page](https://www.falkordb.com/company/)
- Her public volunteer record includes local food service, support for underrepresented San Francisco artists, and neighborhood clean-up work. [Public professional profile](https://www.linkedin.com/in/lizz-zhang)

**Likely values — inference**

- Developer usability and clear explanation, not complexity for its own sake.
- Working demos and thoughtful onboarding.
- Grounded, context-aware AI with inspectable relationships and memory.
- Local participation, inclusion, and accessible tools.

**What to emphasize in the pitch**

- Make the first-run experience smooth enough to understand in seconds.
- Show why Gemini is necessary and how its answer is grounded or checked.
- If the problem is relationship-heavy, show an inspectable graph or provenance trail; do not add GraphRAG gratuitously.
- Provide a simple architecture diagram and a clean repository README.

### Alessio Lodge — CTO and Co-Founder, Ambra Compute

**Verified professional signals**

- Ambra places modular GPU compute at renewable-energy sites that would otherwise curtail power, positioning itself as energy-first, fast-deploying, grid-edge AI infrastructure. [Ambra Compute](https://ambracompute.com/)
- Lodge's public portfolio centers on compute, energy, and mathematics. It includes open-source tools for power markets, storage optimization, forecasting, and grid sizing. [Alessio Lodge portfolio](https://alessiolodge.com/)
- Before Ambra, he worked on mathematical battery models at Stanford and led electrochemical modeling work at TNO spanning physics-based, machine-learning, and hybrid systems. [Stanford profile](https://battiato.stanford.edu/people/alessio-lodge) and [portfolio](https://alessiolodge.com/)
- His recent research concerns safe, degradation-aware fast charging using physics-based control. [Research paper](https://arxiv.org/abs/2605.16683)

**Likely values — inference**

- Technical and scientific rigor.
- Sustainability measured through real energy and resource constraints.
- Elegant systems thinking across software, hardware, and infrastructure.
- Open tools and reproducible analysis.

**What to emphasize in the pitch**

- Quantify resource use, cost, latency, or environmental benefit.
- Explain assumptions and constraints; avoid unsupported impact multipliers.
- Show a technically coherent architecture and why each component exists.
- If sustainability is claimed, measure it rather than using it as branding.

### Gediminas Pazera — Founding AI Engineer, Develop Health

**Verified professional signals**

- Pazera earned a DPhil at Oxford in computational chemical physics and developed algorithms for quantum-dynamics simulations. [Oxford research group](https://hore.chem.ox.ac.uk/people.shtml)
- Develop Health applies prescription AI to medication coverage and prior authorization inside clinical workflows. [Develop Health](https://www.develophealth.ai/)
- In a public technical talk, Pazera describes production lessons including honest evaluation, human annotations, lowering model cost without losing quality, patient-data care, catching errors before output, and human review before anything reaches a payer. [Healthcare Agents talk description](https://luma.com/hg0i8ryp)
- Public profiles describe his systems as serving hundreds of thousands of medication-access cases monthly. [WomenTech speaker profile](https://www.womentech.net/speaker/Semra/Asan/157921)

**Likely values — inference**

- Reliability over novelty in high-stakes workflows.
- Evaluation that detects hidden failure rather than flattering the model.
- Human-in-the-loop review, privacy, and safe escalation.
- Measurable impact at production scale and cost-aware model selection.

**What to emphasize in the pitch**

- Include a small but explicit evaluation set and report failures honestly.
- Show uncertainty, refusal, or escalation behavior on an edge case.
- Minimize personal data and explain consent, retention, and access boundaries.
- State the metric affected: time saved, acceptance rate, coverage, error rate, or successful completions.

### Michael Seiler — Founder, Collective Impact Network

**Verified professional signals**

- Seiler's public professional thesis is creating new models to solve major city challenges. [Public professional profile](https://www.linkedin.com/in/michael-seiler)
- Beyond Homeless, where he serves as Chief Impact Officer, coordinates government, philanthropy, housing, business, and service organizations instead of treating homelessness as isolated programs. Its public model emphasizes shared ownership, execution, accountability, local trust, and measurable outcomes. [Beyond Homeless](https://www.beyondhomeless.org/)
- The work focuses on turning research and convening into active initiatives such as campus hubs, policy and funding reform, shared data, and innovative financing.

**Likely values — inference**

- Cross-sector coordination and breaking organizational silos.
- Solutions shaped by people with lived experience and local trust.
- Scalable civic infrastructure, not one-off charity or an isolated app.
- Clear ownership, accountability, and an execution path.

**What to emphasize in the pitch**

- Identify the resident, frontline worker, local organization, and decision-maker involved.
- Show how the tool fits existing organizations rather than assuming they disappear.
- Name one credible adoption path and the person or institution responsible for the next action.
- If the solution is a marketplace or directory, demonstrate how it creates a successful connection, not merely a list.

### Xinchi Qi — Co-Founder and President, Revamp AI

**Verified professional signals**

- Qi leads AI and data infrastructure at Revamp, a YC-backed company using behavioral signals and closed-loop systems for individualized customer engagement. [Databricks speaker profile](https://www.databricks.com/dataaisummit/speaker/xinchi-qi)
- In a founder interview, he says early-stage teams can be distracted by feature requests without real commitment and describes revenue and traction as the reality test that guided Revamp's successful product direction. [Founder interview](https://www.thoughtleadersintech.io/p/revamp)
- His product writing emphasizes previewing outputs on real profiles, iterating before scaling, auditing results, and using outcome data to improve future generations. [Revamp Campaigns announcement](https://www.getrevamp.ai/blog/introducing-campaigns)
- Revamp's engineering material stresses ownership, production data pipelines, observability, scalability, and end-to-end execution. [YC company job description](https://www.ycombinator.com/companies/revamp/jobs/ENNF9pa-founding-engineer-ai-infra-data-pipeline)

**Likely values — inference**

- Product-market fit demonstrated by behavior, not compliments.
- Fast iteration toward a narrow workflow people genuinely use.
- Closed feedback loops and measurable results.
- Ownership, scalable data systems, and commercial realism.

**What to emphasize in the pitch**

- Present evidence of demand: a short interview, usage attempt, letter of interest, or existing manual workaround.
- Define a north-star outcome and show how the product learns from results.
- Keep scope narrow enough that the core loop works during the demo.
- Explain adoption and ongoing use, even for a nonprofit or civic product.

### Roan Weigert — Developer Relations AI Lead, GMI Cloud

**Verified professional signals**

- Weigert describes his work as turning AI infrastructure into practical use cases through demos, tutorials, video, and community. [Roan Weigert's professional site](https://roanweigert.com/)
- His public portfolio and prior hackathon activity repeatedly favor useful, shipped projects: examples include graph-native gene research, world monitoring, document extraction, and aviation tools that felt useful rather than merely demo-like. [GMI hackathon recap](https://www.linkedin.com/posts/-roan_another-one-for-the-books-actually-90-builders-activity-7444403184779038720-MqVX) and [aviation hackathon recap](https://www.linkedin.com/posts/-roan_airwayshack-gdgsanfrancisco-gdgsfdevfest-activity-7401839932920512512-f2Uu)
- His published video framework argues that clear story and emotional connection matter more than a sequence of technically impressive shots. [AI video storytelling framework](https://roanweigert.com/2026/02/stop-making-boring-ai-videos-story-framework/)
- He has experience with AI infrastructure selection, GPU economics, multimodal systems, and many hackathon judging panels. [CIO contributor profile](https://www.cio.com/profile/roan-weigert/)

**Likely values — inference**

- A live, practical use case over a vague platform.
- Strong narrative, visual communication, and an understandable demo.
- Builders who ship and can explain infrastructure choices.
- Creative multimodal interaction when it serves the user's goal.

**What to emphasize in the pitch**

- Tell the story through one person, one problem, and one visible change.
- Demo the product before explaining the entire architecture.
- Show that the infrastructure is proportionate to the workload and budget.
- Prefer one memorable interaction to five unfinished features.

### Dmytro Spodarets — Founder and Editor-in-Chief, Data Phoenix

**Verified professional signals**

- Data Phoenix defines itself as practitioner-first, technically substantive, merit-based, and oriented toward real architectures, workflows, best practices, and lessons learned. It explicitly favors builders showing tools over promotional pitches. [Data Phoenix: About](https://dataphoenix.info/about-us)
- Spodarets' public work centers on AI infrastructure, cloud architecture, data pipelines, observability, model serving, cost optimization, technical education, and community building. [Public professional profile](https://www.linkedin.com/in/spodarets)
- His background includes more than a decade of organizing AI/data communities and events, first in Ukraine and later in the San Francisco Bay Area. [Data Phoenix history](https://dataphoenix.info/about-us)

**Likely values — inference**

- Technical substance and practitioner usefulness.
- Production readiness: evals, observability, reproducibility, cost, and operations.
- Honest demonstrations and builders who understand the system underneath.
- Knowledge-sharing and scalable technical communities.

**What to emphasize in the pitch**

- Be ready to explain data flow, failure modes, latency, and cost.
- Show logs, a trace, an evaluation result, or another under-the-hood artifact.
- Avoid inflated claims and buzzwords; say what works now and what does not.
- Make the repository understandable to another engineer after the event.

## Cross-panel strategy

### Inferred scorecard — not the official rubric

| Dimension | Weight | Proof to show |
|---|---:|---|
| Local human impact | 25 | Named user group, observed pain, current workaround, beneficiary outcome |
| Working end-to-end demo | 20 | One complete golden-path workflow with real output |
| Gemini is load-bearing | 15 | A task requiring model reasoning or multimodality, not a decorative API call |
| Reliability, safety, and privacy | 15 | Grounding, eval examples, uncertainty handling, human escalation, minimal data |
| Adoption and coordination | 10 | Local partner/user, workflow fit, clear owner of next step |
| Technical depth and efficiency | 10 | Coherent architecture, latency/cost/resource choices, inspectable data flow |
| Story and usability | 5 | Clear before/after narrative and an interface judges grasp immediately |

### The pitch structure

Use a simple five-part story:

1. **Person:** “This is [role or anonymized local resident], who currently…”
2. **Pain:** Show the existing workflow and quantify the delay, cost, missed connection, or risk.
3. **Product:** Run the live demo immediately. Let the judge see the useful action complete.
4. **Proof:** Show user validation, a tiny evaluation table, limitations, and the metric the project changes.
5. **Path:** Name the local organization or operator who could pilot it next week and how the same model could transfer elsewhere.

### Four-hour build allocation

- **0:00–0:25 — Validate:** Pick one beneficiary and one job-to-be-done. Get at least one direct signal from a person close to the problem if possible.
- **0:25–0:45 — Define proof:** Choose one success metric and 5–10 representative test cases, including two failure or edge cases.
- **0:45–2:40 — Build:** Complete only the golden path, provenance/grounding, and one safe failure path.
- **2:40–3:15 — Test:** Run the small evaluation set, record latency/cost, and fix the demo-breaking issues.
- **3:15–3:40 — Package:** README, architecture image, limitations, and a fallback demo recording or screenshots.
- **3:40–4:00 — Rehearse:** A short live demo followed by impact, evidence, safety, and adoption.

## Project filters

Before committing to an idea, require “yes” on at least five of these six questions:

1. Can a local person or organization confirm the problem today?
2. Can the prototype complete a useful action, not just provide information?
3. Is Gemini essential to the action?
4. Can benefit be measured within the demo or pilot?
5. Can mistakes be detected, bounded, or escalated to a human?
6. Is there an obvious local operator who could continue using it?

Reject or reshape ideas that are only generic chatbots, broad “platforms for everyone,” directories without a connection mechanism, diagnostic systems without clinical safeguards, or impact claims with no baseline.

## High-confidence opportunity patterns

These are patterns, not final ideas; the community and team should supply the actual problem.

- **Frontline intake to action:** Convert messy multilingual voice, image, or document reports into a grounded case summary, route it to the right local service, and let a human approve the handoff.
- **Community resource coordination:** Match time-sensitive supply and demand across local nonprofits with explicit provenance, availability, and successful-connection tracking.
- **Accessible civic navigation:** Turn complex public-service requirements into a personalized checklist with cited source material, uncertainty flags, and a warm handoff to a human.
- **Local resilience alerts:** Fuse trusted public data and resident reports into prioritized, low-noise alerts for heat, fire, food, transit, or neighborhood support workflows.
- **Institutional memory for small nonprofits:** Preserve verified program knowledge, partner relationships, and case history so volunteers can answer questions without exposing sensitive client data.

## Key uncertainties

- No public official scoring rubric was found for the San Francisco event as of the research date.
- Public professional activity is evidence of interests, not proof of how any individual will score a specific project.
- Some reported scale and performance figures come from professional profiles or company materials and should be treated as self-reported unless independently audited.
- The panel may divide sponsor prizes from overall recognition; confirm prize-specific requirements at kickoff.

## Primary event sources

- [Official San Francisco event page](https://luma.com/h4h-san-francisco)
- [The AI Collective Hack for Humanity page](https://www.aicollective.com/h4h)
- [Global civic-hackathon announcement](https://fortune.com/press-releases/ai-collective-hack-for-humanity-global-civic-hackathon-2026-08-17/)

