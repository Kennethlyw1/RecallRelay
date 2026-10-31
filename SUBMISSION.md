# RecallRelay — submission copy

## Project name

RecallRelay — Evidence-driven recall response

## Project description

When a supplier recalls one ingredient lot, the difficult question is which downstream products, orders and outlets are affected—especially when a production record is incomplete.

RecallRelay connects source evidence to a verified response. Nosana interprets the recall notice. Neo4j traces the recalled lot through production batches, orders and outlets. Daytona executes shipment holds in an isolated synthetic order system and reads the results back to verify success. Verified actions and their evidence are retained in Neo4j.

The demonstration starts with four confirmed affected orders and one unresolved delivery. The agent verifies holds covering 84 units and prepares two outlet notice drafts. A new delivery note establishes the missing lot connection. The agent updates the affected network, adds a 32-unit hold and reuses the four actions already verified. A repeat run avoids all five duplicate actions.

The distinctive workflow is evidence-driven revision: incomplete records remain unresolved; supported new evidence changes the decision; verified response memory changes what the next run does. Documents cannot generate executable code or arbitrary database queries.

The prototype includes an interactive graph, source inspection, response register, activity history, evidence export and seven domain tests. All three sponsor integrations are live. All supply-chain data is fictional, order changes are simulated, and notices remain drafts. This is a functional prototype, not a production compliance product.

## Product status

Functional Prototype

## 90-second demonstration script

| Time | Show | Explain |
|---|---|---|
| 0–12 seconds | Fresh scenario and recall notice | One ingredient is recalled. Production and delivery records are fragmented, and one delivery has no ingredient-lot assignment. |
| 12–30 seconds | Run recall agent; show the graph and activity | Nosana reads the notice. Neo4j identifies four confirmed affected orders while keeping one delivery unresolved. |
| 30–42 seconds | Order response register | Daytona executes and reads back two shipment holds covering 84 units. Two already delivered orders receive notice drafts. |
| 42–60 seconds | Add the delivery note; verify and continue | The source explicitly connects lot B17 to production batch P204 and order O1007. New evidence changes the affected network. |
| 60–75 seconds | Airport Kitchen and updated result | The agent adds one 32-unit hold. The earlier four verified actions are reused. The result is 116 units held and no unresolved lot connection. |
| 75–90 seconds | Recheck response, activity memory and evidence pack | All five verified actions are remembered. The agent takes no duplicate action. Source evidence and execution receipts remain inspectable. |

## Before submitting

- Use the public GitHub repository URL, not a localhost URL or local ZIP path.
- Verify that the repository opens while signed out and that screenshots and the recorded walkthrough load.
- Provide team names and team email addresses in the submission form.
- The public presentation deck field is optional. The form does not have a separate demo-link field; keep the walkthrough prominent in the repository.
- Keep `.env`, credentials, runtime files and `node_modules` out of the repository.
- Describe all unit quantities as demonstration results, not commercial savings or a claim that a live recall was performed.
