import { describe, expect, it } from "vitest";
import { readNormalizedData } from "@/lib/intel/data";
import { buildAccountIntel, buildBookValue, buildPowerMap, buildRisks } from "@/lib/intel";

describe("account intelligence against stored probe data", () => {
  it("keeps claim amounts out of verified pipeline and reports evidence-backed rules", async () => {
    const data = await readNormalizedData();
    expect(data.accounts).toHaveLength(2);
    for (const account of data.accounts) {
      const intel = buildAccountIntel(data, account.sourceId);
      expect(intel).not.toBeNull();
      expect(intel!.bookValue.verifiedPipeline.value).toBe(0);
      expect(intel!.bookValue.unverified.every((deal) => deal.status !== "verified")).toBe(true);
      expect(intel!.firstThree.every((action, index) => action.rank === index + 1)).toBe(true);
    }

    const accountA = buildAccountIntel(data, "A")!;
    expect(data.schemaAvailable).toBe(false);
    expect(accountA.risks.some((risk) => risk.rules.some((item) => item.name === "usage-data-absent"))).toBe(true);
    expect(accountA.risks.some((risk) => /churn/i.test(risk.trigger))).toBe(false);
    expect(accountA.powerMap[0].roles.every((role) => role.relationshipStatus !== undefined)).toBe(true);
    console.log("STORED DATA INTEL SUMMARY:", JSON.stringify(data.accounts.map((account) => {
      const intel = buildAccountIntel(data, account.sourceId)!;
      return {
        account: account.sourceId,
        deals: account.deals.length,
        verifiedPipeline: intel.bookValue.verifiedPipeline.value,
        unverified: intel.bookValue.unverified.map(({ dealId, value, status }) => ({ dealId, value, status })),
        firstThree: intel.firstThree.map(({ rank, relatedDeal, score, rules }) => ({ rank, relatedDeal, score, firedRules: rules.map((item) => item.name) })),
        firedRiskRules: [...new Set(intel.risks.flatMap((risk) => risk.rules.map((item) => item.name)))],
        thinData: ["no usage records", "no ticket/device records", "no dated deadlines", "deal decision-makers not established"],
      };
    }), null, 2));
    expect(accountA.powerMap[0].roles.some((role) => role.status === "unknown")).toBe(true);
  });

  it("requires verified file or record evidence before summing a deal", async () => {
    const data = await readNormalizedData();
    const source = data.accounts[0];
    const candidate = source.deals[0];
    const result = buildBookValue({
      ...source,
      deals: [
        { ...candidate, sourceId: "verified_deal", value: 25, valueStatus: "verified", amountEvidenceIds: ["contract_1"], amountEvidence: [{ sourceId: "contract_1", kind: "record", status: "verified" }] },
        { ...candidate, sourceId: "claim_deal", value: 1000, valueStatus: "claim", amountEvidenceIds: ["claim_deal"], amountEvidence: [{ sourceId: "claim_deal", kind: "claim", status: "claim" }] },
        { ...candidate, sourceId: "unsupported_deal", value: 500, valueStatus: "verified", amountEvidenceIds: ["unsupported_deal"], amountEvidence: [{ sourceId: "unsupported_deal", kind: "claim", status: "verified" }] },
      ],
    });
    expect(result.verifiedPipeline.value).toBe(25);
    expect(result.verifiedPipeline.evidenceIds).toContain("contract_1");
    expect(result.unverified.map((deal) => deal.dealId)).toEqual(["claim_deal", "unsupported_deal"]);
  });

  it("keeps inferred role matches as assumptions and unknown roles explicit", async () => {
    const data = await readNormalizedData();
    const powerMap = buildPowerMap(data.accounts.find((account) => account.sourceId === "A")!);
    const financeRole = powerMap.flatMap((deal) => deal.roles).find((role) => role.role === "pays");
    expect(financeRole?.status).toBe("assumption");
    expect(financeRole?.relationshipStatus).toBe("guarded");
    expect(powerMap.flatMap((deal) => deal.roles).some((role) => role.peopleStatus === "not introduced")).toBe(true);
    expect(buildRisks(data.accounts[0]).some((risk) => risk.rules.some((item) => item.name === "usage-data-absent"))).toBe(true);
  });
});
