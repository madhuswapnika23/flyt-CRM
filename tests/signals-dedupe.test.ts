import { it, expect } from "vitest";
import { get } from "@/lib/store";
import { readNormalizedData } from "@/lib/intel/data";
import { dedupeSignalBatch, extractSignalRecords } from "@/lib/signals";

it("replays stored initial signals twice without adding duplicate event ids", async ({ skip }) => {
  const initial = await get<unknown>("signals:initial");
  if (initial === null) {
    skip("No stored initial signals are available; run the guarded sync to populate signals:initial.");
    return;
  }
  const sourceEvents = extractSignalRecords(initial);
  if (!sourceEvents.length) {
    skip("The stored initial signals response contains no recognizable signal records.");
    return;
  }
  const data = await readNormalizedData();
  const firstReplay = dedupeSignalBatch(sourceEvents, data.accounts);
  const secondReplay = dedupeSignalBatch([...sourceEvents, ...sourceEvents], data.accounts);
  expect(secondReplay).toHaveLength(firstReplay.length);
  expect(secondReplay.map((event) => event.eventId)).toEqual(firstReplay.map((event) => event.eventId));
});
