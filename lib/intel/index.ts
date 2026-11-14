import type { Deal, EvidenceStatus, IntelItem, NormalizedAccount, NormalizedData, NormalizedEvent, RuleExplanation } from "@/lib/intel/types";

export interface BookValue extends IntelItem {
  dealId: string | null;
  title: string;
  stage: string;
  value: number | null;
  displayValue: number | "Not established";
  amountEvidenceIds: string[];
  status: EvidenceStatus;
  currency: "unknown";
}

export interface BookValueSummary {
  verifiedPipeline: { value: number; deals: BookValue[]; evidenceIds: string[] };
  unverified: BookValue[];
  totalUnverified: number | null;
  rules: RuleExplanation[];
}

const roles = ["decides", "pays", "uses", "couldBlock", "champion", "technicalStakeholders"] as const;
export type PowerRole = typeof roles[number];

export interface PowerMapEntry extends IntelItem {
  role: PowerRole;
  status: "known" | "assumption" | "unknown";
  relationshipStatus: "guarded" | "neutral" | "warm" | "ally" | "unknown";
  peopleStatus: "identified" | "not introduced";
  people: Array<{ personId: string | null; name: string; title: string; relationship: "guarded" | "neutral" | "warm" | "ally" | "unknown" }>;
}

export interface PowerMapDeal {
  dealId: string | null;
  title: string;
  roles: PowerMapEntry[];
  rules: RuleExplanation[];
  evidenceIds: string[];
}

export interface Action extends IntelItem {
  rank: number;
  score: number;
  description: string;
  account: string;
  relatedDeal: string | null;
  owner: string;
  deadline: { date: string | null; label: string; proposed: boolean };
  reason: string;
  scoreBreakdown: { impact: number; urgency: number; likelihood: number; confidence: number };
}

export interface Risk extends IntelItem {
  account: string;
  relatedDeal: string | null;
  severity: "low" | "medium" | "high";
  trigger: string;
  date: string | null;
  dateLabel: string;
}

export interface UnknownItem extends IntelItem {
  account: string;
  affectedDeal: string | null;
  missingInfo: string;
  whyItMatters: string;
  whoCanAnswer: string;
  nextQuestion: string;
}

export interface AccountIntel {
  account: string;
  bookValue: BookValueSummary;
  powerMap: PowerMapDeal[];
  firstThree: Action[];
  risks: Risk[];
  unknowns: UnknownItem[];
}

const rule = (name: string, explanation: string): RuleExplanation => ({ name, explanation });
const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
const sourceIds = (...values: Array<string | null | undefined>): string[] => unique(values.filter((value): value is string => typeof value === "string"));

function hasVerifiedAmountEvidence(deal: Deal): boolean {
  return deal.valueStatus === "verified" && deal.amountEvidence.some((evidence) =>
    (evidence.kind === "file" || evidence.kind === "record") && evidence.status === "verified");
}

export function buildBookValue(account: NormalizedAccount): BookValueSummary {
  const entries = account.deals.map((deal): BookValue => {
    const verifiedBackingIds = deal.amountEvidence
      .filter((evidence) => (evidence.kind === "file" || evidence.kind === "record") && evidence.status === "verified")
      .map((evidence) => evidence.sourceId);
    const isVerified = hasVerifiedAmountEvidence(deal) && verifiedBackingIds.length > 0;
    const invalidVerifiedLabel = deal.valueStatus === "verified" && !isVerified;
    const status: EvidenceStatus = deal.value === null ? "unknown" : isVerified ? "verified" : invalidVerifiedLabel ? "unknown" : deal.valueStatus;
    const rules = [rule("value-evidence-gate", isVerified
      ? "Amount has verified status and at least one verified file or record backing id."
      : "Amount is excluded from verified pipeline unless a verified file/record backs it."),
    ...(invalidVerifiedLabel ? [rule("reject-unbacked-verified-label", "The input's verified label lacked verified file/record evidence, so its effective status is unknown.")] : [])];
    if (deal.value === null) rules.push(rule("missing-value", "No amount is established; display Not established."));
    return {
      dealId: deal.sourceId,
      title: deal.title,
      stage: deal.stage ?? "Not established",
      value: deal.value,
      displayValue: deal.value ?? "Not established",
      amountEvidenceIds: unique(verifiedBackingIds.length ? verifiedBackingIds : deal.amountEvidenceIds),
      status,
      currency: "unknown",
      evidenceIds: unique([...verifiedBackingIds, ...deal.amountEvidenceIds, ...deal.evidenceIds]),
      rules,
    };
  });
  const verified = entries.filter((entry) => entry.status === "verified");
  const unverified = entries.filter((entry) => entry.status !== "verified");
  return {
    verifiedPipeline: {
      value: verified.reduce((sum, entry) => sum + (entry.value ?? 0), 0),
      deals: verified,
      evidenceIds: unique(verified.flatMap((entry) => entry.amountEvidenceIds)),
    },
    unverified,
    totalUnverified: unverified.every((entry) => entry.value !== null)
      ? unverified.reduce((sum, entry) => sum + (entry.value ?? 0), 0)
      : null,
    rules: [rule("verified-pipeline-only", "Only verified amounts backed by evidence ids are summed into verifiedPipeline; claims and unknowns remain separate.")],
  };
}

function roleMatch(role: PowerRole, title: string): boolean {
  const text = title.toLowerCase();
  if (role === "pays") return /finance|procurement|commercial|buyer|accounts/.test(text);
  if (role === "uses") return /operator|pilot|drone unit|operations|user/.test(text);
  if (role === "technicalStakeholders") return /technical|engineer|it |security|data protection|technology/.test(text);
  if (role === "couldBlock") return /legal|security|data protection|finance|procurement/.test(text);
  return false;
}

function relationship(value: string | undefined): PowerMapEntry["relationshipStatus"] {
  return value === "guarded" || value === "neutral" || value === "warm" || value === "ally" ? value : "unknown";
}

export function buildPowerMap(account: NormalizedAccount): PowerMapDeal[] {
  return account.deals.map((deal) => {
    const roleEntries = roles.map((role): PowerMapEntry => {
      const matches = account.people.filter((person) => roleMatch(role, person.role));
      const people = matches.map((person) => ({ personId: person.sourceId, name: person.name, title: person.role, relationship: relationship(person.relationship) }));
      const status: PowerMapEntry["status"] = matches.length ? "assumption" : "unknown";
      const evidenceIds = sourceIds(...matches.map((person) => person.sourceId));
      const relations = [...new Set(people.map((person) => person.relationship))];
      const relationshipStatus = relations.length === 1 ? relations[0] : "unknown";
      return {
        role,
        status,
        relationshipStatus,
        peopleStatus: people.length ? "identified" : "not introduced",
        people,
        evidenceIds,
        rules: [rule("role-title-hint", matches.length
          ? "Title keyword is only a discovery hint; the title does not establish this person's deal authority or behavior."
          : "No source identifies a person in this role; leave unknown." )],
      };
    });
    return {
      dealId: deal.sourceId,
      title: deal.title,
      roles: roleEntries,
      evidenceIds: unique(roleEntries.flatMap((entry) => entry.evidenceIds)),
      rules: [rule("deal-specific-role-evidence", "Roles are not promoted from account-level presence without evidence tied to the role; title matches remain assumptions.")],
    };
  });
}

function scoreAction(deal: Deal, account: NormalizedAccount, asOf?: string): Omit<Action, "rank"> {
  const impact = (deal.value !== null ? 2 : 0) + (/renew/i.test(deal.title) ? 2 : 0);
  const urgency = deal.deadline?.passed ? 4 : deal.deadline?.soon ? 3 : deal.deadline ? 2 : 0;
  const likelihood = /won|contracted|committed/i.test(deal.stage ?? "") ? 3 : /qualified/i.test(deal.stage ?? "") ? 2 : deal.stage ? 1 : 0;
  const confidence = hasVerifiedAmountEvidence(deal) ? 3 : deal.valueStatus === "told" ? 2 : deal.valueStatus === "claim" ? 1 : 0;
  const score = impact + urgency + likelihood + confidence;
  const evidenceIds = unique([...sourceIds(deal.sourceId), ...deal.evidenceIds, ...deal.amountEvidenceIds]);
  const proposalDate = asOf ? new Date(`${asOf}T00:00:00.000Z`) : null;
  if (proposalDate && !Number.isNaN(proposalDate.getTime())) proposalDate.setUTCDate(proposalDate.getUTCDate() + 7);
  const proposedDate = proposalDate && !Number.isNaN(proposalDate.getTime()) ? proposalDate.toISOString().slice(0, 10) : null;
  const proposed = !deal.deadline?.date;
  return {
    score,
    description: deal.blocker ? `Resolve blocker: ${deal.blocker}` : `Confirm next step and decision process for ${deal.title}`,
    account: account.sourceId,
    relatedDeal: deal.sourceId,
    owner: "Not established",
    deadline: {
      date: deal.deadline?.date ?? proposedDate,
      label: deal.deadline?.date ? "From data" : proposedDate ? `Set by us (${proposedDate}; proposed)` : "Set by us (proposed date; calendar date not established)",
      proposed,
    },
    reason: `Impact ${impact}, urgency ${urgency}, likelihood ${likelihood}, evidence confidence ${confidence}.`,
    scoreBreakdown: { impact, urgency, likelihood, confidence },
    evidenceIds,
    rules: [
      rule("action-impact", "Two impact points for a reported amount plus two for a renewal title; no monetary weighting is inferred."),
      rule("action-urgency", "Urgency uses explicit passed/soon flags or a stored deadline object; absent deadline scores zero."),
      rule("action-likelihood", "Qualified stage scores above identified; a stage is not treated as a committed outcome."),
      rule("action-confidence", "Confidence follows the amount's evidence status; evidence ids are attached for review."),
      rule("proposed-date", proposed
        ? asOf ? `No dated deadline is stored; the proposed date is seven days after ${asOf}.` : "No dated deadline or stored as-of date is available; label the next step as proposed without inventing a calendar date."
        : "Deadline date came from stored data."),
      rule("owner-unknown", "No action owner is established in the available data."),
    ],
  };
}

export function buildFirstThree(account: NormalizedAccount, asOf?: string): Action[] {
  const dealActions = account.deals.map((deal) => {
    return scoreAction(deal, account, asOf);
  });
  const signalActions = buildSignalActions(account, asOf);
  return [...dealActions, ...signalActions].sort((a, b) => b.score - a.score || (a.relatedDeal ?? "").localeCompare(b.relatedDeal ?? ""))
    .slice(0, 3)
    .map((action, index) => ({ ...action, rank: index + 1 }));
}

function signalText(event: NormalizedEvent): string {
  return [event.title, ...Object.values(event.raw ?? event.fields).filter((value) => typeof value === "string")].filter(Boolean).join(" ");
}

function eventPerson(account: NormalizedAccount, event: NormalizedEvent): NormalizedAccount["people"][number] | null {
  const text = signalText(event).toLowerCase();
  const personId = event.raw?.person_id ?? event.raw?.stakeholder_id;
  return account.people.find((person) => person.sourceId === personId || text.includes(person.name.toLowerCase())) ?? null;
}

function successorUnestablished(event: NormalizedEvent, text: string): boolean {
  const raw = event.raw ?? event.fields;
  const successor = raw.successor ?? raw.replacement ?? raw.successor_name ?? raw.replacement_name;
  return successor === undefined || successor === null || successor === "" || /no (named )?successor|no replacement|without a successor|successor not (named|identified|appointed)/i.test(text);
}

function eventAction(account: NormalizedAccount, event: NormalizedEvent, asOf: string | undefined, kind: "departure" | "written-request" | "usage-investigation", relatedPersonId: string | null): Omit<Action, "rank"> {
  const scoreParts = kind === "departure"
    ? { impact: 2, urgency: event.date ? 2 : 0, likelihood: 2, confidence: event.confidence === "high" ? 3 : event.confidence === "low" ? 1 : 0 }
    : kind === "written-request"
      ? { impact: 1, urgency: event.date ? 2 : 1, likelihood: 2, confidence: event.confidence === "high" ? 3 : event.confidence === "low" ? 1 : 0 }
      : { impact: 2, urgency: 2, likelihood: 2, confidence: event.confidence === "high" ? 3 : event.confidence === "low" ? 1 : 0 };
  const evidenceIds = sourceIds(event.sourceId, relatedPersonId);
  const proposal = asOf ? new Date(`${asOf}T00:00:00.000Z`) : null;
  if (proposal && !Number.isNaN(proposal.getTime())) proposal.setUTCDate(proposal.getUTCDate() + 7);
  const proposedDate = proposal && !Number.isNaN(proposal.getTime()) ? proposal.toISOString().slice(0, 10) : null;
  const date = event.date ?? proposedDate;
  const description = kind === "departure"
    ? "Confirm the successor and document the handover."
    : kind === "written-request"
      ? "Respond to the unanswered request in writing before the related event."
      : "Investigate why connected equipment is not being used for flights.";
  return {
    score: scoreParts.impact + scoreParts.urgency + scoreParts.likelihood + scoreParts.confidence,
    description,
    account: account.sourceId,
    relatedDeal: event.dealId ?? null,
    owner: "Not established",
    deadline: { date, label: event.date ? "From signal data" : proposedDate ? `Set by us (${proposedDate}; proposed)` : "Set by us (proposed date; calendar date not established)", proposed: !event.date },
    reason: `Signal-driven action; impact ${scoreParts.impact}, urgency ${scoreParts.urgency}, likelihood ${scoreParts.likelihood}, evidence confidence ${scoreParts.confidence}.`,
    scoreBreakdown: scoreParts,
    evidenceIds,
    rules: [
      rule(`signal-action-${kind}`, "Action was generated from this stored signal's text and fields."),
      rule("signal-match-confidence", event.matchedBy === "keyword" ? "Account/deal association was matched by keyword and is lower confidence." : event.matchedBy === "field" ? "Account/deal association came from explicit signal fields." : "The event is not confidently matched to account fields."),
      rule("signal-date", event.date ? "Action date uses the event date stored in the signal; confirm whether it is a hard deadline." : "No event date is stored; any date shown is proposed by us."),
    ],
  };
}

function buildSignalActions(account: NormalizedAccount, asOf?: string): Array<Omit<Action, "rank">> {
  const actions: Array<Omit<Action, "rank">> = [];
  for (const event of account.events) {
    const text = signalText(event);
    const person = eventPerson(account, event);
    if (/\b(leav(?:e|es|ing)?|depart(?:s|ed|ure)?|retir(?:e|es|ing))\b/i.test(text) && successorUnestablished(event, text)) {
      actions.push(eventAction(account, event, asOf, "departure", person?.sourceId ?? null));
    }
    const unanswered = /unanswered|no reply|no response|awaiting response|never replied|not replied/i.test(text);
    const written = /written|in writing|email|letter/i.test(text);
    if (unanswered && written && person) actions.push(eventAction(account, event, asOf, "written-request", person.sourceId));
    const duration = durationDays(event);
    if (/(online|connected)/i.test(text) && /(not flying|no flights|not flown|no missions|not being flown)/i.test(text) && duration >= 14 && !hasRelatedTicket(account, event)) {
      actions.push(eventAction(account, event, asOf, "usage-investigation", null));
    }
  }
  return actions;
}

function durationDays(event: NormalizedEvent): number {
  const raw = event.raw ?? event.fields;
  for (const [key, value] of Object.entries(raw)) if (/days|duration/i.test(key) && typeof value === "number") return value;
  const text = signalText(event);
  const numeric = text.match(/(\d+)\s+days?/i);
  if (numeric) return Number(numeric[1]);
  if (/two weeks|fortnight/i.test(text)) return 14;
  return 0;
}

function hasRelatedTicket(account: NormalizedAccount, event: NormalizedEvent): boolean {
  const raw = event.raw ?? event.fields;
  const ticketId = raw.ticket_id ?? raw.ticketId;
  if (typeof ticketId === "string" && account.paperwork.tickets.some((ticket) => ticket.sourceId === ticketId)) return true;
  const words = new Set((signalText(event).toLowerCase().match(/[a-z0-9]{5,}/g) ?? []));
  return account.paperwork.tickets.some((ticket) => {
    const text = JSON.stringify(ticket.fields).toLowerCase();
    return [...words].filter((word) => text.includes(word)).length >= 2;
  });
}

function makeRisk(account: NormalizedAccount, deal: Deal | null, severity: Risk["severity"], trigger: string, ruleName: string, ids: string[], sourceDate: string | null = null): Risk {
  const date = deal?.deadline?.date ?? sourceDate;
  return {
    account: account.sourceId,
    relatedDeal: deal?.sourceId ?? null,
    severity,
    trigger,
    date,
    dateLabel: date ? "From data" : "Not established",
    evidenceIds: unique(ids),
    rules: [rule(ruleName, trigger)],
  };
}

export function buildRisks(account: NormalizedAccount): Risk[] {
  const risks: Risk[] = [];
  if (!account.recordTypesPresent.includes("usage")) {
    risks.push(makeRisk(account, null, "low", "No usage records are present; usage decline cannot be assessed.", "usage-data-absent", []));
  }
  if (!account.recordTypesPresent.includes("tickets") && !account.recordTypesPresent.includes("devices")) {
    risks.push(makeRisk(account, null, "low", "No ticket or device records are present; technical blocker and offline-device rules cannot be assessed.", "technical-data-absent", []));
  }
  for (const usage of account.paperwork.usage) {
    const signal = Object.entries(usage.fields).some(([key, value]) => {
      const name = key.toLowerCase();
      if (!/usage|trend|change|delta|direction|percent/.test(name)) return false;
      if (typeof value === "number") return value < 0;
      return typeof value === "string" && /declin|decreas|downward|falling/i.test(value);
    });
    if (signal && usage.sourceId) {
      const dateValue = usage.fields.date ?? usage.fields.created_at ?? usage.fields.timestamp;
      risks.push(makeRisk(account, null, "medium", "Usage record indicates a decline; investigate the cause. This is not a churn label.", "usage-decline-investigate", [usage.sourceId], typeof dateValue === "string" ? dateValue : null));
    }
  }
  for (const ticket of account.paperwork.tickets) {
    const text = Object.values(ticket.fields).filter((value) => typeof value === "string").join(" ");
    const status = typeof ticket.fields.status === "string" ? ticket.fields.status : "";
    if (/block|offline|failed|critical|unresolved/i.test(`${text} ${status}`) && ticket.sourceId) {
      risks.push(makeRisk(account, null, /critical|offline|failed/i.test(`${text} ${status}`) ? "high" : "medium", "Ticket contains an unresolved or technical blocker signal.", "technical-ticket-blocker", [ticket.sourceId]));
    }
  }
  for (const device of account.paperwork.devices) {
    const text = Object.values(device.fields).filter((value) => typeof value === "string").join(" ");
    const offline = /offline|disconnected/i.test(text) || device.fields.online === false || device.fields.connected === false;
    if (offline && device.sourceId) risks.push(makeRisk(account, null, "high", "Device record explicitly reports offline or disconnected status.", "device-offline", [device.sourceId]));
  }
  for (const deal of account.deals) {
    if (/renew/i.test(deal.title)) risks.push(makeRisk(account, deal, "medium", "Renewal opportunity exists; renewal outcome and value remain uncertain until backed by records.", "renewal-uncertainty", [...sourceIds(deal.sourceId), ...deal.evidenceIds]));
    if (deal.blocker) risks.push(makeRisk(account, deal, "high", `Open deal blocker recorded: ${deal.blocker}`, "open-deal-blocker", [...sourceIds(deal.sourceId), ...deal.evidenceIds]));
    if (/adoption|idle|usage|never flown/i.test(`${deal.title} ${deal.blocker ?? ""}`)) {
      risks.push(makeRisk(account, deal, "medium", `Adoption concern appears in the deal title or blocker: ${deal.title}${deal.blocker ? `; ${deal.blocker}` : ""}`, "adoption-concern-reported", [...sourceIds(deal.sourceId), ...deal.evidenceIds]));
    }
    if (deal.deadline) risks.push(makeRisk(account, deal, deal.deadline.passed ? "high" : "medium", `Deadline or departure concern recorded: ${deal.deadline.text}`, "explicit-deadline", [...sourceIds(deal.sourceId), ...deal.evidenceIds]));
    if (deal.value !== null && deal.valueStatus !== "verified") risks.push(makeRisk(account, deal, "medium", `Deal amount ${deal.value} is ${deal.valueStatus} and has no verified backing in this dataset.`, "unverified-customer-value", [...sourceIds(deal.sourceId), ...deal.amountEvidenceIds]));
    risks.push(makeRisk(account, deal, "medium", "Decision-maker is not established for this deal.", "unknown-decision-maker", sourceIds(deal.sourceId)));
    if ((/stalled/i.test(deal.stage ?? "") || /approval|decision maker|awaiting sign.?off/i.test(deal.blocker ?? "")) && !account.people.some((person) => /decision maker|economic buyer|signatory/i.test(person.role))) {
      risks.push(makeRisk(account, deal, "high", "Deal is stalled or awaiting approval while its decision-maker remains unknown.", "stalled-unknown-decision-maker", [...sourceIds(deal.sourceId), ...deal.evidenceIds]));
    }
  }
  for (const fact of account.facts) {
    if (/nobody replied|no reply|unanswered|never replied/i.test(fact.text)) {
      risks.push(makeRisk(account, null, "high", `Unanswered request reported: ${fact.text}`, "unanswered-request-reported", sourceIds(fact.sourceId)));
    }
    if (/never flown|never used|idle|not operational|poor adoption|not adopted/i.test(fact.text)) {
      risks.push(makeRisk(account, null, "medium", `Adoption concern reported: ${fact.text}`, "adoption-concern-reported", sourceIds(fact.sourceId)));
    }
    if (/deputy leaves|leaving|departure/i.test(fact.text)) {
      risks.push(makeRisk(account, null, "medium", `Stakeholder departure reported: ${fact.text}`, "stakeholder-departure-reported", sourceIds(fact.sourceId)));
    }
  }
  for (const deadline of account.deadlines) {
    const alreadyOnDeal = account.deals.some((deal) => deal.deadline?.text === deadline.text);
    if (!alreadyOnDeal && /leav|depart|deadline|due|by /i.test(deadline.text)) {
      risks.push(makeRisk(account, null, "medium", `Deadline or departure concern recorded: ${deadline.text}`, "explicit-deadline", deadline.sourceId ? [deadline.sourceId] : [], deadline.date));
    }
  }
  for (const record of [...account.paperwork.calls, ...account.paperwork.emails]) {
    const text = Object.values(record.fields).filter((value) => typeof value === "string").join(" ");
    if (/no reply|unanswered|awaiting response|no response/i.test(text) && record.sourceId) {
      risks.push(makeRisk(account, null, "medium", "Communication record indicates an unanswered request.", "unanswered-request-record", [record.sourceId]));
    }
  }
  for (const event of account.events) {
    const text = signalText(event);
    const person = eventPerson(account, event);
    const matchedEvidence = sourceIds(event.sourceId, person?.sourceId);
    const matchNote = event.matchedBy === "keyword" ? " Account association is matched by keyword (lower confidence)." : "";
    if (/\b(leav(?:e|es|ing)?|left|depart(?:s|ed|ure)?|retir(?:e|es|ing))\b/i.test(text) && successorUnestablished(event, text)) {
      risks.push(makeRisk(account, null, "high", `Stakeholder departure reported; successor is not established in stored signal fields.${matchNote}`, "signal-stakeholder-departure", matchedEvidence, event.date ?? null));
    }
    if (/unanswered|no reply|no response|awaiting response|never replied|not replied/i.test(text) && /written|in writing|email|letter/i.test(text) && person) {
      risks.push(makeRisk(account, null, "high", `Written request to ${person.name} is reported unanswered before the related event.${matchNote}`, "signal-unanswered-written-request", matchedEvidence, event.date ?? null));
    }
    if (/(online|connected)/i.test(text) && /(not flying|no flights|not flown|no missions|not being flown)/i.test(text) && durationDays(event) >= 14 && !hasRelatedTicket(account, event)) {
      risks.push(makeRisk(account, null, "medium", `Connected equipment has no recorded flight activity for at least two weeks; investigate cause, not churn.${matchNote} Possible causes to check: network, plant schedule, ownership/handover, hardware.`, "signal-usage-decline-investigate", matchedEvidence, event.date ?? null));
    }
  }
  return risks;
}

export function buildUnknowns(account: NormalizedAccount): UnknownItem[] {
  const unknowns: UnknownItem[] = [];
  for (const deal of account.deals) {
    const add = (missingInfo: string, whyItMatters: string, whoCanAnswer: string, nextQuestion: string, evidenceIds: string[], ruleName: string) => {
      unknowns.push({
        account: account.sourceId,
        affectedDeal: deal.sourceId,
        missingInfo,
        whyItMatters,
        whoCanAnswer,
        nextQuestion,
        evidenceIds: unique(evidenceIds),
        rules: [rule(ruleName, `Required field is absent from stored source; ${missingInfo} remains unknown.`)],
      });
    };
    add("Decision-maker", "Deal authority and path to approval are unknown.", "Customer sponsor or procurement contact (not established)", "Who has final approval for this deal, and what is the approval path?", sourceIds(deal.sourceId), "missing-decision-maker");
    if (deal.value === null) add("Deal amount", "Revenue impact cannot be quantified.", "Account owner (not established)", "What amount and term are approved in a signed quote or contract?", sourceIds(deal.sourceId), "missing-deal-value");
    if (!deal.deadline?.date) add("Dated deadline", "Urgency cannot be tied to a calendar date.", "Customer contact tied to the blocker (not established)", "What date must this be resolved by?", sourceIds(deal.sourceId), "missing-deadline-date");
  }
  for (const role of roles) {
    const matches = account.people.filter((person) => roleMatch(role, person.role));
    if (!matches.length) unknowns.push({
      account: account.sourceId,
      affectedDeal: null,
      missingInfo: `People identified as ${role}`,
      whyItMatters: `The ${role} role is not established in the account export.`,
      whoCanAnswer: "Account sponsor (not established)",
      nextQuestion: `Who is the ${role} for this account?`,
      evidenceIds: [],
      rules: [rule("missing-power-role", "No stakeholder title in the stored data matched this role; no person is invented.")],
    });
  }
  return unknowns;
}

export function buildAccountIntel(data: NormalizedData, accountId: string): AccountIntel | null {
  const account = data.accounts.find((item) => item.sourceId === accountId);
  if (!account) return null;
  return {
    account: account.sourceId,
    bookValue: buildBookValue(account),
    powerMap: buildPowerMap(account),
    firstThree: buildFirstThree(account, data.asOf),
    risks: buildRisks(account),
    unknowns: buildUnknowns(account),
  };
}
