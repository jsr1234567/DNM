import { OpenRouterClient } from "../src/ai/openrouter.ts";
import { runBountyMatching } from "../src/bounties/match.ts";
import { closeDatabase, openDatabase } from "../src/db/index.ts";

const db = await openDatabase();
const client = new OpenRouterClient();
try {
  const result = await runBountyMatching(db, client);
  console.log(`Bounty matching: open=${result.openBountiesScanned} filtered=${result.helperPairsFiltered} scored=${result.helperPairsScored} candidates=${result.candidatesCreated}.`);
  console.log("Candidates are stored privately. Run the app to deliver asks; the one-shot script never assumes a message was delivered.");
} finally { closeDatabase(db); }
