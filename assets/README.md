# Recorded walkthrough

All screens show the running RecallRelay application using live Nosana, Neo4j Aura and Daytona services on 31 October 2026. Supply-chain data is fictional. Shipment holds run in a simulated order ledger, and notices remain drafts.

`demo.gif` sequences selected actual UI states with shortened display timing. It is a walkthrough, not a real-time screen recording.

1. `01-start.png`: fresh scenario, before the recall trace.
2. `02-first-response.png`: four affected orders, 84 units on verified hold, one evidence gap.
3. `03-evidence-gap.png`: production batch P204 lacks an ingredient-lot assignment.
4. `04-new-evidence.png`: the delivery note explicitly identifies lot B17, batch P204 and order O1007.
5. `05-expanded-response.png`: the new connection adds one 32-unit hold and reuses four verified actions.
6. `06-memory-reuse.png`: final scope and a repeat run with no new actions.

`demo-results.json` records the observed quantities and timings. These results describe one synthetic demonstration and do not establish commercial savings or a benchmark against manual work.
