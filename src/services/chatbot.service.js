import { openai } from "../config/openai.js";
import {
  tool_getPolicyById,
  tool_searchPolicies,
  tool_diffPolicies,
  tool_whoIsAffected,
  tool_getPolicyByFileName,
  tool_diffPoliciesByFileName,
  tool_getUserProfile,
  tool_getMyProfile,
  tool_bestPolicyByCoverage,
  tool_bestPolicyForMeByCoverage,
  tool_computeCostWithProvidedPrices,
} from "./chatbot.tools.js";

// NOTE: keep the prompt tightly scoped to tool-use rules
const SYSTEM_PROMPT = `
You are a helpful assistant for a healthcare insurance admin app.
You must never answer coverage or cost questions from memory — always call tools.
If the user supplies medication prices directly (e.g., "Metformin: $50"), compute out-of-pocket using ONLY those prices plus the policy's coverage_map via computeCostWithProvidedPrices. Do not look up prices.
If a policy is referenced by a human-readable name, resolve it by name or filename before computing.
If a question is conversational (no policy facts), answer briefly; otherwise call tools.
Cite policy IDs and field names from tool results. If a tool returns nothing, say so.
Never include any dollar amounts in coverage summaries unless you have called computeCostWithProvidedPrices in this turn. If prices were not provided by the user, do not infer, estimate, or assume any prices. For any user message that includes medication names with dollar amounts, you MUST compute using computeCostWithProvidedPrices.
For queries that ask to choose or rank a policy based on the user's current medications, you MUST call bestPolicyForMeByCoverage (or bestPolicyByCoverage when medications are explicitly provided).
Do not answer such queries from memory or with generic text.

`;

// Single source of truth for callable tools
const TOOL_REGISTRY = {
  bestPolicyByCoverage: {
    fn: tool_bestPolicyByCoverage,
    schema: {
      type: "function",
      function: {
        name: "bestPolicyByCoverage",
        description: "Rank policies by how many of the given medications they cover (no prices).",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            medications: { type: "array", items: { type: "string" } },
            userId: { type: "string", description: "If medications not provided, load this user's meds" },
            candidateFiles: { type: "array", items: { type: "string" }, description: "Optional beFileName filter" },
            topK: { type: "number", default: 5 },
            preferLatest: { type: "boolean", default: true },
          },
        },
      },
    },
  },
  bestPolicyForMeByCoverage: {
    fn: tool_bestPolicyForMeByCoverage,
    schema: {
      type: "function",
      function: {
        name: "bestPolicyForMeByCoverage",
        description: "Use the authenticated user's meds to find the best-covering policies (no prices).",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            candidateFiles: { type: "array", items: { type: "string" } },
            topK: { type: "number", default: 5 },
            preferLatest: { type: "boolean", default: true },
            userId: { type: "string", description: "Optional override; otherwise uses context.userId" },
          },
        },
      },
    },
  },
  getMyProfile: {
    fn: tool_getMyProfile,
    schema: { type: "function", function: { name: "getMyProfile", description: "Return the signed-in user's medications and insuredAt (from server context).", parameters: { type: "object", properties: {} } } },
  },
  getUserProfile: {
    fn: tool_getUserProfile,
    schema: {
      type: "function",
      function: {
        name: "getUserProfile",
        description: "Get a user's medications and insured policies by userId.",
        parameters: { type: "object", properties: { userId: { type: "string" } }, required: ["userId"] },
      },
    },
  },
  getPolicyById: {
    fn: tool_getPolicyById,
    schema: {
      type: "function",
      function: {
        name: "getPolicyById",
        description: "Fetch a policy by Firestore document ID (policies/{id}).",
        parameters: { type: "object", properties: { policyId: { type: "string" } }, required: ["policyId"] },
      },
    },
  },
  getPolicyByFileName: {
    fn: tool_getPolicyByFileName,
    schema: {
      type: "function",
      function: {
        name: "getPolicyByFileName",
        description: "Fetch a policy by its beFileName (like POL_SUN_GENERAL_2026-01-01.pdf).",
        parameters: { type: "object", properties: { beFileName: { type: "string" } }, required: ["beFileName"] },
      },
    },
  },
  searchPolicies: {
    fn: tool_searchPolicies,
    schema: {
      type: "function",
      function: {
        name: "searchPolicies",
        description: "Search policies by partial name or filename.",
        parameters: { type: "object", properties: { q: { type: "string" }, limit: { type: "number" } }, required: ["q"] },
      },
    },
  },
  diffPoliciesByFileName: {
    fn: tool_diffPoliciesByFileName,
    schema: {
      type: "function",
      function: {
        name: "diffPoliciesByFileName",
        description: "Compare two policies by beFileName and list changed medications.",
        parameters: { type: "object", properties: { oldFile: { type: "string" }, newFile: { type: "string" } }, required: ["oldFile", "newFile"] },
      },
    },
  },
  diffPolicies: {
    fn: tool_diffPolicies,
    schema: {
      type: "function",
      function: {
        name: "diffPolicies",
        description: "Compare two policies and list changed medications.",
        parameters: { type: "object", properties: { oldPolicyId: { type: "string" }, newPolicyId: { type: "string" } }, required: ["oldPolicyId", "newPolicyId"] },
      },
    },
  },
  whoIsAffected: {
    fn: tool_whoIsAffected,
    schema: {
      type: "function",
      function: {
        name: "whoIsAffected",
        description: "Return latest impact report(s) for a policy (affected patients).",
        parameters: {
          type: "object",
          properties: { policyId: { type: "string" }, beFileName: { type: "string" }, limit: { type: "number" } },
        },
      },
    },
  },
  computeCostWithProvidedPrices: {
    fn: tool_computeCostWithProvidedPrices,
    schema: {
      type: "function",
      function: {
        name: "computeCostWithProvidedPrices",
        description: "Compute total the user pays for given medications and their prices under a specific policy (no DB lookups).",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            beFileName: { type: "string", description: "Policy filename (preferred)" },
            policyId: { type: "string" },
            policyName: { type: "string", description: "Exact policy name if filename unknown" },
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: { medication: { type: "string" }, price: { type: "number" } },
                required: ["medication", "price"],
              },
              minItems: 1,
            },
          },
          required: ["items"],
        },
      },
    },
  },
};

const TOOLS = Object.values(TOOL_REGISTRY).map((t) => t.schema);
function isCoverageRankingQuery(text) {
  const t = String(text || "").toLowerCase();
  return (
    /based on (my|our) (current )?meds?/.test(t) ||
    /which policy (file )?(is|would be) the best fit/.test(t) ||
    /best policy (for me|by coverage)/.test(t) ||
    /rank (the )?polic(ies|y) by coverage/.test(t)
  );
}

function formatCoverageRanking(result) {
  if (!result?.ok) {
    return `Sorry — ${result?.error || "couldn’t rank policies by coverage."}`;
  }
  if (!result.ranking || result.ranking.length === 0) {
    return "No suitable policies found for your medications.";
  }

  const best = result.ranking[0];
  const s = best.score;
  const ratePct = Math.round((s.coverageRate || 0) * 100);

  return (
    `Best match for your current medications:\n\n` +
    `**${best.policy.beFileName || best.policy.name || best.policy.id}**\n` +
    `- ${s.coveredCount}/${s.totalMeds} meds covered (${ratePct}%, avg ${s.avgPercent.toFixed(0)}%)\n` +
    (best.policy.effectiveDate ? `- Effective: ${best.policy.effectiveDate}\n` : "") +
    (best.policy.version ? `- Version: ${best.policy.version}\n` : "")
  );
}


function extractCostQuery(text) {
  const t = String(text || "");
  const policyFile = (t.match(/\b[\w.-]+\.pdf\b/i) || [])[0] || null;

  // Matches: "Name: $12.34", "Name = 12", "Name $40"
  const items = [];
  const rx = /([A-Za-z][\w\s\-()\/]+?)\s*(?:[:=]|(?:\s))\s*\$?\s*([0-9]+(?:\.[0-9]+)?)/g;
  let m;
  while ((m = rx.exec(t)) !== null) {
    const medication = m[1].trim();
    const price = parseFloat(m[2]);
    // filter out the policy filename accidentally captured as med
    if (medication.toLowerCase().endsWith(".pdf")) continue;
    if (medication && !Number.isNaN(price)) items.push({ medication, price });
  }

  if (items.length > 0) return { policyFile, items };
  return null;
}

function formatCostAnswer(result) {
  if (!result?.ok) return `Sorry — ${result?.error || "couldn’t compute the cost."}`;
  const lines = result.items.map(it => {
    const status =
      it.coverage?.type === "covered" ? "covered" :
      it.coverage?.type === "percent" ? `${it.coverage.percent}% covered` :
      "not covered";
    return `- **${it.medication}**: $${it.inputPrice} → patient pays **$${it.patientCost}** (${status})`;
  });
  return [
    `Policy **${result.policy.beFileName || result.policy.name || result.policy.id}**`,
    ...lines,
    `\n**Total out-of-pocket:** $${result.totalPatientCost}`
  ].join("\n");
}


async function dispatchTool(name, args, context) {
  const entry = TOOL_REGISTRY[name];
  if (!entry) return { ok: false, error: `Unknown tool: ${name}` };
  try {
    return await entry.fn(args, context);
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// Utility: parse function args safely
function safeParse(json) {
  try {
    return JSON.parse(json || "{}");
  } catch {
    return {};
  }
}

export async function chatWithTools({ messages, context }) {
  const lastUser = [...messages].reverse().find(m => m.role === "user");

  // --- Preflight: cost computation if user supplied prices ---
  if (lastUser) {
    const parsed = extractCostQuery(lastUser.content);
    if (parsed) {
      const result = await dispatchTool(
        "computeCostWithProvidedPrices",
        { beFileName: parsed.policyFile, items: parsed.items },
        context
      );
      return { ok: true, answer: formatCostAnswer(result), toolResult: result };
    }
  }

  // --- Preflight: coverage ranking based on user's meds ---
  if (lastUser && isCoverageRankingQuery(lastUser.content)) {
    const result = await dispatchTool(
      "bestPolicyForMeByCoverage",
      { topK: 5, preferLatest: true }, // you can add candidateFiles if needed
      context
    );
    return { ok: true, answer: formatCoverageRanking(result), toolResult: result };
  }

  // 1) Ask the model how to respond and which tools to call
  const initial = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    tools: TOOLS,
    tool_choice: "auto",
  });

  const choice = initial.choices[0].message;

  // Start the follow-up conversation with system + user messages
  const convo = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

  if (!choice.tool_calls || choice.tool_calls.length === 0) {
    // No tool calls — return the model's direct answer
    return { ok: true, answer: choice.content ?? "" };
  }

  // IMPORTANT: Push the assistant message WITH tool_calls ONCE, BEFORE any tool messages
  convo.push(choice);

  // 2) Execute ALL tool calls and append their tool messages (no assistant message in between)
  for (const tc of choice.tool_calls) {
    const args = safeParse(tc.function.arguments);
    const result = await dispatchTool(tc.function.name, args, context);

    convo.push({
      role: "tool",
      tool_call_id: tc.id,
      name: tc.function.name,
      content: JSON.stringify(result),
    });
  }

  // 3) Final response after all tool results are appended
  const followup = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: convo,
  });

  const finalMsg = followup.choices[0].message;
  return { ok: true, answer: finalMsg.content ?? "" };
}
