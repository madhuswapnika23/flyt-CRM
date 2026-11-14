import { readNormalizedData } from "../lib/intel/data.ts";
import { buildAccountIntel } from "../lib/intel/index.ts";

const data = await readNormalizedData();
for (const account of data.accounts) {
  const intel = buildAccountIntel(data, account.sourceId);
  if (!intel) continue;
  const rulesByRisk = new Map();
  for (const risk of intel.risks) {
    for (const item of risk.rules) {
      const evidenceIds = rulesByRisk.get(item.name) ?? new Set();
      for (const id of risk.evidenceIds) evidenceIds.add(id);
      rulesByRisk.set(item.name, evidenceIds);
    }
  }
  console.log(JSON.stringify({
    account: account.sourceId,
    name: account.name,
    verifiedPipeline: { value: intel.bookValue.verifiedPipeline.value, backingIds: intel.bookValue.verifiedPipeline.evidenceIds },
    deals: [...intel.bookValue.verifiedPipeline.deals, ...intel.bookValue.unverified].map(({ dealId, stage, displayValue, status, amountEvidenceIds }) => ({ dealId, stage, value: displayValue, status, amountEvidenceIds })),
    unknownPowerRoles: [...new Set(intel.powerMap.flatMap(({ roles }) => roles.filter((entry) => entry.status === "unknown").map((entry) => entry.role)))],
    firstThree: intel.firstThree.map(({ rank, relatedDeal, score, deadline, evidenceIds, rules }) => ({ rank, relatedDeal, score, deadline, evidenceIds, rules: rules.map((item) => item.name) })),
    firedRiskRules: [...rulesByRisk.entries()].map(([name, evidenceIds]) => ({ name, evidenceIds: [...evidenceIds] })),
    unknownCount: intel.unknowns.length,
    thinData: ["usage decline: no usage records", "technical incident: no ticket/device records", "dated deadlines: none established", "deal decision makers: unknown"],
  }, null, 2));
}
